"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type PublicListing } from "@/lib/api";
import { explorerTx, formatBch, formatUsd } from "@/lib/bch";
import { Cover, timeAgo } from "./ui";

interface Feed {
  sales: { listingId: string; title: string; emoji: string; usd: number; txid: string; at: number }[];
  totals: { sales: number; sats: number };
  listings: PublicListing[];
}

export function LiveFeed() {
  const [feed, setFeed] = useState<Feed | null>(null);
  useEffect(() => {
    const load = () => api<Feed>("/api/feed").then(setFeed).catch(() => {});
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);
  if (!feed) return null;
  return (
    <>
      <section className="stats">
        <div><strong>{feed.totals.sales.toLocaleString()}</strong><span>unlocks on mainnet</span></div>
        <div><strong>{formatBch(feed.totals.sats)}</strong><span>paid to creators</span></div>
        <div><strong>{feed.listings.length ? `${feed.listings.length}+` : "0"}</strong><span>items for sale</span></div>
      </section>
      {feed.sales.length > 0 && (
        <section className="section">
          <h2 className="h2"><span className="dot-live" /> Live unlocks</h2>
          <ul className="ticker">
            {feed.sales.map((s) => (
              <li key={s.txid}>
                <span className="ticker-emoji">{s.emoji}</span>
                <Link href={`/p/${s.listingId}`}>{s.title}</Link>
                <span className="muted">unlocked for {formatUsd(s.usd)}</span>
                <a className="muted tiny" href={explorerTx(s.txid)} target="_blank" rel="noreferrer">{timeAgo(s.at)} ↗</a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {feed.listings.length > 0 && (
        <section className="section">
          <h2 className="h2">Fresh drops</h2>
          <div className="grid3">
            {feed.listings.map((l) => (
              <Link key={l.id} href={`/p/${l.id}`} className="card tile">
                <Cover emoji={l.emoji} hue={l.hue} size="sm" />
                <div className="tile-body">
                  <strong>{l.title}</strong>
                  <span className="muted tiny">{l.sales} sold</span>
                </div>
                <span className="tile-price">{formatUsd(l.priceUsd)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
