# Graph Report - sweep  (2026-10-19)

## Corpus Check
- 8 files · ~14,736 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 66 nodes · 125 edges · 9 communities (7 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6e7cc8c1`
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

## God Nodes (most connected - your core abstractions)
1. `plan()` - 8 edges
2. `treeKeyPublicKey()` - 8 edges
3. `addressFromPublicKey()` - 8 edges
4. `hashConcat()` - 7 edges
5. `Keccak()` - 7 edges
6. `SHA3()` - 6 edges
7. `serMiniData()` - 6 edges
8. `serMiniNumber()` - 6 edges
9. `decAdd()` - 5 edges
10. `mmrLeaf()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `hashConcat()` --calls--> `SHA3()`  [EXTRACTED]
  derive.js → derive.js  _Bridges community 1 → community 4_
- `addressFromPublicKey()` --calls--> `serMiniData()`  [EXTRACTED]
  derive.js → derive.js  _Bridges community 4 → community 5_
- `addressFromPublicKey()` --calls--> `utf8Bytes()`  [EXTRACTED]
  derive.js → derive.js  _Bridges community 1 → community 5_

## Import Cycles
- None detected.

## Communities (9 total, 2 thin omitted)

### Community 0 - "sweep-plan.js"
Cohesion: 0.27
Nodes (13): chunkInto(), coinAmount(), decAdd(), isMinima(), jobSum(), mxFromHex(), normalizeScript(), padEnd() (+5 more)

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

## Knowledge Gaps
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `addressFromPublicKey()` connect `addressFromPublicKey` to `derive.js`, `treeKeyPublicKey`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._