"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CreateForm } from "@/components/CreateForm";
import { LiveFeed } from "@/components/LiveFeed";
import { api, type AppConfig } from "@/lib/api";
import { SITE } from "@/lib/site";

export function HomeClient() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  useEffect(() => {
    api<AppConfig>("/api/config").then(setConfig).catch(() => {});
  }, []);

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="pill">⚡ Instant · Non-custodial · ~$0.001 fees</span>
          <h1>
            Sell anything for <span className="grad">Bitcoin Cash</span>.<br />
            With one link.
          </h1>
          <p className="lead">
            Paste a secret, a link or a file. Set a price. Share the link. Buyers pay from their wallet in one tap and get a{" "}
            <strong>CashToken NFT receipt</strong>: a license they own, can open on any device, and can gift or resell.
          </p>
          <ul className="checks">
            <li>💸 Money goes straight to your wallet, no middleman holds it</li>
            <li>🪪 No accounts, no emails, no chargebacks</li>
            <li>🎟️ Every sale mints an NFT receipt on BCH mainnet</li>
          </ul>
          {SITE.demoListing && (
            <Link href={`/p/${SITE.demoListing}`} className="btn btn-ghost">
              👀 Try buying a 5¢ demo item →
            </Link>
          )}
        </div>
        <div className="hero-form">
          <CreateForm config={config} />
        </div>
      </section>

      <section className="section how">
        <h2 className="h2">How it works</h2>
        <div className="grid3">
          <div className="card step"><span className="step-n">1</span><h3>Create</h3><p className="muted">Add content and a price in USD. Connect your wallet with WizardConnect to fill in your payout address.</p></div>
          <div className="card step"><span className="step-n">2</span><h3>Share</h3><p className="muted">Post the link or QR on X, Telegram, your site or in person. The content stays hidden until someone pays.</p></div>
          <div className="card step"><span className="step-n">3</span><h3>Get paid</h3><p className="muted">The buyer approves one BCH payment. The server checks it on-chain, unlocks the content and mints their NFT receipt.</p></div>
        </div>
      </section>

      <LiveFeed />

      <section className="section usecases">
        <h2 className="h2">Made for</h2>
        <div className="chips big">
          {["🧠 AI prompt packs", "📚 Guides & e-books", "🎨 Art & wallpapers", "🎵 Beats & samples", "🎮 Game keys", "🎟️ Event & Discord access", "💻 Code snippets", "📸 Presets"].map((c) => (
            <span key={c} className="chip">{c}</span>
          ))}
        </div>
      </section>
    </>
  );
}
