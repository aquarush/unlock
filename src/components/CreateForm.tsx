"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, myListings, type AppConfig, type PublicListing } from "@/lib/api";
import { isValidAddress, normalizeAddress } from "@/lib/bch";
import { PREFIX } from "@/lib/network";
import { useWallet } from "./WalletProvider";
import { CopyButton, Notice, Qr, Spinner } from "./ui";

type Kind = "text" | "link" | "file";
const PRICES = [0.05, 1, 5, 20];
const EMOJIS = ["📦", "🎁", "🔑", "💎", "📚", "🎨", "🎵", "🧠", "⚡", "🚀", "🎮", "📸"];

export function CreateForm({ config }: { config: AppConfig | null }) {
  const w = useWallet();
  const [kind, setKind] = useState<Kind>("text");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<{ token: string; name: string; size: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [price, setPrice] = useState("1");
  const [address, setAddress] = useState("");
  const [emoji, setEmoji] = useState("🎁");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ listing: PublicListing; manageKey: string } | null>(null);

  // /?payto=npub1… (from the Identity page) pre-fills a Nostr identity as the payout.
  useEffect(() => {
    const payto = new URLSearchParams(window.location.search).get("payto");
    if (payto) setAddress(payto);
  }, []);

  useEffect(() => {
    if (w.address && !address) setAddress(w.address);
  }, [w.address, address]);

  const isIdentity = /^(npub1|nprofile1)[0-9a-z]+$|^[^\s@]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(address.trim());
  const addressOk = isIdentity || isValidAddress(normalizeAddress(address || "x"));

  async function upload(f: File) {
    setError(null);
    if (f.size > 4 * 1024 * 1024) return setError("Files up to 4 MB are supported");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFile(data);
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ listing: PublicListing; manageKey: string }>("/api/listings", {
        json: {
          title,
          description,
          priceUsd: Number(price),
          sellerAddress: isIdentity ? address.trim() : normalizeAddress(address),
          kind,
          text,
          url,
          file: file?.token,
          emoji,
        },
      });
      myListings.add({ id: res.listing.id, title: res.listing.title, key: res.manageKey, createdAt: Date.now() });
      setCreated(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    const link = `${window.location.origin}/p/${created.listing.id}`;
    const tweet = `I'm selling "${created.listing.title}" for $${created.listing.priceUsd} in Bitcoin Cash 🔓 Pay, unlock, and get an NFT receipt:\n${link}\n\n#BitcoinCash #BCH #BCHBLAZE`;
    return (
      <div className="card create-done pop">
        <div className="done-head">
          <span className="done-emoji">{created.listing.emoji}</span>
          <div>
            <h3>Your link is live 🎉</h3>
            <p className="muted">Share it anywhere. Buyers pay you straight to your wallet, and each one gets an NFT receipt.</p>
          </div>
        </div>
        <div className="share-row">
          <Qr value={link} size={148} />
          <div className="share-actions">
            <div className="link-box">
              <code>{link}</code>
            </div>
            <div className="row gap">
              <CopyButton text={link} label="Copy link" className="btn btn-primary" />
              <a className="btn btn-ghost" href={`https://x.com/intent/tweet?text=${encodeURIComponent(tweet)}`} target="_blank" rel="noreferrer">
                Share on X
              </a>
              <Link className="btn btn-ghost" href={`/p/${created.listing.id}`}>
                Open page →
              </Link>
            </div>
            <p className="tiny muted">
              Saved to your <Link href="/dashboard">dashboard</Link> on this device. Back up your manage key:{" "}
              <code className="key">{created.manageKey}</code> <CopyButton text={created.manageKey} className="link-btn" />
            </p>
          </div>
        </div>
        <button className="link-btn" onClick={() => { setCreated(null); setTitle(""); setText(""); setUrl(""); setFile(null); setDescription(""); }}>
          + Sell something else
        </button>
      </div>
    );
  }

  return (
    <form className="card create" onSubmit={submit}>
      <div className="tabs" role="tablist">
        {(
          [
            ["text", "✍️ Secret text"],
            ["link", "🔗 Private link"],
            ["file", "📎 File"],
          ] as const
        ).map(([k, label]) => (
          <button
            type="button"
            key={k}
            role="tab"
            aria-selected={kind === k}
            className={kind === k ? "tab active" : "tab"}
            onClick={() => setKind(k)}
            disabled={k === "file" && config !== null && !config.uploads}
            title={k === "file" && config && !config.uploads ? "File uploads are not enabled on this server" : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="field">
        <span>What are you selling?</span>
        <div className="title-row">
          <select className="emoji-pick" value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label="Icon">
            {EMOJIS.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. My Midjourney prompt pack" maxLength={90} required />
        </div>
      </label>

      {kind === "text" && (
        <label className="field">
          <span>Content buyers unlock <em className="muted">(hidden until paid)</em></span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Paste your secret: a guide, a code, a prompt, a discount key…" required />
        </label>
      )}
      {kind === "link" && (
        <label className="field">
          <span>Private link <em className="muted">(hidden until paid)</em></span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} type="url" placeholder="https://drive.google.com/… or a Notion page, course, Discord invite" required />
        </label>
      )}
      {kind === "file" && (
        <label className="field">
          <span>File <em className="muted">(up to 4 MB, hidden until paid)</em></span>
          <div className="drop">
            {uploading ? (
              <span><Spinner /> Uploading…</span>
            ) : file ? (
              <span>✅ {file.name} <em className="muted">({Math.ceil(file.size / 1024)} KB)</em></span>
            ) : (
              <span>Drop or choose a file</span>
            )}
            <input type="file" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </div>
        </label>
      )}

      <label className="field">
        <span>Short description <em className="muted">(public, optional)</em></span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What buyers get, in one line" maxLength={600} />
      </label>

      <div className="grid2">
        <label className="field">
          <span>Price (USD, paid in BCH)</span>
          <div className="price-row">
            <span className="prefix">$</span>
            <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="0.01" step="0.01" required />
          </div>
          <div className="chips">
            {PRICES.map((p) => (
              <button type="button" key={p} className={Number(price) === p ? "chip active" : "chip"} onClick={() => setPrice(String(p))}>
                ${p}
              </button>
            ))}
          </div>
        </label>
        <label className="field">
          <span>Get paid to</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={`${PREFIX}:q… or npub1… / you@domain`}
            className={address && !addressOk ? "invalid" : ""}
            required
          />
          {isIdentity ? (
            <span className="tiny ok-text">🪪 Paid to the BCH address verified for this Nostr identity</span>
          ) : !w.ready ? (
            <button type="button" className="link-btn" onClick={() => w.connect()}>
              ⚡ Fill from my wallet (WizardConnect)
            </button>
          ) : (
            <span className="tiny ok-text">✓ Connected wallet address</span>
          )}
        </label>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <button className="btn btn-primary btn-lg full" disabled={busy || uploading || (kind === "file" && !file)}>
        {busy ? <Spinner /> : "🔓"} Create my payment link
      </button>
      <p className="tiny muted center">Free to list. Buyers pay you directly; a tiny receipt fee (3%, min. under 1¢) mints their NFT receipt.</p>
    </form>
  );
}
