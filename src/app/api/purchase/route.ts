import { issueAccess } from "@/server/access";
import { HttpError, body, ok, route, str } from "@/server/http";
import { getListing, getPurchase, getSecret, patchPurchase, recordPurchase, type Purchase } from "@/server/listings";
import { mintReceipt } from "@/server/mint";
import { readQuote } from "@/server/quote";
import { verifyPayment } from "@/server/verify";
import { minter, tokenCategory } from "@/server/config";

export const maxDuration = 60;

const QUOTE_GRACE = 6 * 60 * 60_000;

export const POST = route(async (req: Request) => {
  const b = await body<{ listingId?: string; quote?: string; txHex?: string }>(req);
  const listingId = str(b.listingId, 20);
  const listing = await getListing(listingId);
  if (!listing) throw new HttpError(404, "This item does not exist");
  const quote = readQuote(b.quote ?? "");
  if (!quote || quote.l !== listingId) throw new HttpError(400, "Price quote is invalid — refresh and try again");
  if (quote.qe + QUOTE_GRACE < Date.now()) throw new HttpError(400, "Price quote expired — refresh and try again");

  const check = await verifyPayment(String(b.txHex ?? ""), {
    listingId,
    sellerAddress: listing.sellerAddress,
    sellerSats: quote.s,
    feeAddress: quote.fa,
    feeSats: quote.f,
  });

  let purchase: Purchase | null = await getPurchase(check.txid);
  if (!purchase) {
    const fresh: Purchase = {
      txid: check.txid,
      listingId,
      buyerAddress: check.buyerAddress,
      sellerSats: quote.s,
      feeSats: quote.f,
      usd: quote.u,
      at: Date.now(),
    };
    const created = await recordPurchase(fresh, listing);
    purchase = created ? fresh : await getPurchase(check.txid);
    // Mint the NFT receipt for brand-new purchases.
    if (created && purchase && purchase.buyerAddress && minter() && tokenCategory()) {
      try {
        purchase.mintTxid = await mintReceipt(purchase.buyerAddress, listingId);
        await patchPurchase(purchase.txid, { mintTxid: purchase.mintTxid });
      } catch (error) {
        purchase.mintError = (error as Error).message;
        await patchPurchase(purchase.txid, { mintError: purchase.mintError });
      }
    }
  }
  if (!purchase || purchase.listingId !== listingId) throw new HttpError(400, "This payment belongs to another item");

  const secret = await getSecret(listingId);
  return ok({
    access: issueAccess(listingId, { txid: purchase.txid }),
    secret,
    purchase: {
      txid: purchase.txid,
      buyerAddress: purchase.buyerAddress,
      mintTxid: purchase.mintTxid ?? null,
      mintError: purchase.mintError ?? null,
    },
  });
});
