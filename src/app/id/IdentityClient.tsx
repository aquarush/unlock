"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { nip19 } from "nostr-tools";
import { useWallet } from "@/components/WalletProvider";
import { CopyButton, Notice, Spinner, shortAddr } from "@/components/ui";
import { api } from "@/lib/api";
import { SITE } from "@/lib/site";
import { authTemplate, lookup, linkEventTemplate, LINK_KIND, unlinkEventTemplate, type Lookup } from "@/lib/identity";
import { latestPerAuthor, publish, query, type PublishResult } from "@/lib/nostr";
import {
  createLocalSigner,
  exportLocalNsec,
  extensionSigner,
  forgetLocalSigner,
  hasExtension,
  importLocalSigner,
  savedLocalSigner,
  type NostrSigner,
} from "@/lib/nostr-signer";
import { signIdentityProof } from "@/lib/wallet";
import { browserFetchSource } from "./fetch-source";

const short = (npub: string) => `${npub.slice(0, 12)}…${npub.slice(-6)}`;

async function latestLinkEvent(pubkey: string) {
  const r = await query({ kinds: [LINK_KIND], authors: [pubkey] }, { timeoutMs: 4000 });
  return latestPerAuthor(r.events)[0];
}

export function IdentityClient() {
  const w = useWallet();
  const router = useRouter();
  const [signer, setSigner] = useState<NostrSigner | null>(null);
  const [ext, setExt] = useState(false);
  const [nsecInput, setNsecInput] = useState("");
  const [showBackup, setShowBackup] = useState(false);
  const [status, setStatus] = useState<Lookup | null>(null);
  const [checking, setChecking] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [published, setPublished] = useState<PublishResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signin, setSignin] = useState<{ pubkey: string; links: { address: string; relays: number }[]; profile: { name?: string } | null } | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    setSigner(savedLocalSigner());
    // Extensions inject window.nostr shortly after load.
    const t = setTimeout(() => setExt(hasExtension()), 400);
    return () => clearTimeout(t);
  }, []);

  const refresh = useCallback(async () => {
    if (!signer) return setStatus(null);
    setChecking(true);
    try {
      setStatus(await lookup(signer.pubkey, { fetchSource: browserFetchSource }));
    } finally {
      setChecking(false);
    }
  }, [signer]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const npub = signer ? nip19.npubEncode(signer.pubkey) : null;
  const linkedHere = status?.links.find((l) => l.address === w.address);

  async function run(label: string, fn: () => Promise<void>) {
    setError(null);
    setStep(label);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStep(null);
    }
  }

  const link = () =>
    run("link", async () => {
      if (!signer) throw new Error("Choose a Nostr key first");
      const manager = w.manager ?? (await w.connect());
      if (!manager) throw new Error("Connect your BCH wallet first");
      setPublished(null);
      setStep("Approve the proof in your wallet (nothing is sent)…");
      const { address, proof } = await signIdentityProof(manager, signer.pubkey);
      setStep("Signing with your Nostr key…");
      const existing = await latestLinkEvent(signer.pubkey);
      const event = await signer.sign(linkEventTemplate(address, proof, existing));
      setStep("Publishing to Nostr relays…");
      const results = await publish(event);
      setPublished(results);
      if (!results.some((r) => r.ok)) throw new Error("No relay accepted the event. Check your connection and try again.");
      await new Promise((r) => setTimeout(r, 1200));
      setStep("Verifying from the relays…");
      await refresh();
    });

  const unlink = (address: string) =>
    run("unlink", async () => {
      if (!signer) return;
      const existing = await latestLinkEvent(signer.pubkey);
      if (!existing) return;
      const results = await publish(await signer.sign(unlinkEventTemplate(address, existing)));
      if (!results.some((r) => r.ok)) throw new Error("No relay accepted the update");
      await new Promise((r) => setTimeout(r, 1200));
      await refresh();
    });

  const signIn = () =>
    run("signin", async () => {
      if (!signer) throw new Error("Choose a Nostr key first");
      setSignin(null);
      const ch = await api<{ nonce: string; token: string }>("/api/identity/challenge");
      const event = await signer.sign(authTemplate(ch.nonce, window.location.origin));
      setSignin(await api("/api/identity/auth", { json: { token: ch.token, event } }));
    });

  return (
    <div className="page">
      <div>
        <span className="pill">🪪 Self-sovereign identity</span>
        <h1 className="page-title" style={{ marginTop: 10 }}>Link your BCH wallet to Nostr</h1>
        <p className="lead">
          Two signatures that point at each other: your <b>Nostr key</b> vouches for your <b>BCH address</b>, and your BCH key vouches for
          your Nostr key. The link lives on public Nostr relays, so any app can verify it. No accounts, no database, no custodian.
          Then people can pay you at <code>npub…</code> or <code>you@domain</code> instead of a long address.
        </p>
      </div>

      <div className="grid2 id-grid">
        <div className="card stack" style={{ padding: 22 }}>
          <div className="row gap"><span className="step-n">1</span><h3 style={{ margin: 0 }}>Your Nostr key</h3></div>
          {signer && npub ? (
            <>
              <div className="link-box"><code>{npub}</code></div>
              <div className="row gap wrap">
                <span className="pill">{signer.source === "extension" ? "🧩 From your Nostr extension" : "🔐 Stored in this browser"}</span>
                <CopyButton text={npub} label="Copy npub" />
                {signer.source === "local" && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowBackup((s) => !s)}>{showBackup ? "Hide" : "Back up"} key</button>
                )}
                <button
                  className="link-btn"
                  onClick={() => {
                    if (signer.source === "local" && !confirm("Forget this key on this browser? Make sure you backed it up.")) return;
                    if (signer.source === "local") forgetLocalSigner();
                    setSigner(null);
                    setStatus(null);
                  }}
                >
                  Switch key
                </button>
              </div>
              {showBackup && (
                <Notice tone="error">
                  Your secret key: never share it. Save it in a password manager; you can import it into any Nostr app.
                  <div className="link-box" style={{ marginTop: 8 }}><code>{exportLocalNsec()}</code></div>
                </Notice>
              )}
            </>
          ) : (
            <>
              {ext && (
                <button className="btn btn-primary" onClick={() => run("ext", async () => setSigner(await extensionSigner()))}>
                  Use my Nostr extension
                </button>
              )}
              <button className={ext ? "btn btn-ghost" : "btn btn-primary"} onClick={() => setSigner(createLocalSigner())}>
                Create a new Nostr key
              </button>
              <form
                className="row gap"
                onSubmit={(e) => {
                  e.preventDefault();
                  try {
                    setSigner(importLocalSigner(nsecInput));
                    setNsecInput("");
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                <div className="field grow"><input placeholder="…or paste an nsec1 key" value={nsecInput} onChange={(e) => setNsecInput(e.target.value)} /></div>
                <button className="btn btn-ghost" disabled={!nsecInput}>Import</button>
              </form>
              <p className="tiny muted">Have Alby or nos2x? Install it and reload to sign with your existing Nostr identity.</p>
            </>
          )}
        </div>

        <div className="card stack" style={{ padding: 22 }}>
          <div className="row gap"><span className="step-n">2</span><h3 style={{ margin: 0 }}>Your BCH wallet</h3></div>
          {w.ready && w.address ? (
            <>
              <div className="link-box"><code>{w.address}</code></div>
              <span className="tiny muted">Connected with {w.walletName ?? "your wallet"} over WizardConnect. Your keys stay in your wallet.</span>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => w.connect()}>Connect BCH wallet</button>
          )}
          <div className="row gap"><span className="step-n">3</span><h3 style={{ margin: 0 }}>Link them</h3></div>
          {linkedHere ? (
            <Notice tone="ok">✓ This wallet is linked to your Nostr key, verified on {linkedHere.relays.length} relays.</Notice>
          ) : (
            <button className="btn btn-primary btn-lg" disabled={!signer || step !== null} onClick={link}>
              {step && step !== "signin" && step !== "unlink" && step !== "ext" ? <><Spinner /> {step === "link" ? "Working…" : step}</> : "🔗 Link wallet ⇄ Nostr"}
            </button>
          )}
          <p className="tiny muted">Your wallet signs a proof that can never be broadcast or move funds. Your Nostr key signs a NIP-39 identity event.</p>
        </div>
      </div>

      {published && (
        <div className="card" style={{ padding: 18 }}>
          <strong>Published to relays</strong>
          <ul className="checks" style={{ margin: "10px 0 0" }}>
            {published.map((r) => (
              <li key={r.url}>{r.ok ? "✅" : "⚠️"} {r.url.replace("wss://", "")} {r.ok ? "" : <span className="muted tiny">({r.message || "rejected"})</span>}</li>
            ))}
          </ul>
        </div>
      )}

      {signer && (
        <div className="card stack" style={{ padding: 22 }}>
          <div className="row gap wrap">
            <h3 style={{ margin: 0 }} className="grow">Your verified links</h3>
            <button className="link-btn" onClick={refresh}>{checking ? <Spinner /> : "↻"} Re-check relays</button>
          </div>
          {checking && !status ? (
            <span className="muted"><Spinner /> Asking public relays…</span>
          ) : status && status.links.length ? (
            status.links.map((l) => (
              <div key={l.address} className="row gap wrap">
                <span className="ok-text">✓</span>
                <code className="grow">{l.address}</code>
                <span className="tiny muted">{l.relays.length} relays · {l.mode === "virtual" ? "offline-verifiable" : "coin proof"}</span>
                <button className="link-btn" disabled={step !== null} onClick={() => unlink(l.address)}>Unlink</button>
              </div>
            ))
          ) : (
            <span className="muted">No BCH address linked to this key yet.</span>
          )}
          {status?.links.length ? (
            <div className="row gap wrap">
              <Link className="btn btn-ghost btn-sm" href={`/id/${npub}`}>View public profile →</Link>
              <Link className="btn btn-ghost btn-sm" href={`/?payto=${npub}`}>Sell under this identity →</Link>
            </div>
          ) : null}
        </div>
      )}

      <div className="grid2 id-grid">
        <div className="card stack" style={{ padding: 22 }}>
          <h3 style={{ margin: 0 }}>🔑 Sign in with your identity</h3>
          <p className="muted" style={{ margin: 0 }}>
            Challenge-response demo: the server sends a random nonce, your Nostr key signs it, and the server looks up your BCH links on public
            relays. Any app can do this without storing accounts.
          </p>
          <button className="btn btn-ghost" disabled={!signer || step !== null} onClick={signIn}>
            {step === "signin" ? <Spinner /> : null} Sign in
          </button>
          {signin && (
            <Notice tone="ok">
              Signed in as <b>{signin.profile?.name ?? short(nip19.npubEncode(signin.pubkey))}</b>.{" "}
              {signin.links.length
                ? <>Verified BCH: {signin.links.map((l) => shortAddr(l.address)).join(", ")}</>
                : "No BCH link found yet."}
            </Notice>
          )}
        </div>
        <form
          className="card stack"
          style={{ padding: 22 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) router.push(`/id/${encodeURIComponent(q.trim())}`);
          }}
        >
          <h3 style={{ margin: 0 }}>🔍 Look up anyone</h3>
          <p className="muted" style={{ margin: 0 }}>Enter an npub, a name@domain (NIP-05), or a BCH address. Both signatures are checked in your browser.</p>
          <div className="field"><input placeholder="npub1… / alice@example.com / bitcoincash:q…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <button className="btn btn-ghost" disabled={!q.trim()}>Verify</button>
        </form>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      <p className="tiny muted center">
        Open protocol: NIP-39 kind 10011 + a BCH signature. <a href={`${SITE.repoUrl.replace(/\/$/, "")}/blob/main/IDENTITY.md`} target="_blank" rel="noreferrer">Read the spec</a> · verify
        from the command line with <code>npm run verify-id</code>.
      </p>
    </div>
  );
}
