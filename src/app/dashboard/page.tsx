"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Cover, CopyButton, Notice, Qr, Spinner, timeAgo } from "@/components/ui";
import { api, myListings, type MyListing, type PublicListing } from "@/lib/api";
import { explorerTx, formatBch, formatUsd } from "@/lib/bch";

interface Manage {
  listing: PublicListing & { earnedSats: number };
  sales: { txid: string; usd: number; sats: number; at: number; buyer: string | null; mintTxid: string | null }[];
}

export default function Dashboard() {
  const [mine, setMine] = useState<MyListing[] | null>(null);
  const [data, setData] = useState<Record<string, Manage | { error: string }>>({});
  const [importId, setImportId] = useState("");
  const [importKey, setImportKey] = useState("");

  useEffect(() => setMine(myListings.all()), []);

  useEffect(() => {
    if (!mine) return;
    for (const m of mine) {
      api<Manage>(`/api/listings/${m.id}/manage`, { json: { key: m.key } })
        .then((d) => setData((x) => ({ ...x, [m.id]: d })))
        .catch((e) => setData((x) => ({ ...x, [m.id]: { error: e.message } })));
    }
  }, [mine]);

  const totals = Object.values(data).reduce(
    (t, d) => ("listing" in d ? { sales: t.sales + d.listing.sales, sats: t.sats + d.listing.earnedSats } : t),
    { sales: 0, sats: 0 },
  );

  return (
    <div className="page">
      <h1 className="page-title">Seller dashboard</h1>
      <p className="lead">Your payment links on this device. Payouts are already in your wallet. Unlock never holds your money.</p>
      {mine && mine.length > 0 && (
        <section className="stats">
          <div><strong>{mine.length}</strong><span>links</span></div>
          <div><strong>{totals.sales}</strong><span>sales</span></div>
          <div><strong>{formatBch(totals.sats)}</strong><span>earned</span></div>
        </section>
      )}
      {mine === null ? (
        <div className="card empty"><Spinner /></div>
      ) : mine.length === 0 ? (
        <div className="card empty">
          <p>You haven&apos;t created any links on this device yet.</p>
          <Link className="btn btn-primary" href="/">Create your first link →</Link>
        </div>
      ) : (
        <div className="stack">
          {mine.map((m) => {
            const d = data[m.id];
            const link = typeof window !== "undefined" ? `${window.location.origin}/p/${m.id}` : `/p/${m.id}`;
            return (
              <div key={m.id} className="card dash-item">
                <div className="dash-head">
                  {d && "listing" in d ? <Cover emoji={d.listing.emoji} hue={d.listing.hue} size="sm" /> : <Cover emoji="📦" hue={30} size="sm" />}
                  <div className="grow">
                    <Link href={`/p/${m.id}`}><strong>{m.title}</strong></Link>
                    <div className="tiny muted">
                      {d && "listing" in d ? `${formatUsd(d.listing.priceUsd)} · ${d.listing.sales} sold · ${formatBch(d.listing.earnedSats)} earned` : d && "error" in d ? d.error : "Loading…"}
                    </div>
                  </div>
                  <CopyButton text={link} label="Copy link" />
                  <details className="qr-pop">
                    <summary className="btn btn-ghost btn-sm">QR</summary>
                    <div className="qr-pop-body"><Qr value={link} size={180} /></div>
                  </details>
                </div>
                {d && "sales" in d && d.sales.length > 0 && (
                  <table className="sales">
                    <tbody>
                      {d.sales.slice(0, 8).map((s) => (
                        <tr key={s.txid}>
                          <td>{timeAgo(s.at)}</td>
                          <td>{formatUsd(s.usd)}</td>
                          <td className="muted">{formatBch(s.sats)}</td>
                          <td><a href={explorerTx(s.txid)} target="_blank" rel="noreferrer">tx ↗</a></td>
                          <td>{s.mintTxid ? <a href={explorerTx(s.mintTxid)} target="_blank" rel="noreferrer">NFT ↗</a> : <span className="muted">–</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}
      <details className="card import">
        <summary>Restore a link with its manage key</summary>
        <form
          className="row gap wrap"
          onSubmit={(e) => {
            e.preventDefault();
            const id = importId.trim().split("/").pop() || "";
            if (!id || !importKey.trim()) return;
            myListings.add({ id, title: id, key: importKey.trim(), createdAt: Date.now() });
            setMine(myListings.all());
          }}
        >
          <input placeholder="Link or item id" value={importId} onChange={(e) => setImportId(e.target.value)} />
          <input placeholder="Manage key" value={importKey} onChange={(e) => setImportKey(e.target.value)} />
          <button className="btn btn-ghost">Restore</button>
        </form>
        <Notice>Manage keys are shown once when you create a link. Keep them somewhere safe.</Notice>
      </details>
    </div>
  );
}
