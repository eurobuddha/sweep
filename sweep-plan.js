/* Sweep — pure planning logic (no MDS, no DOM): exact decimal sums, coin classification
   and chunking. Mirrors apks/wallet SweepFlow.plan/chunkInto: pooled chunked sends for
   native Minima and plain fungible tokens, per-coin whole transfers (state replayed
   verbatim) for anything carrying state or a non-trivial token script.
   Loaded by index.html and by sweep-plan.test.js (node). */
(function (root) {
  "use strict";

  var MAX_INPUTS_PER_TXN = 10;
  var MAX_KEYS_PER_TXN   = 4;
  var PLAIN_TOKEN_SCRIPT = "RETURN TRUE";

  /* Size-aware planning against the consensus TxPoW cap (64K), ported from apks/wallet
     SweepFlow 0.2.23 ("sweep auto-fix for too-large transactions", proven live): each
     coin's size is estimated locally and pooled chunks are built to a conservative 48K
     budget on top of the input/key caps; oversized single coins are flagged and go LAST
     so a refusal cannot block the rest. The split-on-refusal retry stays as the backstop. */
  var TXN_BYTE_BUDGET = 48 * 1024;
  var SIG_BYTES       = 9 * 1024;   // signature chain + its script proof
  var INPUT_OVERHEAD  = 2 * 1024;   // MMR proof overhead per input
  var TXN_FIXED       = 4 * 1024;   // txpow header, magic, outputs, slack

  /** Estimated serialized byte size of a coin (state and token descriptor included).
      The APK measures the real Coin serialization; here hex strings dominate the coin
      JSON at 2 chars per byte, so half the JSON length is a close, slightly high proxy. */
  function sizeOf(c) {
    try { return Math.max(256, JSON.stringify(c).length >> 1); }
    catch (e) { return 1024; }   // APK fallback value
  }

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
    var out = { jobs: [], skipped: [], totals: [], signatures: 0, oversized: [] };
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
    //    Singles whose ESTIMATE exceeds the byte budget go LAST (attempted anyway — the
    //    estimate is conservative and a refusal cannot block the rest of the sweep).
    var heavy = [];
    wholes.forEach(function (w) {
      var est = TXN_FIXED + 3 * sizeOf(w.coin) + INPUT_OVERHEAD + SIG_BYTES;
      var job = {
        whole: true, tokenid: w.coin.tokenid, coins: [w.coin],
        label: w.name + " (" + w.coin.coinid + ")", states: stateEntries(w.coin)
      };
      if (est > TXN_BYTE_BUDGET) {
        heavy.push(job);
        out.oversized.push(w.name + " (" + w.coin.coinid + ") — estimated ~" + Math.round(est / 1024)
          + "K against the chain's 64K transaction cap; it will be attempted last and reported"
          + " honestly if the node refuses it");
      } else {
        out.jobs.push(job);
      }
      out.signatures++;
    });
    if (wholes.length) out.totals.push({ label: "NFT / state items", value: wholes.length + " item(s), sent whole" });

    // 2. Plain fungible tokens — pooled, chunked.
    fungibleOrder.forEach(function (tid) {
      out.totals.push({ label: "Token \"" + fungibleNames[tid] + "\"",
                        value: tokenTotals[tid] + " (" + fungible[tid].length + " coin(s))" });
      chunkInto(out, fungible[tid], tid, fungibleNames[tid]);
    });

    // 3. Native Minima next.
    if (minima.length) {
      out.totals.push({ label: "Minima", value: minimaTotal + " (" + minima.length + " coin(s))" });
      chunkInto(out, minima, "0x00", "Minima");
    }

    // 4. Over-budget singles LAST — a refusal there can no longer block anything.
    heavy.forEach(function (j) { out.jobs.push(j); });

    return out;
  }

  /** Same-address coins grouped (one signature covers them all), at most
      MAX_KEYS_PER_TXN distinct addresses and MAX_INPUTS_PER_TXN inputs per txn,
      AND an estimated TXN_BYTE_BUDGET bytes per transaction. */
  function chunkInto(zPlan, zCoins, zTokenid, zName) {
    zCoins.sort(function (a, b) { return String(a.address) < String(b.address) ? -1 : 1; });
    var chunk = [], addrs = [], chunkBytes = 0, part = 1;
    function flush(last) {
      if (!chunk.length) return;
      zPlan.jobs.push({ whole: false, tokenid: zTokenid, coins: chunk,
        label: (part === 1 && last) ? zName : zName + " (part " + part + ")" });
      part++;
      zPlan.signatures += addrs.length;
      chunk = []; addrs = []; chunkBytes = 0;
    }
    zCoins.forEach(function (c) {
      var a = String(c.address).toUpperCase();
      var newKey = addrs.indexOf(a) < 0;
      var coinCost = 2 * sizeOf(c) + INPUT_OVERHEAD;   // coin in txn + copy in its MMR proof
      var addCost  = coinCost + (newKey ? SIG_BYTES : 0);
      if (chunk.length &&
          (chunk.length >= MAX_INPUTS_PER_TXN
           || (newKey && addrs.length >= MAX_KEYS_PER_TXN)
           || TXN_FIXED + chunkBytes + addCost > TXN_BYTE_BUDGET)) {
        flush(false);
        newKey = true;
      }
      chunk.push(c);
      chunkBytes += 2 * sizeOf(c) + INPUT_OVERHEAD + (newKey ? SIG_BYTES : 0);
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

  /** Hard gate before any sweep: the destination must be a well-formed Mx address whose
      checksum matches its 0x form, and must EXIST in zBlockKeys (the derived
      block-as-keyuses set). Returns null when valid, otherwise the refusal reason. */
  function validateDestination(d, zBlockKeys, deps) {
    if (!d || typeof d.miniaddress !== "string" || !MX_RE.test(d.miniaddress))
      return "destination is not a well-formed Mx address";
    try {
      if (mxFromHex(d.address, deps) !== d.miniaddress)
        return "Mx checksum does not match the destination address " + d.miniaddress
             + " (0x form: " + d.address + ")";
    } catch (e) {
      return "Mx checksum could not be verified: " + String(e && e.message || e);
    }
    var exists = (zBlockKeys || []).some(function (b) {
      return b.index === d.index && b.address === d.address && b.miniaddress === d.miniaddress;
    });
    if (!exists) return "destination " + d.miniaddress + " is not one of this seed's derived block-as-keyuses keys";
    return null;
  }

  /** Hard gate for a PASTED destination (simple path, no derivation): well-formed Mx,
      a 32-byte 0x form, and the Mx recomputed from that 0x must match the pasted string
      byte-exact (checksum proof). d.pasted === true is set only after the node's own
      checkaddress accepted the string; the node re-verifies the checksum once more
      inside txnoutput (convertMinimaAddress). Returns null when valid. */
  function validatePastedDestination(d, deps) {
    if (!d || d.pasted !== true)
      return "destination has not been validated — paste the address and press Validate";
    if (typeof d.miniaddress !== "string" || !MX_RE.test(d.miniaddress))
      return "destination is not a well-formed Mx address";
    if (typeof d.address !== "string" || !/^0x[0-9A-F]{64}$/.test(d.address))
      return "destination did not decode to a 32-byte address (0x form: " + d.address + ")";
    try {
      if (mxFromHex(d.address, deps) !== d.miniaddress)
        return "Mx checksum does not match the destination address " + d.miniaddress
             + " (0x form: " + d.address + ")";
    } catch (e) {
      return "Mx checksum could not be verified: " + String(e && e.message || e);
    }
    return null;
  }

  root.SweepPlan = {
    MAX_INPUTS_PER_TXN: MAX_INPUTS_PER_TXN,
    MAX_KEYS_PER_TXN: MAX_KEYS_PER_TXN,
    TXN_BYTE_BUDGET: TXN_BYTE_BUDGET,
    sizeOf: sizeOf,
    decAdd: decAdd,
    normalizeScript: normalizeScript,
    coinAmount: coinAmount,
    stateEntries: stateEntries,
    plan: plan,
    jobSum: jobSum,
    split: split,
    isSizeRefusal: isSizeRefusal,
    MX_RE: MX_RE,
    mxFromHex: mxFromHex,
    validateDestination: validateDestination,
    validatePastedDestination: validatePastedDestination
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.SweepPlan;

})(typeof self !== "undefined" ? self : (typeof globalThis !== "undefined" ? globalThis : this));
