/* Self-check for sweep-plan.js — run: node sweep-plan.test.js */
"use strict";
var assert = require("assert");
var P = require("./sweep-plan.js");

// decAdd: exact decimal strings, deep fractions, carries
assert.strictEqual(P.decAdd("1", "2"), "3");
assert.strictEqual(P.decAdd("0.1", "0.2"), "0.3");                       // the float classic
assert.strictEqual(P.decAdd("999.999", "0.001"), "1000");
assert.strictEqual(P.decAdd("0.00000000000000000000000000000000000000000001", "1"),
                   "1.00000000000000000000000000000000000000000001");    // 44 decimals
assert.strictEqual(P.decAdd("0", "0"), "0");

// coinAmount: token coins move token units, Minima coins move amount
assert.strictEqual(P.coinAmount({ tokenid: "0x00", amount: "5.5" }), "5.5");
assert.strictEqual(P.coinAmount({ tokenid: "0xAB", amount: "0.005", tokenamount: "50" }), "50");

// stateEntries: array and object forms
assert.deepStrictEqual(P.stateEntries({ state: [{ port: 0, type: 1, data: "0xFF" }] }),
                       [{ port: "0", data: "0xFF" }]);
assert.deepStrictEqual(P.stateEntries({ state: { "2": "hello" } }), [{ port: "2", data: "hello" }]);
assert.deepStrictEqual(P.stateEntries({}), []);

function coin(id, addr, amount, tokenid, extra) {
  var c = { coinid: id, address: addr, amount: amount, tokenid: tokenid || "0x00", spent: false };
  if (extra) Object.keys(extra).forEach(function (k) { c[k] = extra[k]; });
  return c;
}
var OWN = { "0XAAA": true, "0XBBB": true, "0XCCC": true, "0XDDD": true, "0XEEE": true, "0XFFF": true };

// plan: skip foreign addresses and spent coins
var p = P.plan([coin("0x01", "0xaaa", "1"), coin("0x02", "0xZZZ", "1"),
                coin("0x03", "0xaaa", "1", "0x00", { spent: true })], OWN);
assert.strictEqual(p.jobs.length, 1);
assert.strictEqual(p.skipped.length, 1);
assert.strictEqual(P.jobSum(p.jobs[0]), "1");

// plan: plain token pooled, state coin whole, scripted token whole
var tokPlain = { name: "PLAIN", script: "RETURN TRUE" };
var tokScripted = { name: "LOCKED", script: "RETURN SIGNEDBY(0x99)" };
p = P.plan([
  coin("0x10", "0xaaa", "0.001", "0xT1", { tokenamount: "10", token: tokPlain }),
  coin("0x11", "0xbbb", "0.002", "0xT1", { tokenamount: "20", token: tokPlain }),
  coin("0x12", "0xaaa", "0.001", "0xT2", { tokenamount: "1", token: tokScripted }),
  coin("0x13", "0xaaa", "0.001", "0xT1", { tokenamount: "5", token: tokPlain,
       state: [{ port: 0, type: 2, data: "owner" }] }),
  coin("0x14", "0xaaa", "3")
], OWN);
// jobs: 2 wholes (scripted + stated) first, then 1 pooled token chunk, then 1 Minima chunk
assert.strictEqual(p.jobs.length, 4);
assert.strictEqual(p.jobs[0].whole, true);
assert.strictEqual(p.jobs[1].whole, true);
assert.deepStrictEqual(p.jobs[1].states, [{ port: "0", data: "owner" }]);
assert.strictEqual(P.jobSum(p.jobs[2]), "30");       // token units, exact
assert.strictEqual(P.jobSum(p.jobs[3]), "3");
assert.strictEqual(p.signatures, 2 + 2 + 1);         // wholes:2, token chunk 2 addrs, minima 1 addr

// chunking: 25 same-address coins -> 10 + 10 + 5 (input cap)
var many = [];
for (var i = 0; i < 25; i++) many.push(coin("0xC" + i, "0xaaa", "1"));
p = P.plan(many, OWN);
assert.deepStrictEqual(p.jobs.map(function (j) { return j.coins.length; }), [10, 10, 5]);
assert.strictEqual(p.signatures, 3);                 // one address, one sig per chunk

// chunking: 6 coins at 6 addresses -> key cap of 4 forces a second chunk
var spread = ["0xaaa", "0xbbb", "0xccc", "0xddd", "0xeee", "0xfff"].map(function (a, i) {
  return coin("0xD" + i, a, "1");
});
p = P.plan(spread, OWN);
assert.deepStrictEqual(p.jobs.map(function (j) { return j.coins.length; }), [4, 2]);
assert.strictEqual(p.signatures, 6);

// split halves a pooled job without losing coins
var halves = P.split(p.jobs[0]);
assert.strictEqual(halves[0].coins.length + halves[1].coins.length, p.jobs[0].coins.length);

// size refusal detection
assert.ok(P.isSizeRefusal("TxPoW size too large 68000/65536"));
assert.ok(!P.isSizeRefusal("Insufficient funds"));

console.log("sweep-plan.test.js: all checks passed");
