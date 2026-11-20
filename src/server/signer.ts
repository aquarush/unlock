import "server-only";
import {
  binToHex,
  decodePrivateKeyWif,
  encodeTransaction,
  generateTransaction,
  hashTransactionUiOrder,
  hexToBin,
  importWalletTemplate,
  secp256k1,
  walletTemplateP2pkhNonHd,
  walletTemplateToCompilerBch,
} from "@bitauth/libauth";
import { pubkeyToAddress } from "@/lib/bch";

const template = importWalletTemplate(walletTemplateP2pkhNonHd);
if (typeof template === "string") throw new Error(template);
const compiler = walletTemplateToCompilerBch(template);

export interface Key {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  address: string;
  tokenAddress: string;
}

export function keyFromWif(wif: string): Key {
  const decoded = decodePrivateKeyWif(wif.trim());
  if (typeof decoded === "string") throw new Error(`Bad MINTER_WIF: ${decoded}`);
  const publicKey = secp256k1.derivePublicKeyCompressed(decoded.privateKey);
  if (typeof publicKey === "string") throw new Error(publicKey);
  return {
    privateKey: decoded.privateKey,
    publicKey,
    address: pubkeyToAddress(publicKey),
    tokenAddress: pubkeyToAddress(publicKey, true),
  };
}

export interface TokenSpec {
  category: Uint8Array;
  amount: bigint;
  nft?: { capability: "none" | "mutable" | "minting"; commitment: Uint8Array };
}

export interface SpendInput {
  txid: string;
  vout: number;
  valueSatoshis: bigint;
  token?: TokenSpec;
}

export interface SpendOutput {
  lockingBytecode: Uint8Array;
  valueSatoshis: bigint;
  token?: TokenSpec;
}

/** Builds and signs a transaction spending P2PKH inputs owned by `key`. */
export function signP2pkh(key: Key, inputs: SpendInput[], outputs: SpendOutput[]) {
  const result = generateTransaction({
    version: 2,
    locktime: 0,
    inputs: inputs.map((input) => ({
      outpointIndex: input.vout,
      outpointTransactionHash: hexToBin(input.txid),
      sequenceNumber: 0xffffffff,
      unlockingBytecode: {
        compiler,
        data: { keys: { privateKeys: { key: key.privateKey } } },
        script: "unlock",
        valueSatoshis: input.valueSatoshis,
        ...(input.token ? { token: input.token } : {}),
      },
    })),
    outputs: outputs.map((o) => ({
      lockingBytecode: o.lockingBytecode,
      valueSatoshis: o.valueSatoshis,
      ...(o.token ? { token: o.token } : {}),
    })),
  });
  if (!result.success) {
    throw new Error(`Failed to sign transaction: ${JSON.stringify(result.errors, (_, v) => (typeof v === "bigint" ? v.toString() : v)).slice(0, 400)}`);
  }
  const encoded = encodeTransaction(result.transaction);
  return { hex: binToHex(encoded), txid: binToHex(hashTransactionUiOrder(encoded)), size: encoded.length };
}
