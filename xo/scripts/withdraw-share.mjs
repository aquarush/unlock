// Follow-up action of the split sale: the collaborator withdraws their share (outputs locked to collaboratorLockingScript).
// The collaborator engine must have seen the purchase: run split-sync.mjs first.
// usage: node scripts/withdraw-share.mjs <bchtest:address>     (DRY=1 to build without broadcasting)
import { writeFileSync } from "node:fs";
import { cashAddressToLockingBytecode, binToHex, hexToBin } from "@bitauth/libauth";
import { serializeInvitation } from "@xo-cash/utils";
import { openEngine, json, stop } from "./lib.mjs";

const to = process.argv[2];
if (!to) throw new Error("usage: node scripts/withdraw-share.mjs <bchtest:address>");
const toLock = to.includes(":") ? binToHex(cashAddressToLockingBytecode(to).bytecode) : to;
const { engine, splitId } = await openEngine("collaborator");
const log = (...a) => console.log("•", ...a);
const template = await engine.getTemplate(splitId);
const intent = template.lockingScripts.collaboratorLockingScript.roles.collaborator.actions.find((a) => a.action === "withdrawShare");
let shares = [];
for (let t = 0; t < 20 && !shares.length; t++) {
  shares = (await engine.listUnspentOutputs()).filter((u) => u.templateIdentifier === splitId && !u.reservedBy && !u.tokenCategory);
  if (!shares.length) await new Promise((r) => setTimeout(r, 3000));
}
log("share outputs", shares.map((u) => `${u.outpointTransactionHash.slice(0, 8)}:${u.outpointIndex}=${u.valueSatoshis}`).join(", ") || "none");
if (!shares.length) throw new Error("no unspent share outputs yet");
const total = shares.reduce((n, u) => n + BigInt(u.valueSatoshis), 0n);
const fee = 200n + 150n * BigInt(shares.length);
let s = await engine.createInvitation({ templateIdentifier: splitId, actionIdentifier: "withdrawShare", intent });
const id = s.invitation.invitationIdentifier;
s = await engine.appendInvitation(id, {
  templateIdentifier: splitId,
  actionIdentifier: "withdrawShare",
  variables: [
    { variableIdentifier: "withdrawLockingScript", value: toLock },
    { variableIdentifier: "withdrawSatoshis", value: total - fee },
  ],
  inputs: shares.map((u) => ({ outpointTransactionHash: hexToBin(u.outpointTransactionHash), outpointIndex: u.outpointIndex, roleIdentifier: "collaborator" })),
  outputs: [{ outputIdentifier: "withdrawOutput" }],
});
for (const i of await engine.listOwnInputIndexes(id)) s = await engine.signInvitation(id, i);
log("missing:", json(await engine.listMissingRequirements(id)));
const r = await engine.executeAction(id, { broadcastTransaction: !process.env.DRY });
const out = new URL(`../invitations/withdraw-share-${r.builtTransaction.transactionHash.slice(0, 8)}.json`, import.meta.url);
writeFileSync(out, serializeInvitation(r.storedInvitation.invitation));
log(process.env.DRY ? "built (not broadcast)" : "broadcast", "txid", r.builtTransaction.transactionHash, "withdrew", total - fee, "sats");
log("invitation saved to", out.pathname);
await stop(engine);
process.exit(0);
