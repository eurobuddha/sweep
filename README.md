# Sweep — sweep everything on this node to one validated Mx address

Sweeps every spendable coin on a Minima node to **one destination address** in one action.

## Simple path (default)

Open the dapp, **paste the Mx address** to sweep to, press **Validate**. The destination is
checked three ways before anything can move:

1. **Mx-only format** — the `0x` form is refused (no checksum); the base32-remap charset
   catches `I`/`L`/`O`/`X` typos instantly; lowercase `mx…` is normalized.
2. **The node's own decoder** — `checkaddress` routes through
   `Address.convertMinimaAddress`, which re-verifies the 4-byte SHA3-256 checksum and
   refuses any corruption (`Invalid MxAddress - checksum wrong`).
3. **Byte-exact round-trip** — the dapp recomputes the Mx form from the node-decoded `0x`
   bytes (`sweep-plan.js mxFromHex`, core `Address.makeMinimaAddress` ported byte-exact)
   and requires an exact match. The gate re-runs at sweep time, and the node checks the
   checksum a third time inside every `txnoutput`.

If the pasted address belongs to this node's own wallet you get a loud warning (the sweep
would send the funds back to this same node) but it is allowed — that is consolidation.

## Advanced path — migrate to block-as-keyuses

For moving a classic node's funds to a `-blockaskeyuses` node running the **same seed**
(behind the "Advanced" toggle):

1. **Derive** — reads the node's own vault seed (or a typed phrase) and derives, on-device,
   both key sets the seed produces: the **64 classic keys** (64-leaf WOTS trees, what this
   node runs on) and the **32 block-as-keyuses keys** (128-leaf trees, what the same seed
   produces on a minimaCore 1.1.2.31+ node started with `-blockaskeyuses`). The seed never
   leaves the dapp.
2. **Prove** — the derived classic set must reproduce the node's own default wallet
   addresses (`scripts`, `default:true simple:true`) byte-exact. Only then is the
   derivation trusted, which makes the 32 new addresses safe destinations: same seed,
   same proven math. If the node's defaults match the 128-leaf set instead, the node is
   already block-as-keyuses and sweeping stays disabled.
3. Pick one of the 32 derived keys as the destination (it must **exist in the derived
   set** — a destination that isn't one of this seed's keys is refused).

After a migration sweep this classic node correctly shows the funds as **gone** — they
belong to the block-as-keyuses keys. Restore the same seed on a `-blockaskeyuses` node
(e.g. `megammrsync action:resync` with the phrase — no `keyuses` value needed, the block
height replaces the counter) to use them.

## The sweep engine (both paths)

Mirrors the `apks/wallet` SweepFlow contract:

- plain fungible tokens and native Minima: pooled exact-sum transactions, same-address
  coins grouped, chunked at **10 inputs / 4 distinct keys / ~48K estimated bytes** per txn
  (64K TxPoW cap); a size refusal splits the chunk in half and retries (coins untouched —
  the refusal is txnpost's synchronous pre-check); over-budget singles are attempted last
  so a refusal cannot block the rest;
- coins carrying state or a non-trivial token script: one transaction each, state
  replayed verbatim via `txnstate`;
- pipeline per txn: `txncreate → txninput… → [txnstate…] → txnoutput → txnsign
  publickey:auto txnpostauto:true txndelete:true`; **every error path runs `txndelete`**;
  a 120s watchdog per command so a silent node cannot wedge the batch; a failed
  transaction never stops the rest;
- nothing is called swept until `coins relevant:true` shows every spent coin gone
  (NEWBLOCK-driven + 20s fallback poll, 15-minute window, then honest straggler report
  and re-sweep of only the remaining coins).

## Install

```
mds action:install file:sweep-0.2.0.mds.zip trust:write
```

WRITE trust is required (transaction commands; the advanced path also reads the vault).
With READ the dapp validates addresses and derives from a typed phrase but cannot sweep.

## Files

- `index.html` — the whole app (UI + validation/verification gates + sweep engine).
- `sweep-plan.js` — pure planning logic: exact decimal sums (`BigInt`, Minima's 44
  decimals), coin classification, size-aware chunking, split, Mx checksum math and both
  destination gates. Tested by `sweep-plan.test.js` (`node sweep-plan.test.js`).
- `derive.js`, `derive.worker.js`, `sha3.js`, `wordlist.js` — copied **verbatim** from
  `mds/keyuses/phrase` (byte-exact against Minima's Java engine golden vectors; see
  `mds/keyuses/phrase/derive.test.js`). FUND-ADJACENT — never edit here; fix upstream in
  keyuses and re-copy.
- `mds.js` — stock MDS library.

## Package

```
zip -r sweep-<ver>.mds.zip dapp.conf icon.svg index.html mds.js sha3.js wordlist.js derive.js derive.worker.js sweep-plan.js
```

## Validation log

- `sweep-plan.test.js` — decimal math, classification, chunk caps + byte budget, split,
  size-refusal detection, Mx golden vector (live-node pair), both destination validators,
  watchdog harness against the real extracted `runJob` code: all green.
- 2026-10-19 — live check against a running `-test` node (RPC): derive.js reproduced all
  8 of the node's default wallet addresses from its vault seed (the exact gate the dapp
  runs); block-as-keyuses derivation produced well-formed addresses. The full 64-key
  classic shape and the 128-leaf shape are golden-vector proven in `mds/keyuses`.
- 2026-10-19 — destination gate tested against the shipped zip contents with a genuinely
  derived 128-leaf block key: real key allowed; 0x form refused; valid-but-not-in-set
  refused; checksum-broken refused. Node-side: one-char-flipped Mx refused by `txnoutput`
  with `Invalid MxAddress - checksum wrong`.
- 2026-10-20 — pasted-path validation verified live against minima 1.1.2.4: valid Mx
  accepted with byte-exact node round-trip and local recompute; one-char-corrupted Mx
  refused by `checkaddress` with `Invalid MxAddress - checksum wrong`.
- A sweep itself has not yet been run end-to-end — first run should be on `~/minima4442`
  (dev node) with a small test token before any real migration.
