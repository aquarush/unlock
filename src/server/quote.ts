import "server-only";
import { feeFor, SATS_PER_BCH } from "@/lib/bch";
import { feeAddress } from "./config";
import type { Listing } from "./listings";
import { bchUsd } from "./price";
import { randomId, sign, verify } from "./tokens";

export interface Quote {
  l: string;
  s: number; // seller sats
  f: number; // fee sats
  fa: string; // fee address
  u: number; // usd price
  r: number; // usd per BCH
  qe: number; // issued-until (soft expiry, checked by purchase)
  /** Secret per-quote nonce, written into the payment's OP_RETURN. Only the holder of this
   *  quote token can claim the payment, so copying someone else's on-chain payment is useless. */
  n: string;
}

const QUOTE_TTL = 20 * 60_000;

export async function makeQuote(listing: Listing) {
  const fa = feeAddress();
  if (!fa) throw new Error("Server is missing MINTER_WIF / FEE_ADDRESS");
  const rate = await bchUsd();
  const sellerSats = Math.max(1000, Math.round((listing.priceUsd / rate) * SATS_PER_BCH));
  const feeSats = feeFor(sellerSats);
  const q: Quote = { l: listing.id, s: sellerSats, f: feeSats, fa, u: listing.priceUsd, r: rate, qe: Date.now() + QUOTE_TTL, n: randomId(12) };
  return {
    token: sign("quote", q as unknown as Record<string, unknown>),
    sellerSats,
    feeSats,
    totalSats: sellerSats + feeSats,
    feeAddress: fa,
    sellerAddress: listing.sellerAddress,
    usdPerBch: rate,
    feeUsd: (feeSats / SATS_PER_BCH) * rate,
    expiresAt: q.qe,
    nonce: q.n,
  };
}

export const readQuote = (token: string) => verify<Quote & Record<string, unknown>>("quote", token);
