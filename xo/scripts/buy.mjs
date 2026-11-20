// Buyer side: accept the seller's invitation, fund it from the buyer's own coins, add change, sign, broadcast.
// Writes the completed invitation to invitations/<itemId>.purchase.json (inspect it at https://blaze.xo.cash).
// usage: node scripts/buy.mjs [itemId] [quoteNonce]       (DRY=1 to build without broadcasting)
// quoteNonce is the nonce from Unlock's /api/listings/<id>/quote response; a random one is used for the demo.
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { hexToBin } from "@bitauth/libauth";
import { serializeInvitation, deserializeInvitation } from "@xo-cash/utils";
import { openEngine, json, stop } from "./lib.mjs";

import { randomBytes } from "node:crypto";
const itemId = process.argv[2] ?? "ibUS4RXvCq";
const quoteNonce = process.argv[3] ?? randomBytes(9).toString("base64url"); // 12 chars, like Unlock's randomId(12)
const shared = deserializeInvitation(readFileSync(new URL(`../invitations/${itemId}.sell.json`, import.meta.url), "utf8"));
const id = shared.invitationIdentifier;
const buyer = await openEngine("buyer");
const log = (...a) => console.log("•", ...a);

// 2. Buyer: accept the shared invitation, fund it from its own coins, add change, sign.
let b = await buyer.engine.acceptInvitation(shared, { roleIdentifier: "buyer" });
// Pick the smallest plain-BCH coin that covers price + fee + a margin for the miner fee.
const need = shared.commits.flatMap((c) => c.data.variables ?? []).filter((v) => ["priceSatoshis", "feeSatoshis"].includes(v.variableIdentifier)).reduce((n, v) => n + BigInt(v.value), 0n) + 1000n;
const coins = (await buyer.engine.listUnspentOutputs()).filter((u) => !u.tokenCategory && !u.reservedBy && BigInt(u.valueSatoshis) >= need)
  .sort((a, b) => a.valueSatoshis - b.valueSatoshis).slice(0, 1);
log("checkout nonce", quoteNonce);
log("buyer coins", coins.map((c) => `${c.outpointTransactionHash.slice(0, 8)}:${c.outpointIndex}=${c.valueSatoshis}`).join(", ") || "none");
if (!coins.length) throw new Error("buyer has no coins: run scripts/address.mjs buyer and fund it");
b = await buyer.engine.appendInvitation(id, {
  templateIdentifier: buyer.unlockId,
  actionIdentifier: "sell",
  variables: [{ variableIdentifier: "quoteNonce", value: quoteNonce, roleIdentifier: "buyer" }],
  outputs: [{ outputIdentifier: "unlockTagOutput" }], // OP_RETURN "UNLK" <itemId> <quoteNonce>
  inputs: coins.map((c) => ({ outpointTransactionHash: hexToBin(c.outpointTransactionHash), outpointIndex: c.outpointIndex, roleIdentifier: "buyer" })),
});
b = await buyer.engine.addChangeToInvitation(id);
log("missing before signing:", json(await buyer.engine.listMissingRequirements(id)));
for (const i of await buyer.engine.listOwnInputIndexes(id)) b = await buyer.engine.signInvitation(id, i);
log("missing after signing:", json(await buyer.engine.listMissingRequirements(id)));

mkdirSync(new URL("../invitations/", import.meta.url), { recursive: true });
const out = new URL(`../invitations/${itemId}.purchase.json`, import.meta.url);
writeFileSync(out, serializeInvitation(b.invitation));
log("invitation saved to", out.pathname);

// 3. Execute: build and (unless DRY) broadcast.
const r = await buyer.engine.executeAction(id, { broadcastTransaction: !process.env.DRY });
log(process.env.DRY ? "built (not broadcast)" : "broadcast", "txid", r.builtTransaction.transactionHash, `(${r.builtTransaction.transactionByteLength} bytes)`);
writeFileSync(out, serializeInvitation(r.storedInvitation.invitation));
await stop(buyer.engine);
process.exit(0);
