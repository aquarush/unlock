"use client";
import { decodeTransaction, hexToBin } from "@bitauth/libauth";
import type { FetchSource } from "@/lib/identity";
import { getRawTx } from "@/lib/electrum";

/** For proofs that spend a real coin: fetch the coin from a public Electrum server, in the browser. */
export const browserFetchSource: FetchSource = async (txid, vout) => {
  const tx = decodeTransaction(hexToBin(await getRawTx(txid)));
  if (typeof tx === "string" || !tx.outputs[vout]) throw new Error("Proof coin not found on chain");
  return tx.outputs[vout];
};
