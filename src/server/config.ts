import "server-only";
import { createHash } from "node:crypto";
import { keyFromWif, type Key } from "./signer";

let minterKey: Key | null | undefined;

export function minter(): Key | null {
  if (minterKey === undefined) {
    const wif = process.env.MINTER_WIF;
    minterKey = wif ? keyFromWif(wif) : null;
  }
  return minterKey;
}

/** CashToken category (hex) of the receipt NFTs; created by `npm run setup`. */
export const tokenCategory = () => (process.env.TOKEN_CATEGORY || "").trim().toLowerCase() || null;

/** Where the platform fee is paid. Defaults to the minter, so receipts mint from fees. */
export function feeAddress(): string | null {
  return process.env.FEE_ADDRESS?.trim() || minter()?.address || null;
}

export function appSecret(): string {
  const s = process.env.APP_SECRET;
  if (s) return s;
  const wif = process.env.MINTER_WIF;
  if (wif) return createHash("sha256").update(`unlock-app-secret:${wif}`).digest("hex");
  if (process.env.VERCEL_ENV === "production") throw new Error("APP_SECRET is not configured");
  return "dev-only-secret-do-not-use-in-production";
}

export const blobEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
