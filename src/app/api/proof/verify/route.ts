import { issueAccess } from "@/server/access";
import { tokenCategory } from "@/server/config";
import { HttpError, body, ok, route, str } from "@/server/http";
import { getSecret } from "@/server/listings";
import { verify } from "@/server/tokens";
import { verifyOwnershipProof } from "@/server/verify";

export const maxDuration = 30;

export const POST = route(async (req: Request) => {
  const b = await body<{ listingId?: string; challenge?: string; txHex?: string }>(req);
  const listingId = str(b.listingId, 20);
  const category = tokenCategory();
  if (!category) throw new HttpError(503, "Receipts are not enabled on this server");
  const ch = verify<{ l: string; n: string }>("challenge", b.challenge);
  if (!ch || ch.l !== listingId) throw new HttpError(400, "Challenge expired — try again");
  const { holder } = await verifyOwnershipProof(String(b.txHex ?? ""), { listingId, nonce: ch.n, category });
  const secret = await getSecret(listingId);
  return ok({ access: issueAccess(listingId, { holder }), secret, holder });
});
