import assert from "node:assert/strict";
import { scoreGooglePlaceCandidate, scoreSocialSearchResult } from "../api/_external_signals.js";
import { assessCollectedTarget } from "../api/_signal_orchestrator.js";
import { buildSignalLedger } from "../api/_signal_store.js";
import { enforceOwnedLedgerTruth } from "../api/signal-ledger.js";

// Exact website-domain matching is strong enough to identify a local listing.
const exactPlace = {
  id: "place-1",
  displayName: { text: "Castle Rock CPA" },
  websiteUri: "https://www.castlerockcpa.com/",
  businessStatus: "OPERATIONAL",
};
assert.ok(scoreGooglePlaceCandidate(exactPlace, {
  domain: "castlerockcpa.com",
  name: "Castle Rock CPA",
}) >= 0.9);
assert.ok(scoreGooglePlaceCandidate({
  displayName: { text: "Unrelated Dental Office" },
  websiteUri: "https://unrelated.example/",
}, {
  domain: "castlerockcpa.com",
  name: "Castle Rock CPA",
}) < 0.3);

// Independent social discovery requires both the expected platform and a strong
// business-identity match. Generic platform pages are rejected.
const linkedinScore = scoreSocialSearchResult({
  title: "Castle Rock CPA | LinkedIn",
  url: "https://www.linkedin.com/company/castle-rock-cpa/",
  description: "Castle Rock CPA accounting and tax advisory. castlerockcpa.com",
}, {
  domain: "castlerockcpa.com",
  name: "Castle Rock CPA",
  platform: "linkedin",
});
assert.ok(linkedinScore >= 0.8);
assert.equal(scoreSocialSearchResult({
  title: "LinkedIn",
  url: "https://www.linkedin.com/login",
  description: "Sign in",
}, {
  domain: "castlerockcpa.com",
  name: "Castle Rock CPA",
  platform: "linkedin",
}), 0);

// External evidence can make a collection observable without pretending the
// website was crawled successfully.
const externalAssessment = assessCollectedTarget({
  sources: [{ source_type: "review_profile", platform: "google_business_profile", status: "active" }],
  snapshots: [{ signal_key: "local_rating" }],
  items: [],
});
assert.equal(externalAssessment.ok, false);
assert.equal(externalAssessment.external_observed, true);
assert.equal(externalAssessment.observed, true);

// A robots-blocked site plus fresh local evidence stays blocked for public web,
// while the overall owned-evidence freshness and local-presence card are honest.
const baseLedger = buildSignalLedger({
  entityKey: "castlerockcpa.com",
  sources: [
    {
      id: "web-1",
      entity_key: "castlerockcpa.com",
      source_type: "website",
      platform: "web",
      relationship: "owned",
      status: "blocked",
      match_confidence: 1,
      metadata: { robots_blocked: true },
    },
    {
      id: "local-1",
      entity_key: "castlerockcpa.com",
      source_type: "review_profile",
      platform: "google_business_profile",
      relationship: "owned",
      status: "active",
      match_confidence: 0.96,
      metadata: {},
    },
    {
      id: "social-1",
      entity_key: "castlerockcpa.com",
      source_type: "social_profile",
      platform: "linkedin",
      relationship: "owned",
      status: "discovered",
      match_confidence: 0.84,
      metadata: { match_method: "independent_search" },
    },
  ],
  snapshots: [
    { source_id: "local-1", entity_key: "castlerockcpa.com", signal_key: "local_rating", value_numeric: 4.8, observed_at: new Date().toISOString() },
    { source_id: "local-1", entity_key: "castlerockcpa.com", signal_key: "local_review_count", value_numeric: 42, observed_at: new Date().toISOString() },
  ],
  items: [],
  runs: [],
});
const truthful = enforceOwnedLedgerTruth({ ok: true, ledger: baseLedger });
assert.equal(truthful.ledger.summary.freshness, "fresh");
assert.equal(truthful.ledger.summary.website_collection_days, 0);
assert.equal(truthful.ledger.summary.local_collection_days, 1);
assert.equal(truthful.ledger.summary.verified_social_profiles, 0);
assert.equal(truthful.ledger.summary.candidate_social_profiles, 1);
assert.equal(truthful.ledger.domains.find((domain) => domain.key === "public_web").state, "blocked");
assert.equal(truthful.ledger.domains.find((domain) => domain.key === "local_presence").state, "developing");
assert.match(truthful.ledger.domains.find((domain) => domain.key === "social_identity").evidence, /1 discovery candidate/);

console.log("External Signal Acquisition self-test passed: local match confidence, independent social discovery, external-only observability, and domain-specific evidence maturity.");
