import { randomBytes } from "node:crypto";
import { ok, route } from "@/server/http";
import { sign } from "@/server/tokens";

/** Step 1 of challenge-response sign-in: a fresh, server-signed nonce. */
export const GET = route(async () => {
  const nonce = randomBytes(16).toString("hex");
  return ok({ nonce, token: sign("id-challenge", { n: nonce, exp: Date.now() + 5 * 60_000 }) });
});
