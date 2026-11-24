import { SITE } from "@/lib/site";
import { IS_CHIPNET } from "@/lib/network";
import { CopyButton } from "./ui";

/** Required BCH BLAZE 2026 banner: presentation, source code, EMBER2026 donation (CashTokens) address. */
export function BlazeBanner() {
  return (
    <div className="blaze" role="region" aria-label="BCH BLAZE 2026 entry">
      <div className="blaze-inner">
        <span className="blaze-tag">🔥 BCH BLAZE 2026 entry</span>
        {IS_CHIPNET && <span className="blaze-tag" style={{ background: "#2563eb" }}>🧪 CHIPNET — test money only</span>}
        <a href={SITE.slidesUrl} target="_blank" rel="noreferrer">📊 Presentation</a>
        {SITE.videoUrl && <a href={SITE.videoUrl} target="_blank" rel="noreferrer">🎬 Video</a>}
        <a href={SITE.repoUrl} target="_blank" rel="noreferrer">💻 Source code</a>
        {SITE.donationAddress ? (
          <span className="blaze-donate">
            <span>🗳️ Vote with EMBER2026 · CashTokens address:</span>
            <code>{SITE.donationAddress}</code>
            <CopyButton text={SITE.donationAddress} className="blaze-copy" />
          </span>
        ) : null}
      </div>
    </div>
  );
}
