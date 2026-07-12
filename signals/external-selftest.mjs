import assert from "node:assert/strict";
import { scoreGeoapifyCandidate, scoreSocialSearchResult } from "../api/_external_signals.js";
import { assessCollectedTarget } from "../api/_signal_orchestrator.js";
import { buildSignalLedger } from "../api/_signal_store.js";
import { enforceOwnedLedgerTruth } from "../api/signal-ledger.js";

// Exact website-domain matching plus name confidence is strong enough to
// identify a Geoapify local place without claiming review data.
const exactCandidate = {
  place_id: "geo-place-1",
  name: "Castle Rock CPA",
  formatted: "123 Wilcox Street, Castle Rock, CO",
  result_type: "amenity",
  category: "service.financial.accounting",
  rank: { confidence: 0.98 },
};
const exactDetails = {
  name: "Castle Rock CPA",
  website: "https://www.castlerockcpa.com/",
  categories: ["service.financial.accounting"],
};
assert.ok(scoreGeoapifyCandidate(exactCandidate, exactDetails, {
  domain: "castlerockcpa.com",
  name: "Castle Rock CPA",
}) >= 0.9);
assert.ok(scoreGeoapifyCandidate({
  place_id: "geo-place-2",
  name: "Unrelated Dental Office",
  result_type: "amenity",
  rank: { confidence: 0.8 },
}, {
  website: "https://unrelated.example/",
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
// website was crawled successfully. The Geoapify lookup is a provenance source,
// while the matched place remains a separate local profile.
const externalAssessment = assessCollectedTarget({
  sources: [
    { source_type: "local_profile", platform: "geoapify", status: "active" },
    { source_type: "search_query", platform: "geoapify_geocoding", status: "active" },
  ],
  snapshots: [{ signal_key: "local_match_confidence" }],
  items: [],
});
assert.equal(externalAssessment.ok, false);
assert.equal(externalAssessment.external_observed, true);
assert.equal(externalAssessment.observed, true);

// A robots-blocked site plus fresh Geoapify evidence stays blocked for public
// web, while overall owned-evidence freshness and local presence remain honest.
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
      source_type: "local_profile",
      platform: "geoapify",
      relationship: "owned",
      status: "active",
      match_confidence: 0.96,
      metadata: { provider: "geoapify_geocoding_place_details" },
    },
    {
      id: "lookup-1",
      entity_key: "castlerockcpa.com",
      source_type: "search_query",
      platform: "geoapify_geocoding",
      relationship: "owned",
      status: "active",
      match_confidence: 0.96,
      metadata: { provider: "geoapify_geocoding_place_details" },
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
    { source_id: "local-1", entity_key: "castlerockcpa.com", signal_key: "local_place_present", value_numeric: 1, observed_at: new Date().toISOString() },
    { source_id: "local-1", entity_key: "castlerockcpa.com", signal_key: "local_display_name", value_text: "Castle Rock CPA", observed_at: new Date().toISOString() },
    { source_id: "local-1", entity_key: "castlerockcpa.com", signal_key: "local_primary_category", value_text: "service.financial.accounting", observed_at: new Date().toISOString() },
    { source_id: "lookup-1", entity_key: "castlerockcpa.com", signal_key: "local_match_confidence", value_numeric: 0.96, observed_at: new Date().toISOString() },
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
assert.match(truthful.ledger.domains.find((domain) => domain.key === "local_presence").evidence, /Geoapify local profile/);
assert.doesNotMatch(truthful.ledger.domains.find((domain) => domain.key === "local_presence").evidence, /reviews/i);
assert.match(truthful.ledger.domains.find((domain) => domain.key === "social_identity").evidence, /1 discovery candidate/);

console.log("External Signal Acquisition self-test passed: Geoapify match confidence, independent social discovery, external-only observability, and provider-honest evidence maturity.");
