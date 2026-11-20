# 🔓 Unlock: sell anything for Bitcoin Cash, with one link

**Live:** https://162-35-99-74.sslip.io · **Source:** https://github.com/aquarush/unlock · **BCH BLAZE 2026** entry (Mainnet track + Paytaca *Decentralized Identity* bounty)

Turn a secret text, a private link or a file into a payment link. Buyers pay in BCH from their
own wallet in one tap and instantly get the content, plus a **CashToken NFT receipt** that
re-opens it on any device. Sellers can be paid at their **Nostr identity** (`npub…` or
`name@domain`) instead of a long address, and buyers see a **✓ Nostr-verified seller** badge.

No accounts. No emails. No custody: payments go straight from buyer to seller.

## Features

- **Payment links in 10 seconds.** Price in USD, paid in BCH at the live rate. Listing is free.
- **One-tap checkout over [WizardConnect](https://wizardconnect.cash).** Works with Paytaca, Cashonize and
  any WizardConnect wallet. Private keys never leave the wallet.
- **NFT receipts.** Every purchase mints a CashToken NFT (commitment = item id) to the buyer, with
  [BCMR](https://cashtokens.org/docs/bcmr/chip/) metadata so wallets show it as "Unlock Receipt".
- **Re-open anywhere.** *My library* finds your receipts. You prove ownership by signing a
  transaction that is never broadcast, so the NFT never moves. Gift or resell the NFT and access goes with it.
- **BCH ⇄ Nostr identity** ([spec](IDENTITY.md)). Link your wallet to your Nostr key with two
  cross-signatures, published to public relays. Anyone can verify it without Unlock. Used for seller badges,
  pay-to-npub and challenge-response sign-in.
- **Live sales feed and seller dashboard** with on-chain links for every payment and receipt.

## How it works

```
Buyer wallet ──(1 tx: price → seller, fee → minter, OP_RETURN "UNLK" <item id>)──▶ BCH network
                                     │
Unlock server ── verifies the tx outputs + tag ──▶ reveals content
               └─ mints NFT receipt to the buyer (minting baton held by the minter key)

Later: wallet signs an *unbroadcast* tx spending the receipt + server nonce ──▶ content re-opened
```

- The payment and the "UNLK" tag are in **one transaction**, so the server only needs that
  transaction to verify a purchase. Re-submitting the same payment never mints twice.
- The receipt fee (3%, minimum 2,000 sats ≈ 1¢) funds the NFT mint. Sellers get 100% of their price.

### Decentralized identity (Paytaca bounty)

| Requirement | Unlock |
|---|---|
| Self-custodied link | Nostr key via NIP-07 extension or a browser-held key; BCH via WizardConnect |
| Two-way cryptographic binding | NIP-39 kind 10011 event `["i", "<cashaddr>", "<proof>"]`, plus a BCH-signed proof naming the npub |
| Decentralized discovery | Public relays: by npub (`authors`) or by address (`#i` filter) |
| Verification and authentication | In-browser verifier (`/id/<npub or address>`), `npm run verify-id`, challenge-response sign-in (`/api/identity/*`) |
| Stretch: pay via identity | Sellers list under `npub…` / `name@domain`; listings show the verified badge |

The BCH proof is a transaction that spends a *virtual* coin (BIP-322 style). It can never be
broadcast and verifies with no blockchain access. Full spec: **[IDENTITY.md](IDENTITY.md)**.

## Tech

Next.js 16 (App Router) · TypeScript · [libauth](https://libauth.org) (tx building, signing, BCH VM verification) ·
[@electrum-cash/network](https://www.npmjs.com/package/@electrum-cash/network) (Fulcrum) ·
WizardConnect · nostr-tools (keys/signatures only; small custom relay client) · Upstash Redis (or a local JSON file) ·
self-hosted on a VPS (Next.js standalone build behind Apache).

| Path | What |
|---|---|
| `src/lib/bch.ts`, `src/lib/wallet.ts` | address helpers, tx building, WizardConnect signing |
| `src/server/verify.ts`, `src/server/mint.ts` | payment and ownership-proof verification, NFT minting |
| `src/lib/identity.ts`, `src/lib/nostr.ts` | BCH ⇄ Nostr link protocol and relay client |
| `src/app/api/*` | listings, quotes, purchase, proofs, identity sign-in |
| `scripts/setup.ts` | minter key, token genesis + BCMR |

## Run it yourself

```bash
npm install
npm run setup                 # creates a minter key in .env.local, prints its address
# send ~0.002 BCH to that address, then:
npm run setup -- genesis https://your-domain   # creates the receipt token + public/bcmr.json
npm run dev
```

**Free testing on chipnet** (no real money):

```bash
npm run setup:chipnet                              # chipnet minter key in .env.chipnet
# get free tBCH: https://chipnet.bch.ninja or https://tbch.googol.cash
npm run setup:chipnet -- genesis http://localhost:3000
npm run dev:chipnet                                # shows a blue "CHIPNET" banner
```

Environment variables (production): `MINTER_WIF`, `TOKEN_CATEGORY`, `APP_SECRET`, `NEXT_PUBLIC_SITE_URL`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`; optional `BLOB_READ_WRITE_TOKEN` (file uploads),
`NEXT_PUBLIC_BCH_NETWORK=chipnet`, `NEXT_PUBLIC_REPO_URL`, `NEXT_PUBLIC_SLIDES_URL`, `NEXT_PUBLIC_DONATION_ADDRESS`.

Deploy to your own server (standalone build, systemd service behind a reverse proxy; secrets stay in
`/etc/unlock.env` on the server):

```bash
VPS=root@your-server SITE=https://your-domain ./scripts/deploy-vps.sh
```

Verify any identity link from the terminal:

```bash
npm run verify-id -- npub1…   |   bitcoincash:q…   |   alice@example.com
```

## Unlock on XO

The purchase flow is also available as an [XO](https://stack.xo.cash/) template, with chipnet transactions that pass
the app's own payment verifier: see **[xo/README.md](xo/README.md)**.

## Security notes

- The server never holds buyer or seller funds; only the minter key (which holds the minting baton and
  receipt fees) lives on the server.
- Content is revealed only after the payment transaction is verified and accepted by the network.
- Access tokens and price quotes are HMAC-signed; sign-in nonces are single-use.
