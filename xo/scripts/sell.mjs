// Seller side of Unlock's purchase as an XO invitation on chipnet: create the "sell" invitation and fill in the listing.
// Writes the invitation to invitations/<itemId>.sell.json for the buyer (scripts/buy.mjs) to accept.
// usage: node scripts/sell.mjs [itemId] [priceSats]
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { decodePrivateKeyWif, secp256k1, hash160, binToHex } from "@bitauth/libauth";
import { serializeInvitation } from "@xo-cash/utils";
import { openEngine, json, stop } from "./lib.mjs";

const itemId = process.argv[2] ?? "ibUS4RXvCq";
const price = BigInt(process.argv[3] ?? 1000);
const fee = price * 300n / 10000n > 2000n ? price * 300n / 10000n : 2000n; // same rule as Unlock: 3%, min 2,000 sats

// The receipt fee goes to Unlock's chipnet minter, exactly like the original app.
const env = Object.fromEntries(readFileSync(new URL("../../.env.chipnet", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const minterKey = decodePrivateKeyWif(env.MINTER_WIF);
const minterLock = "76a914" + binToHex(hash160(secp256k1.derivePublicKeyCompressed(minterKey.privateKey))) + "88ac";

const seller = await openEngine("seller");
const log = (...a) => console.log("•", ...a);

// 1. Seller: start the "sell" action and fill in the listing.
const intent = (await seller.engine.getTemplate(seller.unlockId)).start.find((s) => s.action === "sell");
let s = await seller.engine.createInvitation({ templateIdentifier: seller.unlockId, actionIdentifier: "sell", intent });
const id = s.invitation.invitationIdentifier;
log("seller created invitation", id);
s = await seller.engine.appendInvitation(id, {
  templateIdentifier: seller.unlockId,
  actionIdentifier: "sell",
  variables: [
    { variableIdentifier: "itemId", value: itemId },
    { variableIdentifier: "priceSatoshis", value: price },
    { variableIdentifier: "feeSatoshis", value: fee },
    { variableIdentifier: "feeLockingScript", value: minterLock },
  ],
  outputs: [
    { outputIdentifier: "sellerPaymentOutput", roleIdentifier: "seller" },
    { outputIdentifier: "receiptFeeOutput" },
  ],
});
log("seller added price", price, "fee", fee, "item", itemId);

mkdirSync(new URL("../invitations/", import.meta.url), { recursive: true });
const file = new URL(`../invitations/${itemId}.sell.json`, import.meta.url);
writeFileSync(file, serializeInvitation(s.invitation));
log("invitation for the buyer:", file.pathname);
await stop(seller.engine);
process.exit(0);
