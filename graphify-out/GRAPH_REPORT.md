# Graph Report - sweep  (2026-10-20)

## Corpus Check
- 8 files · ~16,178 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 76 nodes · 135 edges · 10 communities (8 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f81fe757`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- sweep-plan.js
- derive.js
- mds.js
- Keccak
- treeKeyPublicKey
- addressFromPublicKey
- sweep-plan.test.js
- Sweep — sweep everything on this node to one validated Mx address

## God Nodes (most connected - your core abstractions)
1. `Sweep — sweep everything on this node to one validated Mx address` - 8 edges
2. `plan()` - 8 edges
3. `treeKeyPublicKey()` - 8 edges
4. `addressFromPublicKey()` - 8 edges
5. `hashConcat()` - 7 edges
6. `Keccak()` - 7 edges
7. `SHA3()` - 6 edges
8. `serMiniData()` - 6 edges
9. `serMiniNumber()` - 6 edges
10. `decAdd()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `hashConcat()` --calls--> `SHA3()`  [EXTRACTED]
  derive.js → derive.js  _Bridges community 1 → community 4_
- `addressFromPublicKey()` --calls--> `serMiniData()`  [EXTRACTED]
  derive.js → derive.js  _Bridges community 4 → community 5_
- `addressFromPublicKey()` --calls--> `utf8Bytes()`  [EXTRACTED]
  derive.js → derive.js  _Bridges community 1 → community 5_

## Import Cycles
- None detected.

## Communities (10 total, 2 thin omitted)

### Community 0 - "sweep-plan.js"
Cohesion: 0.25
Nodes (14): chunkInto(), coinAmount(), decAdd(), isMinima(), jobSum(), mxFromHex(), normalizeScript(), padEnd() (+6 more)

### Community 1 - "derive.js"
Cohesion: 0.29
Nodes (9): bigIntegerToByteArray(), cleanSeedPhrase(), encode32(), gmssNextSeed(), minimaAddress(), seedFromPhrase(), SHA3(), utf8Bytes() (+1 more)

### Community 2 - "mds.js"
Cohesion: 0.27
Nodes (5): httpPostAsync(), httpPostAsyncPoll(), MDSPostMessage(), PollListener(), postMDSFail()

### Community 4 - "treeKeyPublicKey"
Cohesion: 0.57
Nodes (7): hashConcat(), mmrLeaf(), mmrParent(), mmrPerfectRoot(), serMiniData(), serMiniNumber(), treeKeyPublicKey()

### Community 5 - "addressFromPublicKey"
Cohesion: 0.50
Nodes (5): addressFromPublicKey(), deriveAddress(), modifierBytes(), privateSeed(), toHexUpper()

### Community 9 - "Sweep — sweep everything on this node to one validated Mx address"
Cohesion: 0.22
Nodes (8): Advanced path — migrate to block-as-keyuses, Files, Install, Package, Simple path (default), Sweep — sweep everything on this node to one validated Mx address, The sweep engine (both paths), Validation log

## Knowledge Gaps
- **7 isolated node(s):** `Simple path (default)`, `Advanced path — migrate to block-as-keyuses`, `The sweep engine (both paths)`, `Install`, `Files` (+2 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `Simple path (default)`, `Advanced path — migrate to block-as-keyuses`, `The sweep engine (both paths)` to the rest of the system?**
  _7 weakly-connected nodes found - possible documentation gaps or missing edges._