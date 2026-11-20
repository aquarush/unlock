import type { Metadata } from "next";
import { IdentityClient } from "./IdentityClient";

export const metadata: Metadata = {
  title: "Identity: link BCH ⇄ Nostr",
  description: "Link your Bitcoin Cash wallet to your Nostr identity with two cross-signatures. Verifiable by anyone, from public relays.",
};

export default function IdentityPage() {
  return <IdentityClient />;
}
