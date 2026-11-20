"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CopyButton, Notice, Qr, Spinner } from "@/components/ui";
import { explorerAddress } from "@/lib/bch";
import { lookup, type Lookup } from "@/lib/identity";
import { browserFetchSource } from "../fetch-source";

export function LookupClient({ q }: { q: string }) {
  const [res, setRes] = useState<Lookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ms, setMs] = useState(0);

  useEffect(() => {
    const t = Date.now();
    lookup(q, { fetchSource: browserFetchSource })
      .then((r) => {
        setRes(r);
        setMs(Date.now() - t);
      })
      .catch((e) => setError((e as Error).message));
  }, [q]);

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <Link href="/id" className="tiny">← Identity</Link>
      <h1 className="page-title" style={{ fontSize: 30, wordBreak: "break-all" }}>{q}</h1>
      {!res && !error && <div className="card empty"><Spinner /> Asking public Nostr relays and checking signatures in your browser…</div>}
      {error && <Notice tone="error">{error}</Notice>}
      {res && res.links.length === 0 && (
        <div className="card empty">
          <p>No verified BCH ⇄ Nostr link found for this identity.</p>
          {res.failures.length > 0 && (
            <Notice tone="error">Found {res.failures.length} claim(s) that failed verification: {res.failures[0].error}</Notice>
          )}
          <span className="tiny">Checked {res.relaysAnswered.length} relays.</span>
          <Link className="btn btn-primary btn-sm" href="/id">Link your own →</Link>
        </div>
      )}
      {res?.links.map((l) => {
        const p = res.profiles[l.pubkey] ?? {};
        return (
          <div key={`${l.pubkey}:${l.address}`} className="card stack" style={{ padding: 24 }}>
            <div className="row gap">
              {p.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.picture} alt="" width={56} height={56} style={{ borderRadius: 14, objectFit: "cover" }} />
              ) : (
                <span className="step-n" style={{ width: 56, height: 56, fontSize: 24, margin: 0 }}>🪪</span>
              )}
              <div className="grow" style={{ minWidth: 0 }}>
                <h2 style={{ margin: 0 }}>{p.name ?? "Nostr user"} <span className="pill pill-green" style={{ fontSize: 13 }}>✓ Verified</span></h2>
                {p.nip05 && <div className="tiny muted">{p.nip05}</div>}
              </div>
            </div>
            {p.about && <p className="muted" style={{ margin: 0 }}>{p.about}</p>}
            <ul className="checks" style={{ margin: 0 }}>
              <li>✅ Nostr key <code>{l.npub.slice(0, 16)}…</code> signed a NIP-39 claim to this BCH address</li>
              <li>✅ The BCH key of this address signed a proof naming that Nostr key{l.mode === "virtual" ? " (offline-verifiable, can never move funds)" : " (over a real coin)"}</li>
              <li>✅ Found on {l.relays.length} public relay{l.relays.length === 1 ? "" : "s"} · linked {new Date(l.createdAt * 1000).toLocaleDateString()}</li>
              <li>✅ Verified in your browser in {(ms / 1000).toFixed(1)}s, with no Unlock server involved</li>
            </ul>
            <div className="row gap wrap" style={{ alignItems: "center" }}>
              <Qr value={l.address} size={150} />
              <div className="stack grow" style={{ minWidth: 0 }}>
                <strong>Pay this identity</strong>
                <div className="link-box"><code>{l.address}</code></div>
                <div className="row gap wrap">
                  <CopyButton text={l.address} label="Copy address" />
                  <a className="btn btn-ghost btn-sm" href={l.address}>Open in wallet</a>
                  <a className="btn btn-ghost btn-sm" href={explorerAddress(l.address)} target="_blank" rel="noreferrer">Explorer ↗</a>
                </div>
              </div>
            </div>
            <details className="import">
              <summary>Technical details</summary>
              <div className="tiny muted stack" style={{ marginTop: 8, wordBreak: "break-all" }}>
                <span>Nostr pubkey: <code>{l.pubkey}</code></span>
                <span>Event (kind 10011): <code>{l.eventId}</code></span>
                <span>Relays: {l.relays.join(", ")}</span>
              </div>
            </details>
          </div>
        );
      })}
    </div>
  );
}
