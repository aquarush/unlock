import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyPanel } from "@/components/BuyPanel";
import { Cover } from "@/components/ui";
import { getListing, publicListing } from "@/server/listings";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const l = await getListing(id).catch(() => null);
  if (!l) return { title: "Not found" };
  return {
    title: `${l.title} — $${l.priceUsd} in BCH`,
    description: l.description || `Unlock "${l.title}" for $${l.priceUsd} in Bitcoin Cash.`,
    openGraph: { title: `${l.emoji} ${l.title} — $${l.priceUsd} in BCH`, description: l.description || "Pay with Bitcoin Cash, unlock instantly, get an NFT receipt." },
  };
}

export default async function ListingPage({ params }: Props) {
  const { id } = await params;
  const l = await getListing(id);
  if (!l) notFound();
  const listing = publicListing(l);
  const kindLabel = { text: "✍️ Secret text", link: "🔗 Private link", file: "📎 File download" }[listing.kind];
  return (
    <div className="listing">
      <div className="card listing-card">
        <Cover emoji={listing.emoji} hue={listing.hue} />
        <div className="listing-body">
          <div className="row gap wrap">
            <span className="pill">{kindLabel}</span>
            {listing.sales > 0 && <span className="pill pill-green">🔥 {listing.sales} sold</span>}
          </div>
          <h1 className="listing-title">{listing.title}</h1>
          {listing.sellerNostr && (
            <Link href={`/id/${listing.sellerNostr.npub}`} className="seller-id">
              {listing.sellerNostr.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={listing.sellerNostr.picture} alt="" width={22} height={22} />
              ) : (
                <span>🪪</span>
              )}
              <span>{listing.sellerNostr.name ?? `${listing.sellerNostr.npub.slice(0, 14)}…`}</span>
              <span className="ok-text">✓ Nostr-verified seller</span>
            </Link>
          )}
          {listing.description && <p className="lead">{listing.description}</p>}
          <BuyPanel listing={listing} />
        </div>
      </div>
      <p className="tiny muted center">
        Sold by {listing.sellerAddress.replace(/^[a-z]+:/, "").slice(0, 8)}… · Payments go directly to the seller on Bitcoin Cash.
      </p>
    </div>
  );
}
