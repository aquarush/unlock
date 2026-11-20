import { checkAccess } from "@/server/access";
import { HttpError, body, ok, route, str } from "@/server/http";
import { getSecret } from "@/server/listings";

export const POST = route(async (req: Request) => {
  const b = await body<{ listingId?: string; access?: string }>(req);
  const listingId = str(b.listingId, 20);
  if (!checkAccess(listingId, b.access)) throw new HttpError(403, "No access pass for this item");
  const secret = await getSecret(listingId);
  if (!secret) throw new HttpError(404, "Content not found");
  return ok({ secret });
});
