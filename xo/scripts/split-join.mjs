// Collaborator joins the seller's splitSale invitation: generates their own key and adds their share output.
// Reads invitations/<itemId>.split-sell.json, writes invitations/<itemId>.split-join.json for the buyer.
// usage: node scripts/split-join.mjs [itemId]
import { writeFileSync, readFileSync } from "node:fs";
import { serializeInvitation, deserializeInvitation } from "@xo-cash/utils";
import { openEngine, stop } from "./lib.mjs";

const itemId = process.argv[2] ?? "spLitDemo1";
const shared = deserializeInvitation(readFileSync(new URL(`../invitations/${itemId}.split-sell.json`, import.meta.url), "utf8"));
const id = shared.invitationIdentifier;
const { engine, splitId } = await openEngine("collaborator");
const log = (...a) => console.log("•", ...a);
let c = await engine.acceptInvitation(shared, { roleIdentifier: "collaborator" }); // generates collaboratorKey
c = await engine.appendInvitation(id, {
  templateIdentifier: splitId,
  actionIdentifier: "splitSale",
  outputs: [{ outputIdentifier: "collaboratorShareOutput", roleIdentifier: "collaborator" }],
});
log("collaborator joined", id, "and added their share output");
const file = new URL(`../invitations/${itemId}.split-join.json`, import.meta.url);
writeFileSync(file, serializeInvitation(c.invitation));
log("invitation for the buyer:", file.pathname);
await stop(engine);
process.exit(0);
