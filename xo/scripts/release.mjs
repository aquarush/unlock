// Archives an account's open invitations, which releases the coins they reserved (failed or dry runs keep them reserved).
// usage: node scripts/release.mjs <seller|buyer>
import { openEngine, stop } from "./lib.mjs";
const who = process.argv[2] ?? "buyer";
const { engine } = await openEngine(who);
for (const s of await engine.listInvitations()) {
  if (s.archivedAtTimestamp) continue;
  await engine.archiveInvitation(s.invitation.invitationIdentifier);
  console.log("archived", s.invitation.invitationIdentifier, s.invitation.actionIdentifier);
}
console.log("reserved coins left:", (await engine.listUnspentOutputs()).filter((u) => u.reservedBy).length);
await stop(engine);
process.exit(0);
