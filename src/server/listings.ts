import "server-only";
import type { SellerIdentity } from "./identity";
import { db } from "./store";

export type ContentKind = "text" | "link" | "file";

export interface Listing {
  id: string;
  title: string;
  description: string;
  priceUsd: number;
  sellerAddress: string;
  sellerName?: string;
  /** Verified BCH ⇄ Nostr identity of the seller (checked when the listing was created). */
  sellerNostr?: SellerIdentity;
  kind: ContentKind;
  emoji: string;
  hue: number;
  createdAt: number;
  sales: number;
  earnedSats: number;
}

export interface Secret {
  text?: string;
  url?: string;
  file?: { url: string; name: string; size: number; type: string };
}

export interface Purchase {
  txid: string;
  listingId: string;
  buyerAddress: string | null;
  sellerSats: number;
  feeSats: number;
  usd: number;
  at: number;
  mintTxid?: string;
  mintError?: string;
}

export interface PublicSale {
  listingId: string;
  title: string;
  emoji: string;
  usd: number;
  txid: string;
  at: number;
}

const k = {
  listing: (id: string) => `listing:${id}`,
  secret: (id: string) => `secret:${id}`,
  manage: (id: string) => `manage:${id}`,
  purchase: (txid: string) => `purchase:${txid}`,
  sales: (id: string) => `sales:${id}`,
  recent: "recent-sales",
  featured: "featured-listings",
};

export const getListing = (id: string) => db().get<Listing>(k.listing(id));
export const getSecret = (id: string) => db().get<Secret>(k.secret(id));
export const getManageHash = (id: string) => db().get<string>(k.manage(id));
export const getPurchase = (txid: string) => db().get<Purchase>(k.purchase(txid));
export const listSales = (id: string, n = 50) => db().lrange<Purchase>(k.sales(id), 0, n - 1);
export const recentSales = (n = 12) => db().lrange<PublicSale>(k.recent, 0, n - 1);
export const listedIds = (n = 30) => db().lrange<string>(k.featured, 0, n - 1);

export async function saveListing(listing: Listing, secret: Secret, manageHash: string) {
  await db().set(k.secret(listing.id), secret);
  await db().set(k.manage(listing.id), manageHash);
  await db().set(k.listing(listing.id), listing);
  await db().lpush(k.featured, listing.id, 200);
}

export async function updateListing(listing: Listing, secret?: Secret) {
  if (secret) await db().set(k.secret(listing.id), secret);
  await db().set(k.listing(listing.id), listing);
}

/** Records a purchase exactly once per txid. Returns false if it already existed. */
export async function recordPurchase(p: Purchase, listing: Listing): Promise<boolean> {
  const fresh = await db().set(k.purchase(p.txid), p, { nx: true });
  if (!fresh) return false;
  await db().lpush(k.sales(p.listingId), p, 1000);
  const latest = (await getListing(listing.id)) ?? listing;
  latest.sales += 1;
  latest.earnedSats += p.sellerSats;
  await db().set(k.listing(listing.id), latest);
  await db().lpush(k.recent, {
    listingId: listing.id,
    title: listing.title,
    emoji: listing.emoji,
    usd: p.usd,
    txid: p.txid,
    at: p.at,
  } satisfies PublicSale, 50);
  await db().incrby("stats:sales", 1);
  await db().incrby("stats:sats", p.sellerSats + p.feeSats);
  return true;
}

export async function patchPurchase(txid: string, patch: Partial<Purchase>) {
  const p = await getPurchase(txid);
  if (!p) return;
  await db().set(k.purchase(txid), { ...p, ...patch });
}

export async function stats() {
  const [sales, sats] = await Promise.all([db().get<number>("stats:sales"), db().get<number>("stats:sats")]);
  return { sales: Number(sales ?? 0), sats: Number(sats ?? 0) };
}

/** Shape returned to the public (never includes the secret). */
export function publicListing(l: Listing) {
  return {
    id: l.id,
    title: l.title,
    description: l.description,
    priceUsd: l.priceUsd,
    sellerAddress: l.sellerAddress,
    sellerName: l.sellerName ?? null,
    sellerNostr: l.sellerNostr ? { npub: l.sellerNostr.npub, name: l.sellerNostr.name ?? null, picture: l.sellerNostr.picture ?? null, nip05: l.sellerNostr.nip05 ?? null } : null,
    kind: l.kind,
    emoji: l.emoji,
    hue: l.hue,
    createdAt: l.createdAt,
    sales: l.sales,
  };
}
export type PublicListing = ReturnType<typeof publicListing>;
