import { SITE } from "@/lib/site";
import { IS_CHIPNET } from "@/lib/network";
import { CopyButton } from "./ui";

/** Required BCH BLAZE 2026 banner: slides, source code, EMBER2026 donation address. */
export function BlazeBanner() {
  return (
    <div className="blaze">
      <div className="blaze-inner">
        <span className="blaze-tag">🔥 BCH BLAZE 2026 entry</span>
        {IS_CHIPNET && <span className="blaze-tag" style={{ background: "#2563eb" }}>🧪 CHIPNET — test money only</span>}
        <a href={SITE.slidesUrl} target="_blank" rel="noreferrer">📊 Presentation</a>
        <a href={SITE.repoUrl} target="_blank" rel="noreferrer">💻 Source code</a>
        {SITE.donationAddress ? (
          <span className="blaze-donate">
            🗳️ Vote with EMBER2026:
            <code title={SITE.donationAddress}>{SITE.donationAddress.replace(/^[a-z]+:/, "").slice(0, 10)}…{SITE.donationAddress.slice(-6)}</code>
            <CopyButton text={SITE.donationAddress} className="blaze-copy" />
          </span>
        ) : null}
      </div>
    </div>
  );
}
