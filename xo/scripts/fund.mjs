// Funds an address on chipnet from a WIF key (Unlock's chipnet minter in ../.env.chipnet). Never touches token UTXOs.
// usage: node scripts/fund.mjs <bchtest:address> <sats>
import { readFileSync } from "node:fs";
import {
  decodePrivateKeyWif, secp256k1, hash160, encodeCashAddress, cashAddressToLockingBytecode,
  generateTransaction, encodeTransaction, hashTransactionUiOrder, binToHex, hexToBin, walletTemplateP2pkhNonHd, importWalletTemplate,
  walletTemplateToCompilerBch,
} from "@bitauth/libauth";
import { ElectrumClient } from "@electrum-cash/network";

const [to, satsArg] = process.argv.slice(2);
const env = Object.fromEntries(readFileSync(new URL("../../.env.chipnet", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const key = decodePrivateKeyWif(env.MINTER_WIF);
if (typeof key === "string") throw new Error(key);
const pub = secp256k1.derivePublicKeyCompressed(key.privateKey);
const from = encodeCashAddress({ prefix: "bchtest", type: "p2pkh", payload: hash160(pub) }).address;
const fromLock = cashAddressToLockingBytecode(from).bytecode;
const client = new ElectrumClient("unlock-xo", "1.5", "chipnet.bch.ninja");
await client.connect();
const utxos = (await client.request("blockchain.address.listunspent", from, "exclude_tokens"));
const sats = BigInt(satsArg);
const fee = 400n;
let total = 0n; const picked = [];
for (const u of utxos.sort((a, b) => b.value - a.value)) { picked.push(u); total += BigInt(u.value); if (total >= sats + fee + 546n) break; }
if (total < sats + fee) throw new Error(`minter has only ${total} sats`);
const compiler = walletTemplateToCompilerBch(importWalletTemplate(walletTemplateP2pkhNonHd));
const data = { keys: { privateKeys: { key: key.privateKey } } };
const inputs = picked.map((u) => ({ outpointTransactionHash: hexToBin(u.tx_hash), outpointIndex: u.tx_pos, sequenceNumber: 0, unlockingBytecode: { compiler, data, script: "unlock", valueSatoshis: BigInt(u.value) } }));
const outputs = [{ lockingBytecode: cashAddressToLockingBytecode(to).bytecode, valueSatoshis: sats }];
if (total - sats - fee >= 546n) outputs.push({ lockingBytecode: fromLock, valueSatoshis: total - sats - fee });
const r = generateTransaction({ version: 2, locktime: 0, inputs, outputs });
if (!r.success) throw new Error(JSON.stringify(r.errors));
const hex = binToHex(encodeTransaction(r.transaction));
const txid = await client.request("blockchain.transaction.broadcast", hex);
console.log("funded", to, sats.toString(), "sats, txid", txid);
await client.disconnect();
