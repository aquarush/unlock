// Buyer accepts the split invitation (seller + collaborator already in), adds the tag, funds, adds change, signs, broadcasts.
// Writes invitations/<itemId>.split-purchase.json.  usage: node scripts/split-buy.mjs [itemId] [quoteNonce]   (DRY=1: no broadcast)
import { writeFileSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { hexToBin } from "@bitauth/libauth";
import { serializeInvitation, deserializeInvitation } from "@xo-cash/utils";
import { openEngine, json, stop } from "./lib.mjs";

const itemId = process.argv[2] ?? "spLitDemo1";
const quoteNonce = process.argv[3] ?? randomBytes(9).toString("base64url");
const shared = deserializeInvitation(readFileSync(new URL(`../invitations/${itemId}.split-join.json`, import.meta.url), "utf8"));
const id = shared.invitationIdentifier;
const { engine, splitId } = await openEngine("buyer");
const log = (...a) => console.log("•", ...a);

let b = await engine.acceptInvitation(shared, { roleIdentifier: "buyer" });
const need = shared.commits.flatMap((c) => c.data.variables ?? [])
  .filter((v) => ["sellerShareSatoshis", "collaboratorShareSatoshis", "feeSatoshis"].includes(v.variableIdentifier))
  .reduce((n, v) => n + BigInt(v.value), 0n) + 1000n;
const coins = (await engine.listUnspentOutputs()).filter((u) => !u.tokenCategory && !u.reservedBy && BigInt(u.valueSatoshis) >= need)
  .sort((a, b) => a.valueSatoshis - b.valueSatoshis).slice(0, 1);
log("need", need, "coins", coins.map((c) => `${c.outpointTransactionHash.slice(0, 8)}:${c.outpointIndex}=${c.valueSatoshis}`).join(", ") || "none");
if (!coins.length) throw new Error("buyer has no coin large enough: fund it (scripts/address.mjs buyer)");
b = await engine.appendInvitation(id, {
  templateIdentifier: splitId,
  actionIdentifier: "splitSale",
  variables: [{ variableIdentifier: "quoteNonce", value: quoteNonce, roleIdentifier: "buyer" }],
  outputs: [{ outputIdentifier: "splitTagOutput" }],
  inputs: coins.map((c) => ({ outpointTransactionHash: hexToBin(c.outpointTransactionHash), outpointIndex: c.outpointIndex, roleIdentifier: "buyer" })),
});
b = await engine.addChangeToInvitation(id);
for (const i of await engine.listOwnInputIndexes(id)) b = await engine.signInvitation(id, i);
log("missing after signing:", json(await engine.listMissingRequirements(id)));
const out = new URL(`../invitations/${itemId}.split-purchase.json`, import.meta.url);
writeFileSync(out, serializeInvitation(b.invitation));
const r = await engine.executeAction(id, { broadcastTransaction: !process.env.DRY });
log(process.env.DRY ? "built (not broadcast)" : "broadcast", "txid", r.builtTransaction.transactionHash, "nonce", quoteNonce);
writeFileSync(out, serializeInvitation(r.storedInvitation.invitation));
log("invitation saved to", out.pathname);
await stop(engine);
process.exit(0);
