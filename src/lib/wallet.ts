"use client";
// Browser-side wallet logic: build transactions and ask the connected
// WizardConnect wallet to sign them. Private keys never leave the wallet.
import { encodeTransaction, binToHex, hexToBin, hash160, encodeCashAddress } from "@bitauth/libauth";
import type { DappConnectionManager } from "@wizardconnect/dapp";
import { sourceOutputToRelay } from "@wizardconnect/core/hdwalletv1-serialize";
import {
  DUST,
  FEE_PER_BYTE,
  MEMO_TAG,
  PROOF_TAG,
  listingFromCommitment,
  lockingBytecode,
  opReturn,
} from "./bch";
import { PREFIX } from "./network";
import { getHistory, listUnspent, type Utxo } from "./electrum";

const CHILD = { receive: 0, change: 1 } as const;
type PathName = keyof typeof CHILD;
const SCAN_DEPTH = 10;

export interface WalletAddress {
  path: PathName;
  index: number;
  address: string;
}

interface Coin extends WalletAddress {
  utxo: Utxo;
}

function addressAt(manager: DappConnectionManager, path: PathName, index: number): string | null {
  const pubkey = manager.getPubkey(CHILD[path], BigInt(index));
  if (!pubkey) return null;
  return encodeCashAddress({ prefix: PREFIX, type: "p2pkh", payload: hash160(pubkey) }).address;
}

export function primaryAddress(manager: DappConnectionManager): string | null {
  return addressAt(manager, "receive", 0);
}

export function walletAddresses(manager: DappConnectionManager): WalletAddress[] {
  const out: WalletAddress[] = [];
  for (const path of ["receive", "change"] as const) {
    for (let index = 0; index < SCAN_DEPTH; index++) {
      const address = addressAt(manager, path, index);
      if (address) out.push({ path, index, address });
    }
  }
  return out;
}

async function scan(manager: DappConnectionManager) {
  const addresses = walletAddresses(manager);
  if (!addresses.length) throw new Error("Your wallet did not share any addresses");
  const utxoSets = await Promise.all(addresses.map((a) => listUnspent(a.address)));
  const coins: Coin[] = addresses.flatMap((a, i) => utxoSets[i].map((utxo) => ({ ...a, utxo })));
  return { addresses, coins };
}

async function changeAddress(manager: DappConnectionManager, addresses: WalletAddress[]) {
  const changes = addresses.filter((a) => a.path === "change");
  for (const a of changes) {
    if ((await getHistory(a.address)).length === 0) return a.address;
  }
  return changes[0]?.address ?? addresses[0].address;
}

export async function walletBalance(manager: DappConnectionManager): Promise<number> {
  const { coins } = await scan(manager);
  return coins.filter((c) => !c.utxo.token_data).reduce((s, c) => s + c.utxo.value, 0);
}

interface Out {
  valueSatoshis: bigint;
  lockingBytecode: Uint8Array;
  token?: {
    category: Uint8Array;
    amount: bigint;
    nft?: { capability: "none" | "mutable" | "minting"; commitment: Uint8Array };
  };
}

function toSource(c: Coin) {
  const input = {
    outpointTransactionHash: hexToBin(c.utxo.tx_hash),
    outpointIndex: c.utxo.tx_pos,
    unlockingBytecode: new Uint8Array(),
    sequenceNumber: 0xffffffff,
  };
  const t = c.utxo.token_data;
  return {
    input,
    source: sourceOutputToRelay({
      ...input,
      valueSatoshis: BigInt(c.utxo.value),
      lockingBytecode: lockingBytecode(c.address),
      ...(t
        ? {
            token: {
              category: hexToBin(t.category),
              amount: BigInt(t.amount),
              ...(t.nft ? { nft: { capability: t.nft.capability, commitment: hexToBin(t.nft.commitment ?? "") } } : {}),
            },
          }
        : {}),
    }),
  };
}

async function requestSignature(
  manager: DappConnectionManager,
  coins: Coin[],
  outputs: Out[],
  opts: { broadcast: boolean; prompt: string },
): Promise<string> {
  const prepared = coins.map(toSource);
  const transaction = binToHex(
    encodeTransaction({ version: 2, locktime: 0, inputs: prepared.map((p) => p.input), outputs }),
  );
  const response = await manager.signTransaction({
    transaction: {
      transaction,
      sourceOutputs: prepared.map((p) => p.source) as any,
      broadcast: opts.broadcast,
      userPrompt: opts.prompt,
    },
    inputPaths: coins.map((c, i) => [i, c.path, c.index] as [number, string, number]),
  });
  if (response.error) throw new Error(friendlyWalletError(response.error));
  if (!response.signedTransaction) throw new Error("The wallet did not return a signed transaction");
  return response.signedTransaction;
}

function friendlyWalletError(error: string) {
  if (/reject|denied|cancel/i.test(error)) return "You declined the request in your wallet";
  return error;
}

// Rough P2PKH size estimate: inputs 148 bytes, outputs ~34 (+ token prefix / OP_RETURN length).
const estimateSize = (inputs: number, outputBytes: number) => 10 + inputs * 148 + outputBytes;

/** Pays the seller + receipt fee in one transaction tagged with the listing id. */
export async function payForListing(
  manager: DappConnectionManager,
  p: { listingId: string; nonce: string; title: string; sellerAddress: string; sellerSats: number; feeAddress: string; feeSats: number },
): Promise<string> {
  const { addresses, coins } = await scan(manager);
  const spendable = coins.filter((c) => !c.utxo.token_data).sort((a, b) => b.utxo.value - a.utxo.value);
  const memo = opReturn(MEMO_TAG, p.listingId, p.nonce);
  const outputs: Out[] = [
    { valueSatoshis: BigInt(p.sellerSats), lockingBytecode: lockingBytecode(p.sellerAddress) },
    { valueSatoshis: BigInt(p.feeSats), lockingBytecode: lockingBytecode(p.feeAddress) },
    { valueSatoshis: 0n, lockingBytecode: memo },
  ];
  const need = p.sellerSats + p.feeSats;
  const outputBytes = 34 * 3 + memo.length + 9;

  const selected: Coin[] = [];
  let total = 0;
  let fee = 0;
  for (const c of spendable) {
    selected.push(c);
    total += c.utxo.value;
    fee = Math.ceil(estimateSize(selected.length, outputBytes) * FEE_PER_BYTE);
    if (total >= need + fee) break;
  }
  if (total < need + fee) {
    throw new InsufficientFunds(need + fee, total);
  }
  const change = total - need - fee;
  if (change >= DUST) {
    outputs.push({ valueSatoshis: BigInt(change), lockingBytecode: lockingBytecode(await changeAddress(manager, addresses)) });
  }
  return requestSignature(manager, selected, outputs, {
    broadcast: true,
    prompt: `Unlock "${p.title.slice(0, 60)}"`,
  });
}

export class InsufficientFunds extends Error {
  constructor(public needed: number, public available: number) {
    super(`Not enough BCH: this needs ${needed.toLocaleString()} sats, your wallet has ${available.toLocaleString()} sats`);
  }
}

export interface Receipt {
  listingId: string;
  coin: Coin;
}

/** All Unlock receipt NFTs (of `category`) held by the connected wallet. */
export async function findReceipts(manager: DappConnectionManager, category: string): Promise<Receipt[]> {
  const { coins } = await scan(manager);
  return coins
    .filter((c) => c.utxo.token_data?.category === category && c.utxo.token_data.nft)
    .filter((c) => c.utxo.token_data!.nft!.capability !== "minting")
    .map((coin) => ({ listingId: listingFromCommitment(coin.utxo.token_data!.nft!.commitment ?? ""), coin }));
}

/**
 * Signs (without broadcasting) a transaction that spends the receipt NFT back to
 * the same address and commits to the server's nonce. The server checks the
 * signature to confirm you hold the receipt. Nothing is sent and the NFT does not move.
 */
export async function proveOwnership(manager: DappConnectionManager, receipt: Receipt, nonce: string): Promise<string> {
  const c = receipt.coin;
  const t = c.utxo.token_data!;
  const proofFee = 300;
  const outputs: Out[] = [
    {
      valueSatoshis: BigInt(Math.max(c.utxo.value - proofFee, 800)),
      lockingBytecode: lockingBytecode(c.address),
      token: {
        category: hexToBin(t.category),
        amount: BigInt(t.amount),
        nft: { capability: t.nft!.capability, commitment: hexToBin(t.nft!.commitment ?? "") },
      },
    },
    { valueSatoshis: 0n, lockingBytecode: opReturn(PROOF_TAG, nonce) },
  ];
  return requestSignature(manager, [c], outputs, {
    broadcast: false,
    prompt: "Prove you own this Unlock receipt (nothing is sent)",
  });
}

/**
 * BCH side of a BCH ⇄ Nostr identity link. Asks the wallet to sign (never broadcast) a proof
 * naming `nostrPubkey`. First tries an offline-verifiable proof that spends a virtual coin;
 * if the wallet refuses that, falls back to a proof over one of the wallet's real coins
 * (it pays back to the same address, and is never broadcast by us).
 */
export async function signIdentityProof(
  manager: DappConnectionManager,
  nostrPubkey: string,
): Promise<{ address: string; proof: string; mode: "virtual" | "utxo" }> {
  const { unsignedVirtualProof, statement, LINK_TAG } = await import("./identity");
  const { nip19 } = await import("nostr-tools");
  const address = primaryAddress(manager);
  if (!address) throw new Error("Your wallet did not share an address");

  const { transaction, sourceOutputs } = unsignedVirtualProof(address, nostrPubkey);
  const prompt = "Link this wallet to your Nostr identity (nothing is sent)";
  try {
    const response = await manager.signTransaction({
      transaction: {
        transaction: binToHex(encodeTransaction(transaction)),
        sourceOutputs: [sourceOutputToRelay({ ...transaction.inputs[0], ...sourceOutputs[0] })] as any,
        broadcast: false,
        userPrompt: prompt,
      },
      inputPaths: [[0, "receive", 0]],
    });
    if (response.signedTransaction) return { address, proof: response.signedTransaction, mode: "virtual" };
    if (response.error && /reject|denied|cancel/i.test(response.error)) throw new Error(friendlyWalletError(response.error));
  } catch (error) {
    if (/declined/i.test((error as Error).message)) throw error;
  }

  // Fallback: sign over a real coin (prefer the primary address).
  const { coins } = await scan(manager);
  const plain = coins.filter((c) => !c.utxo.token_data && c.utxo.value >= 1500);
  const coin = plain.find((c) => c.address === address) ?? plain.sort((a, b) => b.utxo.value - a.utxo.value)[0];
  if (!coin) throw new Error("Your wallet declined the proof. Add a little BCH (≥1,500 sats) and try again.");
  const outputs: Out[] = [
    { valueSatoshis: 0n, lockingBytecode: opReturn(LINK_TAG, statement(nip19.npubEncode(nostrPubkey))) },
    { valueSatoshis: BigInt(coin.utxo.value - 500), lockingBytecode: lockingBytecode(coin.address) },
  ];
  const proof = await requestSignature(manager, [coin], outputs, { broadcast: false, prompt });
  return { address: coin.address, proof, mode: "utxo" };
}
