import "server-only";
import {
  binToHex,
  createVirtualMachineBch,
  decodeTransaction,
  hashTransactionUiOrder,
  hexToBin,
  type Output,
  type Transaction,
} from "@bitauth/libauth";
import {
  bytecodeToAddress,
  commitmentFor,
  lockingBytecode,
  MEMO_TAG,
  p2pkhPubkey,
  parseOpReturn,
  PROOF_TAG,
  pubkeyToAddress,
} from "@/lib/bch";
import { broadcast, getRawTx, listUnspent, RpcError } from "@/lib/electrum";

export class VerifyError extends Error {}

function decode(hex: string): { tx: Transaction; txid: string } {
  if (typeof hex !== "string" || !/^[0-9a-f]+$/i.test(hex) || hex.length > 200_000) {
    throw new VerifyError("Malformed transaction");
  }
  const bin = hexToBin(hex.toLowerCase());
  const tx = decodeTransaction(bin);
  if (typeof tx === "string") throw new VerifyError(`Could not decode transaction: ${tx}`);
  return { tx, txid: binToHex(hashTransactionUiOrder(bin)) };
}

const sameBytecode = (a: Uint8Array, b: Uint8Array) => binToHex(a) === binToHex(b);

/** Make sure the transaction is on the network; broadcast it ourselves if the wallet did not. */
async function ensureBroadcast(hex: string, txid: string) {
  try {
    await getRawTx(txid);
    return;
  } catch {
    // not yet known to our server: broadcast it
  }
  try {
    await broadcast(hex);
  } catch (error) {
    const msg = String((error as Error).message || error);
    if (/already|known|txn-mempool-conflict-same/i.test(msg)) return;
    if (error instanceof RpcError) throw new VerifyError(`The network rejected this payment: ${msg}`);
    throw error;
  }
}

export interface PaymentCheck {
  txid: string;
  buyerAddress: string | null;
}

export async function verifyPayment(
  hex: string,
  expect: { listingId: string; nonce: string; sellerAddress: string; sellerSats: number; feeAddress: string; feeSats: number },
): Promise<PaymentCheck> {
  const { tx, txid } = decode(hex);

  const memo = tx.outputs.map((o) => parseOpReturn(o.lockingBytecode)).find((p) => p?.[0] === MEMO_TAG);
  if (!memo || memo[1] !== expect.listingId) throw new VerifyError("Payment is not tagged for this item");
  // The nonce ties this payment to the quote it was made from (and so to the buyer's browser).
  if (!expect.nonce || memo[2] !== expect.nonce) throw new VerifyError("This payment was made from a different checkout");

  const sellerLock = lockingBytecode(expect.sellerAddress);
  const feeLock = lockingBytecode(expect.feeAddress);
  const paid = (lock: Uint8Array) =>
    tx.outputs.filter((o) => sameBytecode(o.lockingBytecode, lock)).reduce((s, o) => s + Number(o.valueSatoshis), 0);

  if (sameBytecode(sellerLock, feeLock)) {
    if (paid(sellerLock) < expect.sellerSats + expect.feeSats) throw new VerifyError("Payment amount is too low");
  } else {
    if (paid(sellerLock) < expect.sellerSats) throw new VerifyError("Seller was not paid the full price");
    if (paid(feeLock) < expect.feeSats) throw new VerifyError("Receipt fee is missing");
  }

  const pubkey = tx.inputs.length ? p2pkhPubkey(tx.inputs[0].unlockingBytecode) : null;
  const buyerAddress = pubkey ? pubkeyToAddress(pubkey) : null;

  await ensureBroadcast(hex, txid);
  return { txid, buyerAddress };
}

async function sourceOutput(txid: string, index: number): Promise<Output> {
  const raw = await getRawTx(txid);
  const decoded = decodeTransaction(hexToBin(raw));
  if (typeof decoded === "string") throw new VerifyError("Could not decode source transaction");
  const out = decoded.outputs[index];
  if (!out) throw new VerifyError("Source output does not exist");
  return out;
}

/**
 * Verifies an ownership proof: a transaction (signed by the holder's wallet, not broadcast)
 * that spends a receipt NFT for `listingId` and commits to the server-issued `nonce`.
 * A valid signature over a currently unspent NFT proves the caller controls it.
 */
export async function verifyOwnershipProof(
  hex: string,
  expect: { listingId: string; nonce: string; category: string },
): Promise<{ holder: string }> {
  const { tx, txid } = decode(hex);
  if (tx.inputs.length < 1 || tx.inputs.length > 4) throw new VerifyError("Unexpected proof shape");

  const proofMemo = tx.outputs.map((o) => parseOpReturn(o.lockingBytecode)).find((p) => p?.[0] === PROOF_TAG);
  if (!proofMemo || proofMemo[1] !== expect.nonce) throw new VerifyError("Proof does not match this challenge");

  const sourceOutputs = await Promise.all(
    tx.inputs.map((i) => sourceOutput(binToHex(i.outpointTransactionHash), i.outpointIndex)),
  );

  const nftIndex = sourceOutputs.findIndex(
    (o) =>
      o.token &&
      binToHex(o.token.category) === expect.category &&
      o.token.nft &&
      binToHex(o.token.nft.commitment) === commitmentFor(expect.listingId),
  );
  if (nftIndex === -1) throw new VerifyError("This wallet does not hold a receipt for this item");

  const vm = createVirtualMachineBch();
  const result = vm.verify({ sourceOutputs, transaction: tx });
  if (result !== true) throw new VerifyError("Signature check failed");

  const nftOut = sourceOutputs[nftIndex];
  const holder = bytecodeToAddress(nftOut.lockingBytecode);
  if (!holder) throw new VerifyError("Unsupported receipt address");

  // The receipt must still be held: unspent, or spent by this very proof (if a wallet broadcast it).
  const input = tx.inputs[nftIndex];
  const prevTxid = binToHex(input.outpointTransactionHash);
  const unspent = await listUnspent(holder);
  const stillHeld = unspent.some((u) => u.tx_hash === prevTxid && u.tx_pos === input.outpointIndex);
  if (!stillHeld) {
    const broadcasted = await getRawTx(txid).then(() => true, () => false);
    if (!broadcasted) throw new VerifyError("This receipt has moved to another wallet");
  }
  return { holder };
}
