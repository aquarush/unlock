import { timingSafeEqual } from "node:crypto";
import { HttpError, body, ok, route } from "@/server/http";
import { getListing, getManageHash, listSales, publicListing } from "@/server/listings";
import { hashKey } from "@/server/tokens";

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { key } = await body<{ key?: string }>(req);
  const [listing, stored] = await Promise.all([getListing(id), getManageHash(id)]);
  if (!listing || !stored || !key) throw new HttpError(404, "Not found");
  const a = Buffer.from(hashKey(key));
  const b = Buffer.from(stored);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(403, "Wrong manage key");
  const sales = await listSales(id, 100);
  return ok({
    listing: { ...publicListing(listing), earnedSats: listing.earnedSats },
    sales: sales.map((s) => ({ txid: s.txid, usd: s.usd, sats: s.sellerSats, at: s.at, buyer: s.buyerAddress, mintTxid: s.mintTxid ?? null })),
  });
});
