// Isomorphic Electrum (Fulcrum) client with parallel connect + failover.
import { ElectrumClient } from "@electrum-cash/network";
import { ELECTRUM_SERVERS as SERVERS } from "./network";

const CONNECT_TIMEOUT = 8000;
const REQUEST_TIMEOUT = 15000;

type Client = ElectrumClient<any>;
let clientPromise: Promise<Client> | null = null;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function connectFastest(): Promise<Client> {
  const attempts = SERVERS.map(async (host) => {
    const client = new ElectrumClient("unlock-cash", "1.5.0", host, { disableBrowserVisibilityHandling: true } as any);
    await withTimeout(client.connect(), CONNECT_TIMEOUT, `connect ${host}`);
    return client;
  });
  const winner = await Promise.any(attempts).catch(() => {
    throw new Error("Could not reach any Bitcoin Cash server. Please try again.");
  });
  // Close the losers once they finish connecting.
  attempts.forEach((a) =>
    a.then((c) => c !== winner && c.disconnect(true).catch(() => {})).catch(() => {}),
  );
  return winner;
}

export function electrum(): Promise<Client> {
  clientPromise ??= connectFastest().catch((error) => {
    clientPromise = null;
    throw error;
  });
  return clientPromise;
}

export async function resetElectrum() {
  const p = clientPromise;
  clientPromise = null;
  if (p) (await p.catch(() => null))?.disconnect(true).catch(() => {});
}

export async function rpc<T>(method: string, ...params: unknown[]): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const client = await electrum();
      const result = await withTimeout(client.request(method, ...(params as any[])), REQUEST_TIMEOUT, method);
      if (result instanceof Error) throw new RpcError(result.message);
      return result as T;
    } catch (error) {
      if (error instanceof RpcError || attempt === 1) throw error;
      await resetElectrum();
    }
  }
  throw new Error("unreachable");
}

export class RpcError extends Error {}

export interface TokenData {
  category: string;
  amount: string;
  nft?: { capability: "none" | "mutable" | "minting"; commitment: string };
}

export interface Utxo {
  tx_hash: string;
  tx_pos: number;
  value: number;
  height: number;
  token_data?: TokenData;
}

export const listUnspent = (address: string) =>
  rpc<Utxo[]>("blockchain.address.listunspent", address, "include_tokens");

export const getHistory = (address: string) =>
  rpc<{ tx_hash: string; height: number }[]>("blockchain.address.get_history", address);

export const getRawTx = (txid: string) => rpc<string>("blockchain.transaction.get", txid, false);

export const broadcast = (hex: string) => rpc<string>("blockchain.transaction.broadcast", hex);

export async function watchAddress(address: string, onChange: () => void) {
  const client = await electrum();
  const handler = (data: any) => {
    if (data?.method === "blockchain.address.subscribe" && data.params?.[0] === address) onChange();
  };
  client.on("notification", handler);
  await client.subscribe("blockchain.address.subscribe", address);
  return () => {
    client.off("notification", handler);
    client.unsubscribe("blockchain.address.subscribe", address).catch(() => {});
  };
}
