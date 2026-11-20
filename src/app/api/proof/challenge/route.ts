import { randomBytes } from "node:crypto";
import { tokenCategory } from "@/server/config";
import { HttpError, body, ok, route, str } from "@/server/http";
import { sign } from "@/server/tokens";

export const POST = route(async (req: Request) => {
  const b = await body<{ listingId?: string }>(req);
  const listingId = str(b.listingId, 20);
  const category = tokenCategory();
  if (!category) throw new HttpError(503, "Receipts are not enabled on this server");
  const nonce = randomBytes(12).toString("hex");
  return ok({ nonce, category, challenge: sign("challenge", { l: listingId, n: nonce, exp: Date.now() + 10 * 60_000 }) });
});
