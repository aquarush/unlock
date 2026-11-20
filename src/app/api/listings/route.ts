import { isValidAddress, normalizeAddress } from "@/lib/bch";
import { HttpError, body, ok, route, str } from "@/server/http";
import { publicListing, saveListing, type ContentKind, type Listing, type Secret } from "@/server/listings";
import { hashKey, randomId, verify } from "@/server/tokens";
import { identityForAddress, resolveIdentity, type SellerIdentity } from "@/server/identity";

export const maxDuration = 30;

const EMOJIS = ["📦", "🎁", "🔑", "💎", "📚", "🎨", "🎵", "🧠", "⚡", "🚀", "🎮", "📸"];

interface CreateBody {
  title?: string;
  description?: string;
  priceUsd?: number;
  sellerAddress?: string;
  sellerName?: string;
  kind?: ContentKind;
  text?: string;
  url?: string;
  file?: string; // signed upload token from /api/upload
  emoji?: string;
}

export const POST = route(async (req: Request) => {
  const b = await body<CreateBody>(req);
  const title = str(b.title, 90);
  if (title.length < 2) throw new HttpError(400, "Give your item a title");
  const priceUsd = Math.round(Number(b.priceUsd) * 100) / 100;
  if (!Number.isFinite(priceUsd) || priceUsd < 0.01 || priceUsd > 10_000) {
    throw new HttpError(400, "Price must be between $0.01 and $10,000");
  }
  // Sellers can give a BCH address, or a Nostr identity (npub / name@domain) that has a
  // verified BCH link. Either way, a verified identity is shown as a badge to buyers.
  const payTo = str(b.sellerAddress, 200);
  let sellerAddress = normalizeAddress(payTo);
  let sellerNostr: SellerIdentity | null = null;
  if (isValidAddress(sellerAddress)) {
    sellerNostr = await identityForAddress(sellerAddress);
  } else if (/^(npub1|nprofile1)|@|^[0-9a-f]{64}$/i.test(payTo) || /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(payTo)) {
    const resolved = await resolveIdentity(payTo);
    if (!resolved) throw new HttpError(400, "No verified BCH address is linked to that Nostr identity yet. Link one on the Identity page.");
    sellerAddress = resolved.address;
    sellerNostr = resolved.identity;
  } else {
    throw new HttpError(400, "Enter a valid Bitcoin Cash address (or a linked Nostr identity) to get paid");
  }

  const kind: ContentKind = b.kind === "link" || b.kind === "file" ? b.kind : "text";
  const secret: Secret = {};
  if (kind === "text") {
    secret.text = str(b.text, 50_000);
    if (!secret.text) throw new HttpError(400, "Add the content buyers will unlock");
  } else if (kind === "link") {
    const url = str(b.url, 2000);
    try {
      const u = new URL(url);
      if (!/^https?:$/.test(u.protocol)) throw new Error();
    } catch {
      throw new HttpError(400, "Enter a valid https:// link");
    }
    secret.url = url;
    if (b.text) secret.text = str(b.text, 5000);
  } else {
    const file = verify<{ url: string; name: string; size: number; type: string }>("upload", b.file ?? "");
    if (!file) throw new HttpError(400, "Upload a file first");
    secret.file = { url: file.url, name: file.name, size: file.size, type: file.type };
    if (b.text) secret.text = str(b.text, 5000);
  }

  const id = randomId(10);
  const manageKey = randomId(24);
  const listing: Listing = {
    id,
    title,
    description: str(b.description, 600),
    priceUsd,
    sellerAddress,
    sellerName: str(b.sellerName, 40) || sellerNostr?.name || undefined,
    sellerNostr: sellerNostr ?? undefined,
    kind,
    emoji: b.emoji && EMOJIS.includes(b.emoji) ? b.emoji : EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
    hue: Math.floor(Math.random() * 360),
    createdAt: Date.now(),
    sales: 0,
    earnedSats: 0,
  };
  await saveListing(listing, secret, hashKey(manageKey));
  return ok({ listing: publicListing(listing), manageKey });
});
