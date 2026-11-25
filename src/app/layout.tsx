import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { BlazeBanner } from "@/components/Banner";
import { Header } from "@/components/Header";
import { WalletProvider } from "@/components/WalletProvider";
import { SITE } from "@/lib/site";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk", weight: ["500", "700"] });

export const metadata: Metadata = {
  title: { default: "Unlock — sell anything for Bitcoin Cash", template: "%s · Unlock" },
  description: "Turn any file, link or secret into a Bitcoin Cash payment link. Buyers pay in one tap and get a CashToken NFT receipt.",
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
  openGraph: { title: "Unlock — sell anything for Bitcoin Cash", description: SITE.tagline, type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#0f0b09", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${grotesk.variable}`}>
      <body>
        <WalletProvider>
          <BlazeBanner />
          <Header />
          <main className="main">{children}</main>
          <footer className="footer">
            <span>🔓 Unlock · built on Bitcoin Cash with CashTokens + WizardConnect</span>
            <span>
              <a href={SITE.repoUrl} target="_blank" rel="noreferrer">Source</a> ·{" "}
              <a href={SITE.slidesUrl} target="_blank" rel="noreferrer">Presentation</a> · <a href="/about">How it works</a> · <a href="/xo">XO</a>
            </span>
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
