import "server-only";
import { hexToBin, utf8ToBin } from "@bitauth/libauth";
import { lockingBytecode, NFT_SATS, toTokenAddress, FEE_PER_BYTE, DUST } from "@/lib/bch";
import { broadcast, listUnspent, RpcError, type Utxo } from "@/lib/electrum";
import { minter, tokenCategory } from "./config";
import { signP2pkh, type SpendInput, type SpendOutput } from "./signer";
import { db, withLock } from "./store";

const outpoint = (u: { tx_hash: string; tx_pos: number }) => `${u.tx_hash}:${u.tx_pos}`;

/**
 * The minter's view of its own UTXOs. Electrum servers can lag a moment behind
 * our own broadcasts, so we remember what we just spent and created.
 */
interface MinterState {
  spent: string[];
  created: Utxo[];
}

async function minterUtxos(address: string): Promise<Utxo[]> {
  const [live, state] = await Promise.all([
    listUnspent(address),
    db().get<MinterState>("minter:state"),
  ]);
  const spent = new Set(state?.spent ?? []);
  const byOutpoint = new Map<string, Utxo>();
  for (const u of [...live, ...(state?.created ?? [])]) {
    if (!spent.has(outpoint(u))) byOutpoint.set(outpoint(u), u);
  }
  return [...byOutpoint.values()];
}

async function rememberSpend(spent: string[], created: Utxo[]) {
  const prev = (await db().get<MinterState>("minter:state")) ?? { spent: [], created: [] };
  const spentAll = [...prev.spent, ...spent].slice(-200);
  const spentSet = new Set(spentAll);
  const createdAll = [...prev.created, ...created].filter((u) => !spentSet.has(outpoint(u))).slice(-50);
  await db().set("minter:state", { spent: spentAll, created: createdAll }, { ex: 60 * 60 });
}

/** Mints one receipt NFT (commitment = listing id) to `recipient`. Returns the mint txid. */
export async function mintReceipt(recipient: string, listingId: string): Promise<string> {
  const key = minter();
  const categoryHex = tokenCategory();
  if (!key || !categoryHex) throw new Error("Receipt minting is not configured");
  const category = hexToBin(categoryHex);

  return withLock("mint", async () => {
    try {
      return await mintOnce(key, category, categoryHex, recipient, listingId, true);
    } catch (error) {
      // Our cached view of the minter's coins was stale (e.g. a coin was spent elsewhere,
      // or an earlier mint was dropped). Forget it and retry once from live chain data.
      if (!(error instanceof RpcError) || !/conflict|missing|spent|inputs/i.test(error.message)) throw error;
      await db().del("minter:state");
      return mintOnce(key, category, categoryHex, recipient, listingId, false);
    }
  });
}

async function mintOnce(
  key: NonNullable<ReturnType<typeof minter>>,
  category: Uint8Array,
  categoryHex: string,
  recipient: string,
  listingId: string,
  useCache: boolean,
): Promise<string> {
    const utxos = useCache ? await minterUtxos(key.address) : await listUnspent(key.address);
    const baton = utxos.find(
      (u) => u.token_data?.category === categoryHex && u.token_data.nft?.capability === "minting",
    );
    if (!baton) throw new Error("Minting baton not found in minter wallet");
    const funding = utxos.filter((u) => !u.token_data).sort((a, b) => b.value - a.value);

    const batonCommitment = hexToBin(baton.token_data!.nft!.commitment ?? "");
    const inputs: SpendInput[] = [
      {
        txid: baton.tx_hash,
        vout: baton.tx_pos,
        valueSatoshis: BigInt(baton.value),
        token: { category, amount: 0n, nft: { capability: "minting", commitment: batonCommitment } },
      },
    ];
    let inputTotal = baton.value;
    const minterLock = lockingBytecode(key.address);
    const baseOutputs = (change: number): SpendOutput[] => {
      const outs: SpendOutput[] = [
        {
          lockingBytecode: lockingBytecode(toTokenAddress(recipient)),
          valueSatoshis: BigInt(NFT_SATS),
          token: { category, amount: 0n, nft: { capability: "none", commitment: utf8ToBin(listingId) } },
        },
        {
          lockingBytecode: minterLock,
          valueSatoshis: BigInt(baton.value),
          token: { category, amount: 0n, nft: { capability: "minting", commitment: batonCommitment } },
        },
      ];
      if (change >= DUST) outs.push({ lockingBytecode: minterLock, valueSatoshis: BigInt(change) });
      return outs;
    };

    // Add funding inputs until NFT value + fee is covered.
    let signed: ReturnType<typeof signP2pkh> | null = null;
    let finalChange = 0;
    for (const f of funding) {
      inputs.push({ txid: f.tx_hash, vout: f.tx_pos, valueSatoshis: BigInt(f.value) });
      inputTotal += f.value;
      const draft = signP2pkh(key, inputs, baseOutputs(inputTotal - baton.value - NFT_SATS - 1000));
      const fee = Math.ceil(draft.size * FEE_PER_BYTE) + 2;
      const change = inputTotal - baton.value - NFT_SATS - fee;
      if (change >= 0) {
        signed = signP2pkh(key, inputs, baseOutputs(change));
        finalChange = change;
        break;
      }
    }
    if (!signed) throw new Error("Minter wallet is out of BCH — top it up to keep minting receipts");

    await broadcast(signed.hex);

    const created: Utxo[] = [
      {
        tx_hash: signed.txid,
        tx_pos: 1,
        value: baton.value,
        height: 0,
        token_data: { category: categoryHex, amount: "0", nft: { capability: "minting", commitment: baton.token_data!.nft!.commitment ?? "" } },
      },
    ];
    // Change output (if any) is always the last output, index 2.
    if (finalChange >= DUST) {
      created.push({ tx_hash: signed.txid, tx_pos: 2, value: finalChange, height: 0 });
    }
    await rememberSpend(inputs.map((i) => `${i.txid}:${i.vout}`), created);
    return signed.txid;
}
