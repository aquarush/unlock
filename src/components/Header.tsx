"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatBch } from "@/lib/bch";
import { useWallet } from "./WalletProvider";
import { shortAddr, Spinner } from "./ui";

export function Header() {
  const w = useWallet();
  const path = usePathname();
  const nav = [
    { href: "/", label: "Sell" },
    { href: "/library", label: "My library" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/id", label: "Identity" },
  ];
  return (
    <header className="header">
      <Link href="/" className="logo">
        <span className="logo-mark">🔓</span><span>Unlock<span className="logo-dot">.cash</span></span>
      </Link>
      <nav className="nav">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className={path === n.href ? "active" : ""}>
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="wallet-btn">
        {w.ready && w.address ? (
          <button className="btn btn-ghost btn-sm" onClick={() => w.disconnect()} title="Disconnect">
            <span className="dot-live" /> {w.walletName ?? "Wallet"} · {shortAddr(w.address)}
            {w.balance != null && <span className="muted"> · {formatBch(w.balance)}</span>}
          </button>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={() => w.connect()} disabled={w.connecting && false}>
            {w.connecting ? <Spinner /> : null} Connect wallet
          </button>
        )}
      </div>
    </header>
  );
}
