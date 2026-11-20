// Follow-up action: the seller spends a sale output (locked to the template's sellerLockingScript) with "withdraw".
// The sale output offers this action through sellerLockingScript.roles.seller.actions.
// usage: node scripts/withdraw.mjs <bchtest:address | locking bytecode hex>     (DRY=1 to build without broadcasting)
import { writeFileSync, mkdirSync } from "node:fs";
import { cashAddressToLockingBytecode, binToHex, hexToBin } from "@bitauth/libauth";
import { serializeInvitation } from "@xo-cash/utils";
import { openEngine, json, stop } from "./lib.mjs";

const to = process.argv[2];
if (!to) throw new Error("usage: node scripts/withdraw.mjs <bchtest:address>");
const toLock = to.includes(":") ? binToHex(cashAddressToLockingBytecode(to).bytecode) : to;
const { engine, unlockId } = await openEngine("seller");
const log = (...a) => console.log("•", ...a);

const template = await engine.getTemplate(unlockId);
const intent = template.lockingScripts.sellerLockingScript.roles.seller.actions.find((a) => a.action === "withdraw");
const sales = (await engine.listUnspentOutputs()).filter((u) => u.templateIdentifier === unlockId && !u.reservedBy && !u.tokenCategory);
log("sale outputs", sales.map((u) => `${u.outpointTransactionHash.slice(0, 8)}:${u.outpointIndex}=${u.valueSatoshis}`).join(", ") || "none");
if (!sales.length) throw new Error("no unspent sale outputs; run sell.mjs + buy.mjs first and wait for the seller engine to see the payment");

const total = sales.reduce((n, u) => n + BigInt(u.valueSatoshis), 0n);
const fee = 200n + 150n * BigInt(sales.length);
let s = await engine.createInvitation({ templateIdentifier: unlockId, actionIdentifier: "withdraw", intent });
const id = s.invitation.invitationIdentifier;
s = await engine.appendInvitation(id, {
  templateIdentifier: unlockId,
  actionIdentifier: "withdraw",
  variables: [
    { variableIdentifier: "withdrawLockingScript", value: toLock },
    { variableIdentifier: "withdrawSatoshis", value: total - fee },
  ],
  inputs: sales.map((u) => ({ outpointTransactionHash: hexToBin(u.outpointTransactionHash), outpointIndex: u.outpointIndex, roleIdentifier: "seller" })),
  outputs: [{ outputIdentifier: "withdrawOutput" }],
});
for (const i of await engine.listOwnInputIndexes(id)) s = await engine.signInvitation(id, i);
log("missing:", json(await engine.listMissingRequirements(id)));
const r = await engine.executeAction(id, { broadcastTransaction: !process.env.DRY });
mkdirSync(new URL("../invitations/", import.meta.url), { recursive: true });
const out = new URL(`../invitations/withdraw-${r.builtTransaction.transactionHash.slice(0, 8)}.json`, import.meta.url);
writeFileSync(out, serializeInvitation(r.storedInvitation.invitation));
log(process.env.DRY ? "built (not broadcast)" : "broadcast", "txid", r.builtTransaction.transactionHash, "withdrew", total - fee, "sats");
log("invitation saved to", out.pathname);
await stop(engine);
process.exit(0);
