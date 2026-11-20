import { verifyEvent, type Event } from "nostr-tools";
import { AUTH_KIND, lookup } from "@/lib/identity";
import { HttpError, body, ok, route } from "@/server/http";
import { fetchSource } from "@/server/identity";
import { db } from "@/server/store";
import { verify } from "@/server/tokens";

export const maxDuration = 30;

/**
 * Step 2 of sign-in: the user signed a kind-22242 event containing our nonce with their
 * Nostr key. We check the signature + nonce, then look up and verify their BCH links on
 * public relays. No account database: the identity *is* the key pair.
 */
export const POST = route(async (req: Request) => {
  const b = await body<{ token?: string; event?: Event }>(req);
  const ch = verify<{ n: string }>("id-challenge", b.token);
  if (!ch) throw new HttpError(400, "Challenge expired. Try again.");
  const ev = b.event;
  if (!ev || ev.kind !== AUTH_KIND || !verifyEvent(ev)) throw new HttpError(401, "Invalid Nostr signature");
  if (ev.tags.find((t) => t[0] === "challenge")?.[1] !== ch.n) throw new HttpError(401, "Signature is for a different challenge");
  if (Math.abs(ev.created_at - Date.now() / 1000) > 600) throw new HttpError(401, "Signature is too old");
  // Each challenge can be used once (no replays).
  if (!(await db().set(`id-nonce:${ch.n}`, 1, { nx: true, ex: 600 }))) throw new HttpError(401, "This challenge was already used");

  const r = await lookup(ev.pubkey, { fetchSource, timeoutMs: 4500 });
  return ok({
    pubkey: ev.pubkey,
    links: r.links.map((l) => ({ address: l.address, mode: l.mode, relays: l.relays.length })),
    profile: r.profiles[ev.pubkey] ?? null,
  });
});
