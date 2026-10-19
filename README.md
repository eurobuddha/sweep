# Sweep — classic → block-as-keyuses migration MiniDapp

Migrates a classic Minima node to the block-as-keyuses key scheme in one action:

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
3. **Sweep** — everything the node holds goes to ONE chosen block-as-keyuses address
   (key #1 by default), mirroring the `apks/wallet` SweepFlow contract:
   - plain fungible tokens and native Minima: pooled exact-sum transactions, same-address
     coins grouped, chunked at **10 inputs / 4 distinct keys** per txn (64K TxPoW cap);
     a size refusal splits the chunk in half and retries (coins untouched — the refusal
     is txnpost's synchronous pre-check);
   - coins carrying state or a non-trivial token script: one transaction each, state
     replayed verbatim via `txnstate`;
   - pipeline per txn: `txncreate → txninput… → [txnstate…] → txnoutput → txnsign
     publickey:auto txnpostauto:true txndelete:true`; **every error path runs
     `txndelete`**; a failed transaction never stops the rest;
   - nothing is called swept until `coins relevant:true` shows every spent coin gone
     (NEWBLOCK-driven + 20s fallback poll, 15-minute window, then honest straggler report
     and re-sweep of only the remaining coins).

After the sweep this classic node correctly shows the funds as **gone** — they belong to
the block-as-keyuses keys. Restore the same seed on a `-blockaskeyuses` node (e.g.
`megammrsync action:resync` with the phrase — no `keyuses` value needed, the block height
replaces the counter) to use them.

## Install

```
mds action:install file:sweep-0.1.0.mds.zip trust:write
```

WRITE trust is required (vault read + transaction commands). With READ the dapp derives
from a typed phrase but cannot sweep.

## Files

- `index.html` — the whole app (UI + verification gate + sweep engine).
- `sweep-plan.js` — pure planning logic: exact decimal sums (`BigInt`, Minima's 44
  decimals), coin classification, chunking, split. Tested by `sweep-plan.test.js`
  (`node sweep-plan.test.js`).
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

- `sweep-plan.test.js` — decimal math, classification, chunk caps, split, size-refusal
  detection: all green.
- 2026-10-19 — live check against a running `-test` node (RPC): derive.js reproduced all
  8 of the node's default wallet addresses from its vault seed (the exact gate the dapp
  runs); block-as-keyuses derivation produced well-formed addresses. The full 64-key
  classic shape and the 128-leaf shape are golden-vector proven in `mds/keyuses`.
- A sweep itself has not yet been run end-to-end — first run should be on `~/minima4442`
  (dev node) with a small test token before any real migration.
