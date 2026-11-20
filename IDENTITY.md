# BCH ⇄ Nostr identity links (v1)

A small, open way to prove that a **Bitcoin Cash address** and a **Nostr key** belong to the same
person. Anyone can verify the link from public Nostr relays, with **no server, no database and
no custodian**. Unlock uses it for verified-seller badges, paying a seller at their `npub` or
`name@domain` instead of a long address, and challenge-response sign-in.

It builds on [NIP-39](https://github.com/nostr-protocol/nips/blob/master/39.md) (external
identities) and works with **any WizardConnect wallet**: the BCH side is a signed transaction,
so wallets don't need a message-signing feature.

## The link: two signatures that point at each other

| Direction | Signed by | Where it lives |
|---|---|---|
| Nostr → BCH | the Nostr key | a NIP-39 **kind 10011** event with tag `["i", "<cashaddr>", "<proof>"]` |
| BCH → Nostr | the address's key | `<proof>`: a BCH transaction whose OP_RETURN names the `npub` |

Listing a BCH address in a profile only gives you the first direction. The second signature
proves the address owner agreed, and neither key is reused or revealed.

### 1. Nostr event (kind 10011, replaceable)

```json
{
  "kind": 10011,
  "pubkey": "<hex pubkey>",
  "tags": [
    ["i", "bitcoincash:qr3q…6y0r", "0200000001…"],
    ["i", "github:alice", "<gist id>"]
  ],
  "content": "",
  "sig": "…"
}
```

* The `i` value is the full CashAddr: NIP-39 platform `bitcoincash` (or `bchtest` on chipnet),
  identity = the address payload. Relays index single-letter tags, so links can be found
  **by address** with the filter `{"kinds":[10011], "#i":["bitcoincash:q…"]}` and **by key** with
  `{"kinds":[10011], "authors":["<hex>"]}`.
* Other NIP-39 claims in the same event are preserved; clients must merge, not overwrite.
* Unlinking = publishing a newer kind 10011 without that `i` tag.

### 2. BCH proof (hex-encoded transaction, never broadcast)

* **Output:** `OP_RETURN "BCHNOSTR" "Verifying that I control the following Nostr public key: <npub>"`
  (NIP-39's standard sentence; verifiers accept any text in the second push that contains the npub).
* **Input 0:** a P2PKH input signed by the linked address's key (`SIGHASH_ALL | FORKID`).
* **Virtual coin (default, BIP-322 style):** input 0 spends outpoint
  `sha256("bch-nostr-link:v1:<cashaddr>:<hex pubkey>") : 0`, with source output
  `{ lockingBytecode: P2PKH(address), valueSatoshis: 0 }`.
  That coin can't exist on chain, so the proof **can never be broadcast or move funds**,
  and verifying it needs **no blockchain access**.
* **Coin proof (fallback):** if a wallet refuses to sign a virtual coin, input 0 may spend a real
  coin of the address back to itself. Verifiers then fetch that source output from any
  Electrum/Fulcrum server. The proof stays valid after the coin is spent, because it proves
  control at signing time.

## Verifying

1. Check the Nostr event signature (`verifyEvent`) and `kind == 10011`.
2. For each `i` tag whose value is a valid CashAddr:
   1. decode `<proof>` as a BCH transaction;
   2. an OP_RETURN output pushes `BCHNOSTR`, then text containing `npub(event.pubkey)`;
   3. input 0's unlocking script is `<sig> <pubkey>` and `hash160(pubkey)` matches the address;
   4. rebuild the source outputs (virtual coin as above, otherwise fetch from chain) and run the
      BCH virtual machine (`libauth createVirtualMachineBch().verify`). Every input must pass.
3. Use the newest kind 10011 event per pubkey.

Reference code: [`src/lib/identity.ts`](src/lib/identity.ts) (isomorphic: browser, Node, edge)
and [`src/lib/nostr.ts`](src/lib/nostr.ts) (a dependency-free relay client).

```bash
npm run verify-id -- npub1…              # by key
npm run verify-id -- bitcoincash:q…      # by address
npm run verify-id -- alice@example.com   # by NIP-05
```

## Sign-in (challenge-response)

1. The app issues a random nonce (`GET /api/identity/challenge`, HMAC-signed, expires in 5 min, single-use).
2. The user signs a kind **22242** event with tags `["challenge", nonce]` and `["relay", origin]`.
3. The app checks the Nostr signature and nonce, then looks up and verifies that pubkey's BCH
   links on public relays (`POST /api/identity/auth`). No account database: the identity is the key pair.

## Security notes

* **Both keys must sign**, so you can't claim someone else's address, and you can't attach your
  address to someone else's npub. A copied proof fails because the OP_RETURN names one specific npub.
* Virtual-coin proofs are unspendable by construction (the outpoint is a hash, not a real txid).
* Proofs bind address ⇄ key and nothing else. Freshness comes from the newest Nostr event;
  revoke by publishing a newer kind 10011.
* Supported: standard single-key P2PKH addresses, the default in BCH wallets.
  P2SH and multisig are future work.
