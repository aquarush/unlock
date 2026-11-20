export {};
/**
 * Verify a BCH ⇄ Nostr identity link from the command line, straight from public relays.
 * No Unlock server is involved.
 *
 *   npm run verify-id -- npub1…            # by Nostr key
 *   npm run verify-id -- bitcoincash:q…    # by BCH address
 *   npm run verify-id -- alice@example.com # by NIP-05 name
 *   npm run verify-id -- bchtest:q… --chipnet
 */
const args = process.argv.slice(2);
if (args.includes("--chipnet") || args.some((a) => a.startsWith("bchtest:"))) process.env.NEXT_PUBLIC_BCH_NETWORK = "chipnet";
const target = args.find((a) => !a.startsWith("--"));

const { lookup } = await import("../src/lib/identity");
const { getRawTx, resetElectrum } = await import("../src/lib/electrum");
const { decodeTransaction, hexToBin } = await import("@bitauth/libauth");

if (!target) {
  console.error("Usage: npm run verify-id -- <npub | bitcoincash:address | name@domain> [--chipnet]");
  process.exit(1);
}

const fetchSource = async (txid: string, vout: number) => {
  const tx = decodeTransaction(hexToBin(await getRawTx(txid)));
  if (typeof tx === "string" || !tx.outputs[vout]) throw new Error("coin not found");
  return tx.outputs[vout];
};

const t = Date.now();
const r = await lookup(target, { fetchSource });
console.log(`Asked ${r.relaysAnswered.length} relays in ${Date.now() - t} ms\n`);
for (const l of r.links) {
  const p = r.profiles[l.pubkey] ?? {};
  console.log(`✓ VERIFIED  ${p.name ? `${p.name}  ` : ""}${l.npub}`);
  console.log(`            ⇄ ${l.address}`);
  console.log(`            Nostr signature ✓  BCH signature ✓ (${l.mode === "virtual" ? "offline proof" : "coin proof"})  on ${l.relays.length} relays`);
  console.log(`            event ${l.eventId}\n`);
}
for (const f of r.failures) console.log(`✗ REJECTED  ${f.address || "(event)"}: ${f.error}`);
if (!r.links.length) console.log("No verified link found.");
await resetElectrum().catch(() => {});
process.exit(r.links.length ? 0 : 2);
