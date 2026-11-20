import Link from "next/link";
import { SITE } from "@/lib/site";

export const metadata = { title: "How it works" };

export default function About() {
  return (
    <div className="page prose">
      <h1 className="page-title">How Unlock works</h1>
      <p className="lead">Unlock turns anything digital into a Bitcoin Cash payment link. The buyer&apos;s receipt is a CashToken NFT they own.</p>

      <h2>For buyers</h2>
      <ol>
        <li>Open a link and tap <strong>Unlock with BCH</strong>.</li>
        <li>Scan the WizardConnect QR with Paytaca or Cashonize, then approve one payment.</li>
        <li>The content opens right away, and an NFT receipt lands in your wallet.</li>
        <li>On another device, open <Link href="/library">My library</Link>. Your wallet signs a proof that you hold the NFT, and nothing is sent.</li>
      </ol>

      <h2>Under the hood</h2>
      <ul>
        <li><strong>One payment transaction</strong> pays the seller and the receipt fee, with an <code>OP_RETURN</code> tag <code>UNLK &lt;item&gt;</code>. Your wallet signs it, so keys never leave your device.</li>
        <li><strong>Server-side verification</strong>: the server decodes the raw transaction, checks the outputs match a signed price quote, and broadcasts it if your wallet didn&apos;t. Each txid can unlock only once.</li>
        <li><strong>NFT receipt</strong>: a minting baton mints a CashToken NFT whose commitment is the item id, sent to the address that paid. Mints are serialized with a lock and funded by the receipt fee.</li>
        <li><strong>Proof of ownership</strong>: to re-open an item, your wallet signs (without broadcasting) a transaction that spends the receipt back to itself and commits to a one-time challenge. The server verifies it in the BCH virtual machine (libauth) and checks the NFT hasn&apos;t moved. If you sell or gift the NFT, access goes with it.</li>
      </ul>

      <h2>Fees</h2>
      <p>Listing is free. The seller gets 100% of the price. Buyers pay a receipt fee of 3% (minimum about 1¢), which covers minting the NFT. Network fees are fractions of a cent.</p>

      <p>
        <a href={SITE.repoUrl} target="_blank" rel="noreferrer">Source code</a> · <a href={SITE.slidesUrl} target="_blank" rel="noreferrer">Presentation</a>
      </p>
    </div>
  );
}
