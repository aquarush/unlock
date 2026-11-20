// BCH ⇄ Nostr identity links (see IDENTITY.md for the full spec).
//
// A link is two signatures that point at each other:
//   • Nostr → BCH: a NIP-39 kind-10011 event, signed by the Nostr key, with the tag
//       ["i", "<cashaddr>", "<proof tx hex>"]
//   • BCH → Nostr: <proof tx hex> is a Bitcoin Cash transaction signed by the address's
//     key (never broadcast) whose OP_RETURN says
//       "BCHNOSTR" "Verifying that I control the following Nostr public key: <npub>"
//
// Anyone can find links on public relays (by npub, or by address via the "#i" filter)
// and verify both signatures locally. No server, no database, no custodian.
import {
  binToHex,
  createVirtualMachineBch,
  decodeTransaction,
  hexToBin,
  sha256,
  utf8ToBin,
  type Output,
  type Transaction,
} from "@bitauth/libauth";
import { nip19, verifyEvent, type Event } from "nostr-tools";
import { isValidAddress, lockingBytecode, opReturn, p2pkhPubkey, parseOpReturn, pubkeyToAddress } from "./bch";
import { latestPerAuthor, query, RELAYS } from "./nostr";

export const LINK_KIND = 10011;
export const LINK_TAG = "BCHNOSTR";
/** NIP-39's standard verification sentence. */
export const statement = (npub: string) => `Verifying that I control the following Nostr public key: ${npub}`;

/**
 * Proofs normally spend a *virtual* coin (like BIP-322): an outpoint that cannot exist on
 * chain, derived from the address + Nostr key. The proof can therefore never be broadcast
 * or move funds, and verifying it needs no blockchain access at all.
 */
export function virtualOutpoint(address: string, pubkeyHex: string): string {
  return binToHex(sha256.hash(utf8ToBin(`bch-nostr-link:v1:${address}:${pubkeyHex.toLowerCase()}`)));
}

export const VIRTUAL_VALUE = 0n;

/** Unsigned proof transaction + the source outputs a wallet needs to sign it. */
export function unsignedVirtualProof(address: string, pubkeyHex: string) {
  const npub = nip19.npubEncode(pubkeyHex);
  const transaction: Transaction = {
    version: 2,
    locktime: 0,
    inputs: [
      {
        outpointTransactionHash: hexToBin(virtualOutpoint(address, pubkeyHex)),
        outpointIndex: 0,
        sequenceNumber: 0,
        unlockingBytecode: new Uint8Array(),
      },
    ],
    outputs: [{ lockingBytecode: opReturn(LINK_TAG, statement(npub)), valueSatoshis: 0n }],
  };
  const sourceOutputs: Output[] = [{ lockingBytecode: lockingBytecode(address), valueSatoshis: VIRTUAL_VALUE }];
  return { transaction, sourceOutputs };
}

export type FetchSource = (txid: string, vout: number) => Promise<Output>;

export interface ProofCheck {
  ok: boolean;
  /** "virtual" = offline-verifiable proof; "utxo" = spends a real coin (needs a chain lookup). */
  mode?: "virtual" | "utxo";
  error?: string;
}

/** Verify the BCH side: `proofHex` is signed by `address`'s key and names `pubkeyHex`. */
export async function verifyBchProof(
  proofHex: string,
  address: string,
  pubkeyHex: string,
  fetchSource?: FetchSource,
): Promise<ProofCheck> {
  try {
    const tx = decodeTransaction(hexToBin(proofHex));
    if (typeof tx === "string") return { ok: false, error: `Proof is not a valid transaction: ${tx}` };
    if (!tx.inputs.length || tx.inputs.length > 4) return { ok: false, error: "Unexpected proof shape" };

    // 1. The OP_RETURN must name this Nostr key (NIP-39: accept any text containing the npub).
    const npub = nip19.npubEncode(pubkeyHex);
    const named = tx.outputs.some((o) => {
      const p = parseOpReturn(o.lockingBytecode);
      return p?.[0] === LINK_TAG && (p[1] ?? "").includes(npub);
    });
    if (!named) return { ok: false, error: "BCH proof does not name this Nostr key" };

    // 2. Input 0 must be signed by this address's key.
    const pub = p2pkhPubkey(tx.inputs[0].unlockingBytecode);
    if (!pub) return { ok: false, error: "BCH proof is not signed by a P2PKH key" };
    if (binToHex(lockingBytecode(pubkeyToAddress(pub))) !== binToHex(lockingBytecode(address))) {
      return { ok: false, error: "BCH proof is signed by a different address" };
    }

    // 3. Rebuild what was signed and check every signature with the BCH virtual machine.
    const virtual = virtualOutpoint(address, pubkeyHex);
    let mode: "virtual" | "utxo" = "virtual";
    const sourceOutputs: Output[] = [];
    for (const input of tx.inputs) {
      const txid = binToHex(input.outpointTransactionHash);
      if (txid === virtual && input.outpointIndex === 0) {
        sourceOutputs.push({ lockingBytecode: lockingBytecode(address), valueSatoshis: VIRTUAL_VALUE });
      } else {
        if (!fetchSource) return { ok: false, error: "Proof spends a real coin; a blockchain lookup is needed" };
        mode = "utxo";
        sourceOutputs.push(await fetchSource(txid, input.outpointIndex));
      }
    }
    const result = createVirtualMachineBch(false).verify({ transaction: tx, sourceOutputs });
    if (result !== true) return { ok: false, error: `BCH signature check failed: ${result}` };
    return { ok: true, mode };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface LinkClaim {
  address: string;
  proof: string;
}

/** The BCH address claims inside a kind-10011 event (other NIP-39 claims are ignored). */
export function bchClaims(event: Event): LinkClaim[] {
  return event.tags
    .filter((t) => t[0] === "i" && typeof t[1] === "string" && typeof t[2] === "string" && isValidAddress(t[1]))
    .map((t) => ({ address: t[1], proof: t[2] }));
}

export interface VerifiedLink {
  pubkey: string;
  npub: string;
  address: string;
  eventId: string;
  createdAt: number;
  mode: "virtual" | "utxo";
  relays: string[];
}

export interface LinkFailure {
  pubkey: string;
  address: string;
  error: string;
}

/** Verify both directions of every BCH claim in `event`. */
export async function verifyLinkEvent(event: Event, fetchSource?: FetchSource) {
  const verified: VerifiedLink[] = [];
  const failed: LinkFailure[] = [];
  if (event.kind !== LINK_KIND || !verifyEvent(event)) {
    return { verified, failed: [{ pubkey: event.pubkey, address: "", error: "Nostr signature is invalid" }] };
  }
  for (const c of bchClaims(event)) {
    const r = await verifyBchProof(c.proof, c.address, event.pubkey, fetchSource);
    if (r.ok) {
      verified.push({
        pubkey: event.pubkey,
        npub: nip19.npubEncode(event.pubkey),
        address: c.address,
        eventId: event.id,
        createdAt: event.created_at,
        mode: r.mode!,
        relays: [],
      });
    } else failed.push({ pubkey: event.pubkey, address: c.address, error: r.error! });
  }
  return { verified, failed };
}

export interface Profile {
  name?: string;
  picture?: string;
  nip05?: string;
  about?: string;
}

export function parseProfile(event?: Event): Profile {
  if (!event) return {};
  try {
    const j = JSON.parse(event.content);
    return {
      name: String(j.display_name || j.name || "").slice(0, 60) || undefined,
      picture: typeof j.picture === "string" && /^https:\/\//.test(j.picture) ? j.picture : undefined,
      nip05: typeof j.nip05 === "string" ? j.nip05.slice(0, 100) : undefined,
      about: typeof j.about === "string" ? j.about.slice(0, 300) : undefined,
    };
  } catch {
    return {};
  }
}

export type Query = { kind: "pubkey"; pubkey: string } | { kind: "address"; address: string };

/** Parse npub / nprofile / hex pubkey / cashaddr. (NIP-05 names are resolved separately.) */
export function parseQuery(q: string): Query | null {
  const s = q.trim();
  if (/^[0-9a-f]{64}$/i.test(s)) return { kind: "pubkey", pubkey: s.toLowerCase() };
  if (/^(npub|nprofile)1/.test(s)) {
    try {
      const d = nip19.decode(s);
      if (d.type === "npub") return { kind: "pubkey", pubkey: d.data };
      if (d.type === "nprofile") return { kind: "pubkey", pubkey: d.data.pubkey };
    } catch {}
    return null;
  }
  if (isValidAddress(s)) return { kind: "address", address: s };
  return null;
}

/** NIP-05 (name@domain) → hex pubkey. */
export async function resolveNip05(name: string): Promise<string | null> {
  const m = name.trim().toLowerCase().match(/^(?:([a-z0-9._-]+)@)?([a-z0-9.-]+\.[a-z]{2,})$/);
  if (!m) return null;
  const [, local = "_", domain] = m;
  try {
    const r = await fetch(`https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(local)}`, {
      signal: AbortSignal.timeout(5000),
    });
    const j = await r.json();
    const pk = j?.names?.[local];
    return typeof pk === "string" && /^[0-9a-f]{64}$/.test(pk) ? pk : null;
  } catch {
    return null;
  }
}

export interface Lookup {
  links: VerifiedLink[];
  failures: LinkFailure[];
  profiles: Record<string, Profile>;
  relaysAnswered: string[];
}

/** Find and fully verify BCH⇄Nostr links for an npub/pubkey, cashaddr, or NIP-05 name. */
export async function lookup(input: string, opts: { fetchSource?: FetchSource; relays?: string[]; timeoutMs?: number } = {}): Promise<Lookup> {
  let q = parseQuery(input);
  if (!q && input.includes(".")) {
    const pk = await resolveNip05(input);
    if (pk) q = { kind: "pubkey", pubkey: pk };
  }
  const empty: Lookup = { links: [], failures: [], profiles: {}, relaysAnswered: [] };
  if (!q) return empty;
  const relays = opts.relays ?? RELAYS;
  const filter = q.kind === "pubkey" ? { kinds: [LINK_KIND], authors: [q.pubkey] } : { kinds: [LINK_KIND], "#i": [q.address] };
  // For a known pubkey, fetch the profile in parallel with the link.
  const profileQuery = q.kind === "pubkey" ? query({ kinds: [0], authors: [q.pubkey] }, { relays, timeoutMs: opts.timeoutMs }) : null;
  const res = await query(filter, { relays, timeoutMs: opts.timeoutMs });
  const out: Lookup = { ...empty, relaysAnswered: res.relaysAnswered };
  for (const ev of latestPerAuthor(res.events.filter((e) => e.kind === LINK_KIND))) {
    const { verified, failed } = await verifyLinkEvent(ev, opts.fetchSource);
    for (const v of verified) {
      if (q.kind === "address" && v.address !== q.address) continue;
      out.links.push({ ...v, relays: res.seenOn[ev.id] ?? [] });
    }
    out.failures.push(...failed.filter((f) => q!.kind === "pubkey" || f.address === (q as { address: string }).address));
  }
  const authors = [...new Set(out.links.map((l) => l.pubkey))];
  if (authors.length) {
    const profiles = (await profileQuery) ?? (await query({ kinds: [0], authors }, { relays, timeoutMs: opts.timeoutMs }));
    for (const p of latestPerAuthor(profiles.events)) if (verifyEvent(p)) out.profiles[p.pubkey] = parseProfile(p);
  }
  return out;
}

/** Build the (unsigned) kind-10011 event, keeping any existing non-BCH NIP-39 claims. */
export function linkEventTemplate(address: string, proofHex: string, existing?: Event) {
  const kept = (existing?.tags ?? []).filter((t) => !(t[0] === "i" && typeof t[1] === "string" && isValidAddress(t[1]) && t[1] === address));
  return {
    kind: LINK_KIND,
    created_at: Math.max(Math.floor(Date.now() / 1000), (existing?.created_at ?? 0) + 1),
    tags: [...kept, ["i", address, proofHex]],
    content: existing?.content ?? "",
  };
}

/** Template with the BCH claim for `address` removed (unlink). */
export function unlinkEventTemplate(address: string, existing: Event) {
  return {
    kind: LINK_KIND,
    created_at: Math.max(Math.floor(Date.now() / 1000), existing.created_at + 1),
    tags: existing.tags.filter((t) => !(t[0] === "i" && t[1] === address)),
    content: existing.content,
  };
}

/** Challenge-response sign-in: the user signs this kind-22242 event with their Nostr key. */
export const AUTH_KIND = 22242;
export const authTemplate = (challenge: string, origin: string) => ({
  kind: AUTH_KIND,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ["challenge", challenge],
    ["relay", origin],
  ],
  content: "Sign in with your BCH ⇄ Nostr identity",
});
