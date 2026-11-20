# Raw engineering notes (facts for the feedback write-up — not the feedback itself)

The BCH BLAZE XO bounties require feedback that is **personally written**. These are just the facts
recorded while building, with versions and steps to reproduce, to write it from.

Versions: `@xo-cash/engine 0.1.1-next.18170561234` (pulls `@xo-cash/state 0.0.5`), `@xo-cash/utils 0.0.11`,
`@xo-cash/templates 0.0.12`, Node 22, chipnet.

1. **SQLite storage cannot start the engine.** `Engine.create(..., { storageType: StorageType.SQLITE })` throws
   `TypeError: this[#storage].listScriptHashes is not a function` from `#monitorStoredScriptHashes`.
   `SQLiteStorage` in `@xo-cash/state` 0.0.5 *and* 0.0.6 has no `listScriptHashes`; only `IndexedDBStorage` does.
   The README's Basic Setup example uses SQLITE. Workaround: `StorageType.INDEXEDDB` (works in Node via the shim).

2. **Output `lockingScript` CashAssembly expressions are decoded as UTF‑8, then hex-decoded.**
   `resolveTemplateOutputLockingBytecode` does `hexToBin(compileCashAssemblyString({ ..., evaluationDecodeMode: "utf8" }))`.
   So `"$(<0x6a04554e4c4b>)"` resolves to `000000`, and `"$(<itemId>)"` with `itemId = "ibUS4RXvCq"` to `000004000c`
   (garbage, silently, no error). It only works when the expression yields ASCII hex text, which is why
   `"$(<someLockingScriptVariable>)"` works. Expected `evaluationDecodeMode: "hex"` (or raw bytes).
   Same function, same issue for a `lockingBytecode` that is a `$()` expression.
   Repro: put `"lockingScript": "$(<0x6a04554e4c4b>)"` on an output and call `engine.resolveInvitationOutputLockingBytecode`.

3. **An OP_RETURN output needs a fake unlocking script.** Pointing an output at a template `lockingScripts` entry whose
   bytecode is `OP_RETURN …` fails in `appendInvitation` with `TemplateUnlockingScriptNotFoundError` for that locking script,
   although the output can never be spent. Workaround: `"unlockingBytecode": "unspendable"` with script `OP_RETURN`.
   Combined with (2) there is no clean way to write a data output whose bytes depend on a variable.

4. **Two engines cannot run in one Node process.** Creating a second `Engine` (different mnemonic, different database file)
   throws `Cannot configure storage for cache after it has been initialized.` from `@electrum-cash/application`.
   A seller + buyer demo therefore needs two processes passing the invitation as a file.

5. **`engine.stop()` rejects with an empty `AggregateError`** (`[AggregateError: All promises were rejected] { [errors]: [] }`)
   after otherwise successful runs, and the process does not exit by itself.

6. **Funds looked lost after wiping the engine database, then came back.** After deleting the database and re-opening the same
   mnemonic, `generateLockingBytecodeFromDefaultPolicy("address")` returned a *new* address and the 6,500 sats on the first one
   were not listed. A later run listed that coin again (`bf0ca477:0=6500`), so the engine rediscovers old keys eventually,
   but nothing says when or how. Worth documenting (gap limit / rescan).

7. **`JSON.stringify` of an invitation produces unusable output** (`Uint8Array` → `{"0":118,…}`, bigint throws without a replacer).
   `serializeInvitation` / `deserializeInvitation` from `@xo-cash/utils` are the right tools, but nothing in the engine README points to them.

8. Template validation requires an `inputs` object even when the template has no template inputs (`inputs: expected record, received undefined`).

9. **Inputs need `outpointTransactionHash` as bytes**, but `listUnspentOutputs()` returns it as a hex string. Passing the hex string
   straight into `appendInvitation({ inputs })` is accepted, then later fails deep inside `addChangeToInvitation` with
   `TypeError: bytes.reduce is not a function` (in `collapseInputsSpendingOneOutpoint`). Needs `hexToBin()`; a type check at append time would help.

10. **A failed or dry run keeps the coins reserved.** After the crash in (9), the same coins were reported as reserved by the dead invitation,
    so the next run found "no coins". `archiveInvitation` releases them (see `scripts/release.mjs`).

11. **An output that depends on another role's variable must be added by that role.** Once the tag became
    `OP_RETURN "UNLK" <itemId> <quoteNonce>` with the nonce supplied by the buyer, the seller's `appendInvitation` of that output failed with
    `LockingScriptResolutionsMissingError` (`missingIdentifiers: ['quoteNonce']`). Logical, but the template has no way to say which role adds an output.

12. Repeated log noise during normal runs: `Failed to process transaction update: Error: Could not validate a block header on height 339716:
    The requested header is ahead of the current checkpoint at height 314240` (chipnet). Runs still succeed.

## What worked well
- The role/action/invitation model maps directly onto Unlock's purchase: the seller fills in price, fee, item and
  their own payout key; the buyer only brings coins. Neither side needs to trust the other with keys.
- `addChangeToInvitation` + `listOwnInputIndexes` + `signInvitation` + `executeAction` was all that was needed on the buyer side.
- `listMissingRequirements` is a useful "what is this invitation still waiting for" debugger.
- A follow-up action on the seller's payout output (`withdraw`) comes for free from `lockingScripts.*.roles.seller.actions`.
