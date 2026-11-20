import { minter, tokenCategory } from "@/server/config";
import { HttpError, ok, route } from "@/server/http";
import { getPurchase, patchPurchase } from "@/server/listings";
import { mintReceipt } from "@/server/mint";
import { db } from "@/server/store";

export const maxDuration = 60;

/** Retry a receipt mint that failed (e.g. minter was briefly out of funds). */
export const POST = route(async (_req: Request, ctx: { params: Promise<{ txid: string }> }) => {
  const { txid } = await ctx.params;
  const p = await getPurchase(txid);
  if (!p) throw new HttpError(404, "Purchase not found");
  if (p.mintTxid) return ok({ mintTxid: p.mintTxid });
  if (!p.buyerAddress || !minter() || !tokenCategory()) throw new HttpError(503, "Receipts are not enabled");
  if (!(await db().set(`mint-retry:${txid}`, 1, { nx: true, ex: 120 }))) throw new HttpError(429, "Already retrying — wait a minute");
  const mintTxid = await mintReceipt(p.buyerAddress, p.listingId);
  await patchPurchase(txid, { mintTxid, mintError: undefined });
  return ok({ mintTxid });
});
