import "server-only";
import { db } from "./store";

type Source = () => Promise<number>;

const sources: Source[] = [
  async () => {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin-cash&vs_currencies=usd", {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    return Number((await r.json())["bitcoin-cash"].usd);
  },
  async () => {
    const r = await fetch("https://api.coinbase.com/v2/prices/BCH-USD/spot", { cache: "no-store", signal: AbortSignal.timeout(4000) });
    return Number((await r.json()).data.amount);
  },
  async () => {
    const r = await fetch("https://api.kraken.com/0/public/Ticker?pair=BCHUSD", { cache: "no-store", signal: AbortSignal.timeout(4000) });
    const j = await r.json();
    const first = Object.values(j.result as Record<string, { c: string[] }>)[0];
    return Number(first.c[0]);
  },
];

let memo: { usd: number; at: number } | null = null;

/** BCH/USD spot price, cached ~60s (memory + KV), with multiple fallbacks. */
export async function bchUsd(): Promise<number> {
  if (memo && Date.now() - memo.at < 60_000) return memo.usd;
  const cached = await db().get<{ usd: number; at: number }>("price:bchusd").catch(() => null);
  if (cached && Date.now() - cached.at < 60_000) {
    memo = cached;
    return cached.usd;
  }
  for (const source of sources) {
    try {
      const usd = await source();
      if (Number.isFinite(usd) && usd > 1) {
        memo = { usd, at: Date.now() };
        await db().set("price:bchusd", memo).catch(() => {});
        return usd;
      }
    } catch {
      // try next source
    }
  }
  if (cached) return cached.usd; // stale but better than nothing
  throw new Error("Could not fetch the BCH price right now");
}
