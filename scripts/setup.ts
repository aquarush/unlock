/**
 * One-time setup for Unlock receipts.
 *
 *   npm run setup                         # create minter key in .env.local, show address to fund
 *   npm run setup -- status               # show minter balance / token state
 *   npm run setup -- genesis <https://your-app.vercel.app>
 *                                         # create the receipt NFT category + minting baton + BCMR metadata
 *
 * Run with: tsx --conditions=react-server scripts/setup.ts
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { encodePrivateKeyWif, generatePrivateKey, sha256 } from "@bitauth/libauth";
import { DUST, FEE_PER_BYTE, lockingBytecode, opReturn } from "../src/lib/bch";
import { IS_CHIPNET } from "../src/lib/network";
import { broadcast, listUnspent, resetElectrum, type Utxo } from "../src/lib/electrum";
import { keyFromWif, signP2pkh, type SpendInput, type SpendOutput } from "../src/server/signer";

// Chipnet keeps its own key + token in .env.chipnet so it never touches the mainnet setup.
const ENV = IS_CHIPNET ? ".env.chipnet" : ".env.local";
const WIF_NET = IS_CHIPNET ? "testnet" : "mainnet";
const BCMR_FILE = IS_CHIPNET ? "bcmr-chipnet.json" : "bcmr.json";

function readEnv(): Record<string, string> {
  if (!existsSync(ENV)) return {};
  return Object.fromEntries(
    readFileSync(ENV, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
}

function writeEnv(patch: Record<string, string>) {
  const env = { ...readEnv(), ...patch };
  writeFileSync(ENV, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
}

function identityKey(wif: string) {
  // Separate key that holds the token's identity (authchain) output, so mints never spend it.
  const priv = createHash("sha256").update(`unlock-identity:${wif}`).digest();
  return keyFromWif(encodePrivateKeyWif(new Uint8Array(priv), WIF_NET));
}

const sats = (u: Utxo[]) => u.filter((x) => !x.token_data).reduce((s, x) => s + x.value, 0);

async function init() {
  const env = readEnv();
  if (!env.MINTER_WIF) {
    writeEnv({
      // Blank out mainnet-only values that Next.js would otherwise pick up from .env.local.
      ...(IS_CHIPNET ? { NEXT_PUBLIC_BCH_NETWORK: "chipnet", TOKEN_CATEGORY: "", FEE_ADDRESS: "", NEXT_PUBLIC_SITE_URL: "http://localhost:3000" } : {}),
      MINTER_WIF: encodePrivateKeyWif(generatePrivateKey(), WIF_NET),
      APP_SECRET: env.APP_SECRET || randomBytes(32).toString("hex"),
    });
    console.log(`✓ Created a new minter key in ${ENV} (keep it secret, back it up).`);
  }
  const key = keyFromWif(readEnv().MINTER_WIF);
  console.log(IS_CHIPNET
    ? `\nChipnet minter address (get free test BCH from tbch.googol.cash or chipnet.bch.ninja):\n  ${key.address}\n`
    : `\nMinter address (fund with ~0.002 BCH, about $1):\n  ${key.address}\n`);
  console.log(`Then deploy, and run:  npm run setup -- genesis https://<your-app>.vercel.app`);
}

async function status() {
  const env = readEnv();
  if (!env.MINTER_WIF) return init();
  const key = keyFromWif(env.MINTER_WIF);
  const utxos = await listUnspent(key.address);
  console.log(`Minter: ${key.address}`);
  console.log(`Balance: ${sats(utxos)} sats in ${utxos.filter((u) => !u.token_data).length} coins`);
  const batons = utxos.filter((u) => u.token_data?.nft?.capability === "minting");
  for (const b of batons) console.log(`Minting baton: category ${b.token_data!.category} (${b.tx_hash}:${b.tx_pos})`);
  if (env.TOKEN_CATEGORY) console.log(`TOKEN_CATEGORY=${env.TOKEN_CATEGORY}`);
}

async function genesis(siteUrl: string) {
  const env = readEnv();
  if (!env.MINTER_WIF) throw new Error("Run `npm run setup` first");
  if (env.TOKEN_CATEGORY) throw new Error(`TOKEN_CATEGORY already set (${env.TOKEN_CATEGORY}). Remove it to create a new one.`);
  const url = new URL(siteUrl);
  const key = keyFromWif(env.MINTER_WIF);
  const identity = identityKey(env.MINTER_WIF);
  const lock = lockingBytecode(key.address);

  let utxos = (await listUnspent(key.address)).filter((u) => !u.token_data);
  if (sats(utxos) < 6000) throw new Error(`Minter needs at least 6000 sats; has ${sats(utxos)}. Fund ${key.address}`);

  // A token category id is the txid of the spent output #0. Make sure we have one.
  let authbase = utxos.find((u) => u.tx_pos === 0);
  if (!authbase) {
    console.log("Preparing a coin at output #0 …");
    const inputs: SpendInput[] = utxos.map((u) => ({ txid: u.tx_hash, vout: u.tx_pos, valueSatoshis: BigInt(u.value) }));
    const total = sats(utxos);
    const draft = signP2pkh(key, inputs, [{ lockingBytecode: lock, valueSatoshis: BigInt(total - 1000) }]);
    const fee = Math.ceil(draft.size * FEE_PER_BYTE) + 2;
    const tx = signP2pkh(key, inputs, [{ lockingBytecode: lock, valueSatoshis: BigInt(total - fee) }]);
    await broadcast(tx.hex);
    console.log(`  ✓ ${tx.txid}`);
    authbase = { tx_hash: tx.txid, tx_pos: 0, value: total - fee, height: 0 };
    utxos = [authbase];
  }
  const category = authbase.tx_hash;

  // BCMR metadata so wallets show the receipts with a name + icon.
  const registry = {
    $schema: "https://cashtokens.org/bcmr-v2.schema.json",
    version: { major: 1, minor: 0, patch: 0 },
    latestRevision: new Date().toISOString(),
    registryIdentity: {
      name: "Unlock",
      description: "Unlock.cash: sell anything for Bitcoin Cash. Receipt NFTs prove a purchase.",
      uris: { icon: `${url.origin}/icon.png`, web: url.origin },
    },
    identities: {
      [category]: {
        [new Date().toISOString()]: {
          name: "Unlock Receipt",
          description: "Proof of purchase on Unlock. The NFT commitment is the item id. Hold it to re-open the item on any device; gift or resell it to transfer access.",
          token: { category, symbol: "UNLOCK", decimals: 0 },
          uris: { icon: `${url.origin}/icon.png`, web: url.origin },
        },
      },
    },
  };
  const registryJson = JSON.stringify(registry, null, 2);
  writeFileSync(`public/${BCMR_FILE}`, registryJson);
  const hash = sha256.hash(new TextEncoder().encode(registryJson));
  const bcmrUri = `${url.host}/${BCMR_FILE}`;

  const others = utxos.filter((u) => !(u.tx_hash === authbase!.tx_hash && u.tx_pos === 0));
  const inputs: SpendInput[] = [authbase, ...others].map((u) => ({ txid: u.tx_hash, vout: u.tx_pos, valueSatoshis: BigInt(u.value) }));
  const total = [authbase, ...others].reduce((s, u) => s + u.value, 0);
  const catBin = Uint8Array.from(Buffer.from(category, "hex"));
  const outputs = (change: number): SpendOutput[] => {
    const o: SpendOutput[] = [
      // Output 0: identity output (continues the authchain), held by a separate identity key.
      { lockingBytecode: lockingBytecode(identity.address), valueSatoshis: 1000n },
      // Output 1: the minting baton, held by the minter.
      { lockingBytecode: lock, valueSatoshis: 1000n, token: { category: catBin, amount: 0n, nft: { capability: "minting", commitment: new Uint8Array() } } },
      // Output 2: BCMR publication.
      { lockingBytecode: opReturn("BCMR", hash, bcmrUri), valueSatoshis: 0n },
    ];
    if (change >= DUST) o.push({ lockingBytecode: lock, valueSatoshis: BigInt(change) });
    return o;
  };
  const draft = signP2pkh(key, inputs, outputs(total - 3000));
  const fee = Math.ceil(draft.size * FEE_PER_BYTE) + 2;
  const tx = signP2pkh(key, inputs, outputs(total - 2000 - fee));
  await broadcast(tx.hex);

  writeEnv({ TOKEN_CATEGORY: category });
  console.log(`\n✓ Receipt token created!`);
  console.log(`  Genesis tx:      ${tx.txid}`);
  console.log(`  TOKEN_CATEGORY=${category}`);
  console.log(`  Identity holder: ${identity.address} (do not spend its 1000-sat output)`);
  console.log(`\nNext: commit public/bcmr.json, add TOKEN_CATEGORY to Vercel env vars, redeploy.`);
}

const [cmd, arg] = process.argv.slice(2);
try {
  if (!cmd || cmd === "init") await init();
  else if (cmd === "status") await status();
  else if (cmd === "genesis") {
    if (!arg) throw new Error("Usage: npm run setup -- genesis https://your-app.vercel.app");
    await genesis(arg);
  } else throw new Error(`Unknown command ${cmd}`);
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await resetElectrum();
  setTimeout(() => process.exit(), 300);
}
