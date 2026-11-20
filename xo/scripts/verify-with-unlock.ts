// Checks an XO-built purchase with the ORIGINAL Unlock server's payment verifier (src/server/verify.ts),
// i.e. proves the migrated template produces payments the live app accepts.
// usage (from the repo root): set -a; . ./.env.chipnet; set +a
//   npx tsx --conditions=react-server xo/scripts/verify-with-unlock.ts <txid> <itemId> <nonce> <sellerSats> <feeSats>
import { decodeTransaction, hexToBin, lockingBytecodeToCashAddress } from "@bitauth/libauth";
import { verifyPayment } from "../../src/server/verify";
import { getRawTx } from "../../src/lib/electrum";

const [txid, listingId, nonce, sellerSats, feeSats] = process.argv.slice(2);
const hex = await getRawTx(txid);
const tx = decodeTransaction(hexToBin(hex));
if (typeof tx === "string") throw new Error(tx);
const addr = (i: number) => {
  const a = lockingBytecodeToCashAddress({ bytecode: tx.outputs[i].lockingBytecode, prefix: "bchtest" });
  if (typeof a === "string") throw new Error(a);
  return a.address;
};
// Seller address = output 0 of the template (sellerPaymentOutput); fee address = Unlock's chipnet minter (FEE_ADDRESS / minter).
const r = await verifyPayment(hex, {
  listingId, nonce, sellerAddress: addr(0), sellerSats: Number(sellerSats), feeAddress: addr(1), feeSats: Number(feeSats),
});
console.log("Unlock verifyPayment: OK", r);

// And the negative case: a wrong nonce must be rejected.
try {
  await verifyPayment(hex, { listingId, nonce: "wrong-nonce1", sellerAddress: addr(0), sellerSats: Number(sellerSats), feeAddress: addr(1), feeSats: Number(feeSats) });
  console.log("UNEXPECTED: wrong nonce accepted");
} catch (e) { console.log("wrong nonce rejected:", (e as Error).message); }
process.exit(0);
