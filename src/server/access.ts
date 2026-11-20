import "server-only";
import { sign, verify } from "./tokens";

/** Access passes are bearer tokens scoped to one listing. */
export const issueAccess = (listingId: string, via: { txid?: string; holder?: string }) =>
  sign("access", { l: listingId, ...via, iat: Date.now() });

export function checkAccess(listingId: string, token: string | undefined) {
  const data = verify<{ l: string; txid?: string; holder?: string }>("access", token);
  return data && data.l === listingId ? data : null;
}
