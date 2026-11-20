"use client";
import { useCallback, useEffect, useState } from "react";
import { accessStore, api, type AppConfig, type PublicListing, type Quote, type Secret } from "@/lib/api";
import { explorerTx, formatBch, formatUsd } from "@/lib/bch";
import { findReceipts, InsufficientFunds, payForListing, proveOwnership } from "@/lib/wallet";
import { useWallet } from "./WalletProvider";
import { SecretView } from "./SecretView";
import { Notice, Spinner } from "./ui";

type Step = "idle" | "connecting" | "signing" | "verifying" | "proving" | "done";

interface PurchaseResult {
  txid: string;
  buyerAddress: string | null;
  mintTxid: string | null;
  mintError: string | null;
}

export function BuyPanel({ listing }: { listing: PublicListing }) {
  const w = useWallet();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<Secret | null>(null);
  const [purchase, setPurchase] = useState<PurchaseResult | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);

  const loadQuote = useCallback(async () => {
    try {
      setQuote(await api<Quote>(`/api/listings/${listing.id}/quote`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [listing.id]);

  useEffect(() => {
    loadQuote();
    api<AppConfig>("/api/config").then(setConfig).catch(() => {});
    const t = setInterval(loadQuote, 5 * 60_000);
    return () => clearInterval(t);
  }, [loadQuote]);

  // Returning buyer on the same device: re-open with the saved access pass.
  useEffect(() => {
    const token = accessStore.get(listing.id);
    if (!token) return setCheckingAccess(false);
    api<{ secret: Secret }>("/api/content", { json: { listingId: listing.id, access: token } })
      .then((r) => {
        setSecret(r.secret);
        setStep("done");
      })
      .catch(() => {})
      .finally(() => setCheckingAccess(false));
  }, [listing.id]);

  async function buy() {
    setError(null);
    try {
      setStep("connecting");
      const manager = await w.connect();
      if (!manager) return setStep("idle");
      // Refresh quote if it is getting old.
      let q = quote;
      if (!q || q.expiresAt - Date.now() < 60_000) {
        q = await api<Quote>(`/api/listings/${listing.id}/quote`);
        setQuote(q);
      }
      setStep("signing");
      const txHex = await payForListing(manager, {
        listingId: listing.id,
        nonce: q.nonce,
        title: listing.title,
        sellerAddress: q.sellerAddress,
        sellerSats: q.sellerSats,
        feeAddress: q.feeAddress,
        feeSats: q.feeSats,
      });
      setStep("verifying");
      const res = await submitPurchase(txHex, q.token);
      accessStore.set(listing.id, res.access);
      setSecret(res.secret);
      setPurchase(res.purchase);
      setStep("done");
      w.refreshBalance();
      celebrate();
    } catch (e) {
      setStep("idle");
      if (e instanceof InsufficientFunds) {
        setError(`${e.message}. Top up your wallet with a little BCH and try again.`);
      } else setError((e as Error).message);
    }
  }

  async function submitPurchase(txHex: string, quoteToken: string) {
    // The payment is already broadcast; retry verification a few times on flaky networks.
    let last: unknown;
    for (let i = 0; i < 4; i++) {
      try {
        return await api<{ access: string; secret: Secret; purchase: PurchaseResult }>("/api/purchase", {
          json: { listingId: listing.id, quote: quoteToken, txHex },
        });
      } catch (e) {
        last = e;
        if (/not tagged|too low|not paid|missing|belongs|different checkout/i.test((e as Error).message)) break;
        await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
      }
    }
    throw last;
  }

  async function unlockWithReceipt() {
    setError(null);
    try {
      if (!config?.category) throw new Error("Receipts are not enabled on this server yet");
      setStep("connecting");
      const manager = await w.connect();
      if (!manager) return setStep("idle");
      setStep("proving");
      const receipts = await findReceipts(manager, config.category);
      const mine = receipts.find((r) => r.listingId === listing.id);
      if (!mine) throw new Error("No receipt NFT for this item in the connected wallet");
      const { nonce, challenge } = await api<{ nonce: string; challenge: string }>("/api/proof/challenge", {
        json: { listingId: listing.id },
      });
      const txHex = await proveOwnership(manager, mine, nonce);
      const res = await api<{ access: string; secret: Secret }>("/api/proof/verify", {
        json: { listingId: listing.id, challenge, txHex },
      });
      accessStore.set(listing.id, res.access);
      setSecret(res.secret);
      setStep("done");
    } catch (e) {
      setStep("idle");
      setError((e as Error).message);
    }
  }

  if (step === "done" && secret) {
    return (
      <div className="buy-done pop">
        <div className="unlocked-badge">🔓 Unlocked</div>
        <SecretView secret={secret} title={listing.title} />
        {purchase && (
          <div className="receipt">
            <div className="receipt-row">
              <span>Payment</span>
              <a href={explorerTx(purchase.txid)} target="_blank" rel="noreferrer">
                {purchase.txid.slice(0, 10)}… ↗
              </a>
            </div>
            <div className="receipt-row">
              <span>NFT receipt</span>
              {purchase.mintTxid ? (
                <a href={explorerTx(purchase.mintTxid)} target="_blank" rel="noreferrer">
                  Minted to your wallet ↗
                </a>
              ) : purchase.mintError ? (
                <RetryMint txid={purchase.txid} onDone={(m) => setPurchase({ ...purchase, mintTxid: m, mintError: null })} />
              ) : (
                <span className="muted">Not enabled</span>
              )}
            </div>
            <p className="tiny muted">
              Your receipt is a CashToken NFT. Open this item again from <a href="/library">My library</a> on any device, or gift and
              resell it from your wallet.
            </p>
          </div>
        )}
      </div>
    );
  }

  const busy = step !== "idle";
  const label: Record<Step, string> = {
    idle: "Unlock with BCH",
    connecting: "Waiting for your wallet…",
    signing: "Approve the payment in your wallet…",
    verifying: "Confirming payment on Bitcoin Cash…",
    proving: "Approve the ownership check in your wallet…",
    done: "Unlocked",
  };

  return (
    <div className="buy">
      <div className="price-big">
        <span className="usd">{formatUsd(listing.priceUsd)}</span>
        <span className="bch">{quote ? `≈ ${formatBch(quote.totalSats)}` : "…"}</span>
      </div>
      <button className="btn btn-primary btn-lg full glow" onClick={buy} disabled={busy || checkingAccess || !quote}>
        {busy ? <Spinner /> : "⚡"} {label[step]}
      </button>
      {quote && (
        <p className="tiny muted center">
          {formatUsd(listing.priceUsd)} to the seller + {formatUsd(quote.feeUsd)} NFT receipt · paid straight from your wallet
        </p>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {config?.minting && (
        <button className="link-btn center-block" onClick={unlockWithReceipt} disabled={busy}>
          Already bought it? Unlock with your receipt NFT
        </button>
      )}
      <div className="wallet-hint tiny muted">
        Works with <a href="https://www.paytaca.com" target="_blank" rel="noreferrer">Paytaca</a> and{" "}
        <a href="https://cashonize.com" target="_blank" rel="noreferrer">Cashonize</a> via WizardConnect. No account, no email.
      </div>
    </div>
  );
}

function RetryMint({ txid, onDone }: { txid: string; onDone: (mintTxid: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span>
      <button
        className="link-btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            const r = await api<{ mintTxid: string }>(`/api/receipt/${txid}`, { method: "POST" });
            onDone(r.mintTxid);
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Minting…" : "Mint my receipt"}
      </button>
      {err && <span className="tiny error-text"> {err}</span>}
    </span>
  );
}

function celebrate() {
  if (typeof document === "undefined") return;
  const root = document.createElement("div");
  root.className = "confetti";
  const colors = ["#ff7a18", "#ffb347", "#0ac18e", "#ffd166", "#ff4d6d"];
  for (let i = 0; i < 80; i++) {
    const p = document.createElement("i");
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = `${Math.random() * 0.4}s`;
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    root.appendChild(p);
  }
  document.body.appendChild(root);
  setTimeout(() => root.remove(), 2600);
}
