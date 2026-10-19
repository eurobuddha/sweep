/* Sweep — pure planning logic (no MDS, no DOM): exact decimal sums, coin classification
   and chunking. Mirrors apks/wallet SweepFlow.plan/chunkInto: pooled chunked sends for
   native Minima and plain fungible tokens, per-coin whole transfers (state replayed
   verbatim) for anything carrying state or a non-trivial token script.
   Loaded by index.html and by sweep-plan.test.js (node). */
(function (root) {
  "use strict";

  // ponytail: static chunking keeps every pooled txn under the 64K TxPoW cap
  // (4 classic WOTS sigs ~34K + 10 inputs' node-attached MMR proofs); byte-exact
  // planning needs local serialization the node does for us — add if sweeps ever
  // hit size refusals faster than the split-retry handles them.
  var MAX_INPUTS_PER_TXN = 10;
  var MAX_KEYS_PER_TXN   = 4;
  var PLAIN_TOKEN_SCRIPT = "RETURN TRUE";

  /* Exact decimal addition on strings — Minima amounts carry up to 44 decimals,
     far past IEEE-754. Non-negative inputs only. */
  function decAdd(a, b) {
    function parts(x) { var m = String(x).split("."); return { i: m[0] || "0", f: m[1] || "" }; }
    var A = parts(a), B = parts(b);
    var fl = Math.max(A.f.length, B.f.length);
    var ai = BigInt(A.i + padEnd(A.f, fl));
    var bi = BigInt(B.i + padEnd(B.f, fl));
    var s = (ai + bi).toString();
    if (!fl) return s;
    while (s.length <= fl) s = "0" + s;
    var ip = s.slice(0, -fl), fp = s.slice(-fl).replace(/0+$/, "");
    return fp ? ip + "." + fp : ip;
  }
  function padEnd(s, n) { while (s.length < n) s += "0"; return s; }

  function normalizeScript(s) {
    return s == null ? "" : String(s).trim().replace(/\s+/g, " ").toUpperCase();
  }

  function isMinima(tokenid) { return tokenid === "0x00"; }

  /** The amount a coin moves: token units for a token coin, Minima otherwise. */
  function coinAmount(c) {
    return isMinima(c.tokenid) ? String(c.amount)
         : String(c.tokenamount !== undefined ? c.tokenamount : c.amount);
  }

  /** State entries as [{port, data}], tolerant of both array and object forms. */
  function stateEntries(c) {
    var st = c.state, out = [];
    if (Array.isArray(st)) {
      st.forEach(function (sv) {
        if (sv && sv.port !== undefined) out.push({ port: String(sv.port), data: String(sv.data) });
      });
    } else if (st && typeof st === "object") {
      Object.keys(st).forEach(function (p) { out.push({ port: p, data: String(st[p]) }); });
    }
    return out;
  }

  /**
   * Classify every coin into jobs. zCoins: coin JSON array from `coins relevant:true`.
   * zOwnAddrs: Set-like object of UPPER(0x address) -> true for addresses this node can
   * auto-sign (simple default keys). Returns { jobs, skipped, totals, signatures }.
   * Each job: { whole, tokenid, coins, label, states } — states only on whole jobs.
   */
  function plan(zCoins, zOwnAddrs) {
    var out = { jobs: [], skipped: [], totals: [], signatures: 0 };
    if (!zCoins || !zCoins.length) return out;

    var minima = [], fungible = {}, fungibleOrder = [], fungibleNames = {}, wholes = [];
    var minimaTotal = "0", tokenTotals = {};

    zCoins.forEach(function (c) {
      if (c.spent === true) return;
      var addr = String(c.address || "").toUpperCase();
      if (!zOwnAddrs[addr]) {
        out.skipped.push(c.coinid + " — address " + c.address + " is not one of this node's simple default keys");
        return;
      }
      if (isMinima(c.tokenid)) {
        minima.push(c);
        minimaTotal = decAdd(minimaTotal, c.amount);
        return;
      }
      var tok = (c.token && typeof c.token === "object") ? c.token : {};
      var name = (typeof tok.name === "object" && tok.name) ? String(tok.name.name || c.tokenid) : String(tok.name || c.tokenid);
      var hasState = stateEntries(c).length > 0;
      var plainTok = normalizeScript(tok.script) === PLAIN_TOKEN_SCRIPT;
      if (hasState || !plainTok) {
        wholes.push({ coin: c, name: name });
      } else {
        if (!fungible[c.tokenid]) { fungible[c.tokenid] = []; fungibleOrder.push(c.tokenid); }
        fungible[c.tokenid].push(c);
        fungibleNames[c.tokenid] = name;
        tokenTotals[c.tokenid] = decAdd(tokenTotals[c.tokenid] || "0", coinAmount(c));
      }
    });

    // 1. State / scripted coins — one transaction each, state replayed verbatim.
    wholes.forEach(function (w) {
      out.jobs.push({
        whole: true, tokenid: w.coin.tokenid, coins: [w.coin],
        label: w.name + " (" + w.coin.coinid + ")", states: stateEntries(w.coin)
      });
      out.signatures++;
    });
    if (wholes.length) out.totals.push({ label: "NFT / state items", value: wholes.length + " item(s), sent whole" });

    // 2. Plain fungible tokens — pooled, chunked.
    fungibleOrder.forEach(function (tid) {
      out.totals.push({ label: "Token \"" + fungibleNames[tid] + "\"",
                        value: tokenTotals[tid] + " (" + fungible[tid].length + " coin(s))" });
      chunkInto(out, fungible[tid], tid, fungibleNames[tid]);
    });

    // 3. Native Minima last.
    if (minima.length) {
      out.totals.push({ label: "Minima", value: minimaTotal + " (" + minima.length + " coin(s))" });
      chunkInto(out, minima, "0x00", "Minima");
    }

    return out;
  }

  /** Same-address coins grouped (one signature covers them all), at most
      MAX_KEYS_PER_TXN distinct addresses and MAX_INPUTS_PER_TXN inputs per txn. */
  function chunkInto(zPlan, zCoins, zTokenid, zName) {
    zCoins.sort(function (a, b) { return String(a.address) < String(b.address) ? -1 : 1; });
    var chunk = [], addrs = [], part = 1;
    function flush(last) {
      if (!chunk.length) return;
      zPlan.jobs.push({ whole: false, tokenid: zTokenid, coins: chunk,
        label: (part === 1 && last) ? zName : zName + " (part " + part + ")" });
      part++;
      zPlan.signatures += addrs.length;
      chunk = []; addrs = [];
    }
    zCoins.forEach(function (c) {
      var a = String(c.address).toUpperCase();
      var newKey = addrs.indexOf(a) < 0;
      if (chunk.length &&
          (chunk.length >= MAX_INPUTS_PER_TXN || (newKey && addrs.length >= MAX_KEYS_PER_TXN))) {
        flush(false);
        newKey = true;
      }
      chunk.push(c);
      if (addrs.indexOf(a) < 0) addrs.push(a);
    });
    flush(true);
  }

  /** The exact amount a pooled job sends (token units for tokens). */
  function jobSum(job) {
    var s = "0";
    job.coins.forEach(function (c) { s = decAdd(s, coinAmount(c)); });
    return s;
  }

  /** Split a pooled job in half (node refused it as too large; coins untouched). */
  function split(job) {
    var mid = Math.floor(job.coins.length / 2);
    return [
      { whole: false, tokenid: job.tokenid, coins: job.coins.slice(0, mid), label: job.label + " (split A)" },
      { whole: false, tokenid: job.tokenid, coins: job.coins.slice(mid), label: job.label + " (split B)" }
    ];
  }

  function isSizeRefusal(msg) {
    var m = String(msg || "").toLowerCase();
    return m.indexOf("size too large") >= 0 || m.indexOf("too big") >= 0;
  }

  /* Valid Mx charset: base32 digits 0-9a-v remapped i->w l->y o->z, uppercased —
     so I, L, O (and X) can never appear. Anything else is corrupt. */
  var MX_RE = /^Mx[0-9A-HJKMNP-VWYZ]+$/;

  /** Checksummed Mx form of a 0x address — byte-exact core Address.makeMinimaAddress:
      encode32( 0x01 || len:short || addr || SHA3-256(addr)[0..4] ).
      deps: { fromHex, encode32, sha3 } — on the page KeyUsesDerive._fromHex /
      KeyUsesDerive._encode32 and the sha3_256 global. */
  function mxFromHex(hex, deps) {
    var addr = deps.fromHex(hex);
    var checksum = deps.sha3.array(addr).slice(0, 4);
    return deps.encode32([0x01, (addr.length >> 8) & 0xFF, addr.length & 0xFF].concat(addr, checksum));
  }

  root.SweepPlan = {
    MAX_INPUTS_PER_TXN: MAX_INPUTS_PER_TXN,
    MAX_KEYS_PER_TXN: MAX_KEYS_PER_TXN,
    decAdd: decAdd,
    normalizeScript: normalizeScript,
    coinAmount: coinAmount,
    stateEntries: stateEntries,
    plan: plan,
    jobSum: jobSum,
    split: split,
    isSizeRefusal: isSizeRefusal,
    MX_RE: MX_RE,
    mxFromHex: mxFromHex
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.SweepPlan;

})(typeof self !== "undefined" ? self : (typeof globalThis !== "undefined" ? globalThis : this));
