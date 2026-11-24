// Shared setup: two XO accounts (seller and buyer) on chipnet, each with its own engine database.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { generateBip39Mnemonic } from "@bitauth/libauth";
import { Engine, XO_SUPPORTED_NETWORKS } from "@xo-cash/engine";
import { StorageType } from "@xo-cash/state";
import { p2pkhTemplate } from "@xo-cash/templates";

const here = new URL("..", import.meta.url).pathname;
export const TEMPLATE_PATH = here + "template/unlock.template.json";
export const SPLIT_TEMPLATE_PATH = here + "template/unlock-split.template.json";
const ROLES = ["seller", "buyer", "collaborator"];
const WALLETS = here + ".wallets.json";

export function wallets() {
  const w = existsSync(WALLETS) ? JSON.parse(readFileSync(WALLETS, "utf8")) : {};
  if (ROLES.some((r) => !w[r])) {
    for (const r of ROLES) w[r] ??= generateBip39Mnemonic();
    writeFileSync(WALLETS, JSON.stringify(w, null, 2), { mode: 0o600 });
  }
  return w;
}

export async function openEngine(name) {
  mkdirSync(here + ".xo-data", { recursive: true });
  const engine = await Engine.create(wallets()[name], {
    network: XO_SUPPORTED_NETWORKS.chipnet,
    storageType: StorageType.INDEXEDDB,
    databasePath: here + ".xo-data/",
    databaseFilename: name,
  });
  const p2pkh = await engine.importTemplate(p2pkhTemplate);
  const unlock = await engine.importTemplate(readFileSync(TEMPLATE_PATH, "utf8"));
  const split = await engine.importTemplate(readFileSync(SPLIT_TEMPLATE_PATH, "utf8"));
  const id = p2pkh.templateIdentifier;
  await engine.setDefaultPolicies({ change: { templateIdentifier: id }, receive: { templateIdentifier: id }, address: { templateIdentifier: id } });
  return { engine, p2pkhId: id, unlockId: unlock.templateIdentifier, splitId: split.templateIdentifier };
}

export const json = (v) => JSON.stringify(v, (k, x) => (typeof x === "bigint" ? x.toString() : x), 2);

// engine.stop() can reject with an empty AggregateError from the Electrum pool after a successful run.
process.on("unhandledRejection", (e) => {
  if (e instanceof AggregateError && e.errors.length === 0) return;
  console.error(e);
  process.exit(1);
});

export const stop = (engine) => engine.stop().catch(() => {});
