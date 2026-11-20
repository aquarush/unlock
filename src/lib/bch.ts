// Shared (browser + server) Bitcoin Cash helpers.
import {
  binToHex,
  binToUtf8,
  cashAddressToLockingBytecode,
  decodeAuthenticationInstructions,
  decodeCashAddress,
  encodeCashAddress,
  encodeDataPush,
  flattenBinArray,
  hash160,
  hexToBin,
  lockingBytecodeToCashAddress,
  utf8ToBin,
} from "@bitauth/libauth";
import { EXPLORER, PREFIX } from "./network";

export const SATS_PER_BCH = 100_000_000;
export const DUST = 546;
/** Satoshis locked in each NFT receipt output. */
export const NFT_SATS = 1200;
/** OP_RETURN tag used to bind a payment to a listing. */
export const MEMO_TAG = "UNLK";
/** OP_RETURN tag used for ownership proofs (never broadcast). */
export const PROOF_TAG = "UNLKPROOF";
export const FEE_PER_BYTE = 1.1;

export function lockingBytecode(address: string): Uint8Array {
  const decoded = cashAddressToLockingBytecode(address);
  if (typeof decoded === "string") throw new Error(`Invalid address: ${decoded}`);
  return decoded.bytecode;
}

export function isValidAddress(address: string): boolean {
  try {
    lockingBytecode(address);
    return address.startsWith(`${PREFIX}:`);
  } catch {
    return false;
  }
}

export function normalizeAddress(input: string): string {
  const trimmed = input.trim();
  return trimmed.includes(":") ? trimmed : `${PREFIX}:${trimmed}`;
}

/** Convert any P2PKH cashaddr to its token-aware (z...) form. */
export function toTokenAddress(address: string): string {
  const decoded = decodeCashAddress(address);
  if (typeof decoded === "string") throw new Error(decoded);
  const type = decoded.type === "p2pkh" || decoded.type === "p2pkhWithTokens" ? "p2pkhWithTokens" : "p2shWithTokens";
  return encodeCashAddress({ prefix: PREFIX, type, payload: decoded.payload }).address;
}

/** Convert any cashaddr to its plain (q.../p...) form. */
export function toPlainAddress(address: string): string {
  const decoded = decodeCashAddress(address);
  if (typeof decoded === "string") throw new Error(decoded);
  const type = decoded.type.startsWith("p2pkh") ? "p2pkh" : "p2sh";
  return encodeCashAddress({ prefix: PREFIX, type, payload: decoded.payload }).address;
}

export function pubkeyToAddress(pubkey: Uint8Array, tokenAware = false): string {
  return encodeCashAddress({
    prefix: PREFIX,
    type: tokenAware ? "p2pkhWithTokens" : "p2pkh",
    payload: hash160(pubkey),
  }).address;
}

export function bytecodeToAddress(bytecode: Uint8Array, tokenAware = false): string | null {
  const result = lockingBytecodeToCashAddress({ bytecode, prefix: PREFIX, tokenSupport: tokenAware });
  return typeof result === "string" ? null : result.address;
}

export function opReturn(...pushes: (string | Uint8Array)[]): Uint8Array {
  return flattenBinArray([
    Uint8Array.of(0x6a),
    ...pushes.map((p) => encodeDataPush(typeof p === "string" ? utf8ToBin(p) : p)),
  ]);
}

/** Returns the UTF-8 pushes of an OP_RETURN output, or null. */
export function parseOpReturn(bytecode: Uint8Array): string[] | null {
  if (bytecode[0] !== 0x6a) return null;
  try {
    return decodeAuthenticationInstructions(bytecode.slice(1)).map((ins) =>
      "data" in ins ? binToUtf8(ins.data) : "",
    );
  } catch {
    return null;
  }
}

/** Extracts the public key from a standard P2PKH unlocking script (<sig> <pubkey>). */
export function p2pkhPubkey(unlocking: Uint8Array): Uint8Array | null {
  try {
    const ins = decodeAuthenticationInstructions(unlocking);
    if (ins.length !== 2) return null;
    const last = ins[1];
    if (!("data" in last)) return null;
    const key = last.data;
    if (key.length === 33 && (key[0] === 2 || key[0] === 3)) return key;
    if (key.length === 65 && key[0] === 4) return key;
    return null;
  } catch {
    return null;
  }
}

export const commitmentFor = (listingId: string) => binToHex(utf8ToBin(listingId));
export const listingFromCommitment = (hex: string) => {
  try {
    return binToUtf8(hexToBin(hex));
  } catch {
    return "";
  }
};

export const satsToBch = (sats: number) => sats / SATS_PER_BCH;
export const formatBch = (sats: number) => {
  const bch = satsToBch(sats);
  return `${bch.toFixed(bch < 0.01 ? 6 : 4).replace(/0+$/, "").replace(/\.$/, "")} BCH`;
};
export const formatUsd = (usd: number) =>
  usd > 0 && usd < 0.01 ? "<$0.01" : usd < 1 ? `$${usd.toFixed(2)}` : `$${usd.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;

/** Platform fee: covers the NFT receipt mint plus a small margin. */
export const FEE_BPS = 300;
export const MIN_FEE_SATS = 2000;
export const feeFor = (sellerSats: number) => Math.max(MIN_FEE_SATS, Math.ceil((sellerSats * FEE_BPS) / 10_000));

export const explorerTx = (txid: string) => `${EXPLORER}/tx/${txid}`;
export const explorerAddress = (address: string) => `${EXPLORER}/address/${address}`;
