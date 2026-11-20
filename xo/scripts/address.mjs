// Prints a receiving address for an account, so it can be funded from a chipnet faucet.
import { lockingBytecodeToCashAddress, hexToBin } from "@bitauth/libauth";
import { openEngine } from "./lib.mjs";
const who = process.argv[2] ?? "buyer";
const { engine, unlockId } = await openEngine(who);
const hex = await engine.generateLockingBytecodeFromDefaultPolicy("address");
const addr = lockingBytecodeToCashAddress({ bytecode: hexToBin(hex), prefix: "bchtest" });
console.log(who, "template", unlockId);
console.log(who, "address", addr.address ?? addr);
await engine.stop().catch(() => {});
process.exit(0);
