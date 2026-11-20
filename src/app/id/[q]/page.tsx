import type { Metadata } from "next";
import { LookupClient } from "./LookupClient";

type Props = { params: Promise<{ q: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const q = decodeURIComponent((await params).q);
  return { title: `Identity ${q.length > 24 ? `${q.slice(0, 16)}…` : q}`, description: "Verified BCH ⇄ Nostr identity link." };
}

export default async function LookupPage({ params }: Props) {
  return <LookupClient q={decodeURIComponent((await params).q)} />;
}
