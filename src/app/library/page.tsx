"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { Cover, Notice, Spinner } from "@/components/ui";
import { accessStore, api, type AppConfig, type PublicListing } from "@/lib/api";
import { formatUsd } from "@/lib/bch";
import { findReceipts, proveOwnership, type Receipt } from "@/lib/wallet";

interface Item {
  receipt: Receipt;
  listing: PublicListing | null;
}

export default function Library() {
  const w = useWallet();
  const router = useRouter();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<AppConfig>("/api/config").then(setConfig).catch((e) => setError(e.message));
  }, []);

  const load = useCallback(async () => {
    if (!w.manager || !config?.category) return;
    setLoading(true);
    setError(null);
    try {
      const receipts = await findReceipts(w.manager, config.category);
      const listings = await Promise.all(
        receipts.map((r) => api<{ listing: PublicListing }>(`/api/listings/${r.listingId}`).then((x) => x.listing).catch(() => null)),
      );
      setItems(receipts.map((receipt, i) => ({ receipt, listing: listings[i] })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [w.manager, config?.category]);

  useEffect(() => {
    load();
  }, [load]);

  async function open(item: Item) {
    if (!w.manager) return;
    const id = item.receipt.listingId;
    if (accessStore.get(id)) return router.push(`/p/${id}`);
    setOpening(id);
    setError(null);
    try {
      const { nonce, challenge } = await api<{ nonce: string; challenge: string }>("/api/proof/challenge", { json: { listingId: id } });
      const txHex = await proveOwnership(w.manager, item.receipt, nonce);
      const res = await api<{ access: string }>("/api/proof/verify", { json: { listingId: id, challenge, txHex } });
      accessStore.set(id, res.access);
      router.push(`/p/${id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOpening(null);
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">My library</h1>
      <p className="lead">Everything you&apos;ve unlocked, held in your own wallet as CashToken NFTs. Open it on any device. No account needed.</p>
      {config && !config.minting && <Notice>Receipt NFTs are not enabled on this server yet.</Notice>}
      {!w.ready ? (
        <div className="card empty">
          <p>Connect your wallet to see your receipts.</p>
          <button className="btn btn-primary" onClick={() => w.connect()}>Connect wallet</button>
        </div>
      ) : loading && !items ? (
        <div className="card empty"><Spinner /> Scanning your wallet for receipts…</div>
      ) : items && items.length === 0 ? (
        <div className="card empty">
          <p>No receipts yet. Anything you buy on Unlock shows up here.</p>
        </div>
      ) : (
        <div className="grid3">
          {items?.map((it) => (
            <div key={`${it.receipt.coin.utxo.tx_hash}:${it.receipt.coin.utxo.tx_pos}`} className="card tile tile-col">
              {it.listing ? <Cover emoji={it.listing.emoji} hue={it.listing.hue} size="sm" /> : <Cover emoji="🎟️" hue={20} size="sm" />}
              <div className="tile-body">
                <strong>{it.listing?.title ?? `Item ${it.receipt.listingId}`}</strong>
                <span className="muted tiny">{it.listing ? `Bought for ${formatUsd(it.listing.priceUsd)}` : "Listing removed"}</span>
              </div>
              <button className="btn btn-primary btn-sm" disabled={!it.listing || opening !== null} onClick={() => open(it)}>
                {opening === it.receipt.listingId ? <><Spinner /> Approve in wallet…</> : "Open 🔓"}
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {w.ready && <button className="link-btn" onClick={load}>↻ Rescan wallet</button>}
    </div>
  );
}
