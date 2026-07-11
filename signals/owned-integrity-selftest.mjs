import assert from "node:assert/strict";
import { enforceOwnedLedgerTruth } from "../api/signal-ledger.js";

const peerOnly = enforceOwnedLedgerTruth({
  ok: true,
  ledger: {
    summary: {
      source_count: 10,
      owned_source_count: 0,
      peer_source_count: 10,
      latest_snapshot_at: "2026-07-11T18:50:55Z",
      latest_snapshot_age_days: 0,
      freshness: "fresh",
    },
  },
});

assert.equal(peerOnly.ledger.summary.freshness, "missing");
assert.equal(peerOnly.ledger.summary.latest_snapshot_at, null);
assert.equal(peerOnly.ledger.summary.latest_snapshot_age_days, null);
assert.match(peerOnly.warning, /owned business/i);

const owned = {
  ok: true,
  ledger: {
    summary: {
      owned_source_count: 1,
      latest_snapshot_at: "2026-07-11T18:50:55Z",
      latest_snapshot_age_days: 0,
      freshness: "fresh",
    },
  },
};
assert.deepEqual(enforceOwnedLedgerTruth(owned), owned);

console.log("Owned signal integrity self-test passed: peer-only evidence cannot make an uncollected business appear fresh.");
