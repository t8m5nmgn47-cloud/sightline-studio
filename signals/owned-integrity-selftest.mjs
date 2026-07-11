import assert from "node:assert/strict";
import { enforceOwnedLedgerTruth } from "../api/signal-ledger.js";
import { assessCollectedTarget, preserveBlockedWebsiteEvidence } from "../api/_signal_orchestrator.js";

const peerOnly = enforceOwnedLedgerTruth({
  ok: true,
  ledger: {
    summary: {
      source_count: 1,
      owned_source_count: 0,
      peer_source_count: 1,
      latest_snapshot_at: "2026-07-11T18:50:55Z",
      latest_snapshot_age_days: 0,
      freshness: "fresh",
    },
    sources: [
      { id: "peer-1", relationship: "peer", source_type: "website", status: "active" },
    ],
    recent_snapshots: [
      { source_id: "peer-1", observed_at: "2026-07-11T18:50:55Z", signal_key: "pages_collected" },
    ],
    domains: [],
  },
});

assert.equal(peerOnly.ledger.summary.freshness, "missing");
assert.equal(peerOnly.ledger.summary.latest_snapshot_at, null);
assert.equal(peerOnly.ledger.summary.latest_snapshot_age_days, null);
assert.equal(peerOnly.ledger.summary.owned_access_status, "missing");
assert.match(peerOnly.warning, /owned business/i);

const blockedBundle = preserveBlockedWebsiteEvidence({
  entity_key: "castlerockcpa.com",
  entity_name: "Castle Rock CPA",
  relationship: "owned",
  collected_at: "2026-07-11T22:22:35Z",
  sources: [],
  snapshots: [],
  items: [],
  errors: ["robots.txt disallows collection of the site root."],
  summary: { pages: 0, social_profiles: 0, robots_blocked: true },
}, {
  domain: "castlerockcpa.com",
  name: "Castle Rock CPA",
  relationship: "owned",
});

assert.equal(blockedBundle.sources.length, 1);
assert.equal(blockedBundle.sources[0].status, "blocked");
assert.equal(blockedBundle.sources[0].metadata.robots_blocked, true);
assert.equal(blockedBundle.sources[0].relationship, "owned");

const blockedAssessment = assessCollectedTarget(blockedBundle);
assert.equal(blockedAssessment.ok, false);
assert.equal(blockedAssessment.blocked, true);
assert.equal(blockedAssessment.observed, true);
assert.equal(blockedAssessment.website_sources, 1);
assert.equal(blockedAssessment.web_pages, 0);

const blockedLedger = enforceOwnedLedgerTruth({
  ok: true,
  ledger: {
    summary: {
      source_count: 2,
      owned_source_count: 1,
      peer_source_count: 1,
      collection_days: 0,
      latest_snapshot_at: "2026-07-11T18:50:55Z",
      latest_snapshot_age_days: 0,
      freshness: "fresh",
    },
    sources: [
      {
        id: "owned-blocked",
        relationship: "owned",
        source_type: "website",
        status: "blocked",
        metadata: { robots_blocked: true },
      },
      { id: "peer-1", relationship: "peer", source_type: "website", status: "active" },
    ],
    recent_snapshots: [
      { source_id: "peer-1", observed_at: "2026-07-11T18:50:55Z", signal_key: "pages_collected" },
    ],
    domains: [
      {
        key: "public_web",
        label: "Public web history",
        state: "not_ready",
        evidence: "0 owned collection days",
        next: "Collect comparable website snapshots on additional days.",
      },
    ],
  },
});

assert.equal(blockedLedger.ledger.summary.freshness, "missing");
assert.equal(blockedLedger.ledger.summary.latest_snapshot_at, null);
assert.equal(blockedLedger.ledger.summary.owned_access_status, "blocked");
assert.match(blockedLedger.warning, /blocks automated collection/i);
assert.match(blockedLedger.ledger.domains[0].evidence, /blocked by robots\.txt/i);
assert.equal(blockedLedger.ledger.summary.collection_days, 0);

const owned = enforceOwnedLedgerTruth({
  ok: true,
  ledger: {
    summary: {
      owned_source_count: 1,
      latest_snapshot_at: "2026-07-11T18:50:55Z",
      latest_snapshot_age_days: 0,
      freshness: "fresh",
    },
    sources: [
      { id: "owned-1", relationship: "owned", source_type: "website", status: "active", metadata: {} },
    ],
    recent_snapshots: [
      { source_id: "owned-1", observed_at: new Date().toISOString(), signal_key: "pages_collected" },
    ],
    domains: [],
  },
});
assert.equal(owned.ledger.summary.freshness, "fresh");
assert.equal(owned.ledger.summary.owned_access_status, "available");
assert.equal(owned.warning, null);

console.log("Owned signal integrity self-test passed: peer-only and robots-blocked evidence cannot create false freshness.");
