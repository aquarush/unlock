"use client";
// Nostr key access in the browser: a NIP-07 extension (Alby, nos2x, …) if present,
// otherwise a key kept in this browser's localStorage. Keys never leave the browser.
import { finalizeEvent, generateSecretKey, getPublicKey, nip19, type Event, type EventTemplate } from "nostr-tools";
import { bytesToHex, hexToBytes } from "nostr-tools/utils";

declare global {
  interface Window {
    nostr?: { getPublicKey(): Promise<string>; signEvent(e: EventTemplate): Promise<Event> };
  }
}

export interface NostrSigner {
  pubkey: string;
  source: "extension" | "local";
  sign(template: EventTemplate): Promise<Event>;
}

const STORE = "unlock:nostr-sk";

function readLocal(): Uint8Array | null {
  try {
    const hex = localStorage.getItem(STORE);
    return hex && /^[0-9a-f]{64}$/.test(hex) ? hexToBytes(hex) : null;
  } catch {
    return null;
  }
}

function localSigner(sk: Uint8Array): NostrSigner {
  return { pubkey: getPublicKey(sk), source: "local", sign: async (t) => finalizeEvent(t, sk) };
}

export const hasExtension = () => typeof window !== "undefined" && Boolean(window.nostr);

export async function extensionSigner(): Promise<NostrSigner> {
  if (!window.nostr) throw new Error("No Nostr extension found");
  const ext = window.nostr;
  const pubkey = await ext.getPublicKey();
  return { pubkey, source: "extension", sign: (t) => ext.signEvent(t) };
}

/** The saved browser key, if any. */
export function savedLocalSigner(): NostrSigner | null {
  const sk = readLocal();
  return sk ? localSigner(sk) : null;
}

export function createLocalSigner(): NostrSigner {
  const sk = generateSecretKey();
  try {
    localStorage.setItem(STORE, bytesToHex(sk));
  } catch {}
  return localSigner(sk);
}

export function importLocalSigner(nsec: string): NostrSigner {
  const d = nip19.decode(nsec.trim());
  if (d.type !== "nsec") throw new Error("That is not an nsec key");
  try {
    localStorage.setItem(STORE, bytesToHex(d.data));
  } catch {}
  return localSigner(d.data);
}

export function exportLocalNsec(): string | null {
  const sk = readLocal();
  return sk ? nip19.nsecEncode(sk) : null;
}

export function forgetLocalSigner() {
  try {
    localStorage.removeItem(STORE);
  } catch {}
}
