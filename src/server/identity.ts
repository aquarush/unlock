import "server-only";
import { decodeTransaction, hexToBin, type Output } from "@bitauth/libauth";
import { lookup, type FetchSource, type Profile, type VerifiedLink } from "@/lib/identity";
import { getRawTx } from "@/lib/electrum";

/** Source-output lookup for proofs that spend a real coin. */
export const fetchSource: FetchSource = async (txid, vout): Promise<Output> => {
  const tx = decodeTransaction(hexToBin(await getRawTx(txid)));
  if (typeof tx === "string" || !tx.outputs[vout]) throw new Error("Proof coin not found on chain");
  return tx.outputs[vout];
};

export interface SellerIdentity {
  pubkey: string;
  npub: string;
  name?: string;
  picture?: string;
  nip05?: string;
  verifiedAt: number;
}

const toSeller = (link: VerifiedLink, profile: Profile = {}): SellerIdentity => ({
  pubkey: link.pubkey,
  npub: link.npub,
  name: profile.name,
  picture: profile.picture,
  nip05: profile.nip05,
  verifiedAt: Date.now(),
});

/** npub / NIP-05 / hex pubkey → its verified BCH address (on this network). */
export async function resolveIdentity(input: string): Promise<{ address: string; identity: SellerIdentity } | null> {
  const r = await lookup(input, { fetchSource, timeoutMs: 4500 });
  const link = r.links.sort((a, b) => b.createdAt - a.createdAt)[0];
  return link ? { address: link.address, identity: toSeller(link, r.profiles[link.pubkey]) } : null;
}

/** Verified Nostr identity linked to `address`, if any (best effort, short timeout). */
export async function identityForAddress(address: string): Promise<SellerIdentity | null> {
  try {
    const r = await lookup(address, { fetchSource, timeoutMs: 3500 });
    const link = r.links.sort((a, b) => b.createdAt - a.createdAt)[0];
    return link ? toSeller(link, r.profiles[link.pubkey]) : null;
  } catch {
    return null;
  }
}
