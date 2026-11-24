// Build with XO: Unlock "split sale". The seller starts a splitSale invitation and sets the item, both shares and the fee.
// Writes invitations/<itemId>.split-sell.json for the collaborator (scripts/split-join.mjs).
// usage: node scripts/split-sell.mjs [itemId] [sellerShareSats] [collaboratorShareSats]
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { decodePrivateKeyWif, secp256k1, hash160, binToHex } from "@bitauth/libauth";
import { serializeInvitation } from "@xo-cash/utils";
import { openEngine, stop } from "./lib.mjs";

const itemId = process.argv[2] ?? "spLitDemo1";
const sellerShare = BigInt(process.argv[3] ?? 1500);
const collaboratorShare = BigInt(process.argv[4] ?? 1000);
const price = sellerShare + collaboratorShare;
const fee = price * 300n / 10000n > 2000n ? price * 300n / 10000n : 2000n; // Unlock's rule on the full price: 3%, min 2,000 sats

const env = Object.fromEntries(readFileSync(new URL("../../.env.chipnet", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const minterKey = decodePrivateKeyWif(env.MINTER_WIF);
const minterLock = "76a914" + binToHex(hash160(secp256k1.derivePublicKeyCompressed(minterKey.privateKey))) + "88ac";

const { engine, splitId } = await openEngine("seller");
const log = (...a) => console.log("•", ...a);
const intent = (await engine.getTemplate(splitId)).start.find((s) => s.action === "splitSale");
let s = await engine.createInvitation({ templateIdentifier: splitId, actionIdentifier: "splitSale", intent });
const id = s.invitation.invitationIdentifier;
log("seller created split invitation", id);
s = await engine.appendInvitation(id, {
  templateIdentifier: splitId,
  actionIdentifier: "splitSale",
  variables: [
    { variableIdentifier: "itemId", value: itemId },
    { variableIdentifier: "sellerShareSatoshis", value: sellerShare },
    { variableIdentifier: "collaboratorShareSatoshis", value: collaboratorShare },
    { variableIdentifier: "feeSatoshis", value: fee },
    { variableIdentifier: "feeLockingScript", value: minterLock },
  ],
  outputs: [
    { outputIdentifier: "sellerShareOutput", roleIdentifier: "seller" },
    { outputIdentifier: "receiptFeeOutput" },
  ],
});
log("item", itemId, "seller share", sellerShare, "collaborator share", collaboratorShare, "fee", fee);
mkdirSync(new URL("../invitations/", import.meta.url), { recursive: true });
const file = new URL(`../invitations/${itemId}.split-sell.json`, import.meta.url);
writeFileSync(file, serializeInvitation(s.invitation));
log("invitation for the collaborator:", file.pathname);
await stop(engine);
process.exit(0);
