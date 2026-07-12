import assert from "node:assert/strict";
import { buildSignalInterpretation } from "../api/_signal_interpretation.js";
import { briefCardMaturity } from "../api/_weekly_brief.js";

const d1 = "2026-07-10T12:00:00.000Z";
const d1Later = "2026-07-10T18:00:00.000Z";
const d2 = "2026-07-11T12:00:00.000Z";

// Peer snapshots must never become owned local changes or owned freshness.
const peerOnly = buildSignalInterpretation({
  sources: [
    {
      id: "owned-web",
      source_type: "website",
      relationship: "owned",
      status: "blocked",
      metadata: { robots_blocked: true },
      last_seen_at: d2,
    },
    {
      id: "peer-local",
      source_type: "local_profile",
      platform: "geoapify",
      relationship: "peer",
      status: "active",
      match_confidence: 0.94,
    },
  ],
  recent_snapshots: [
    { source_id: "peer-local", signal_key: "local_formatted_address", value_text: "Old peer address", observed_at: d1 },
    { source_id: "peer-local", signal_key: "local_formatted_address", value_text: "New peer address", observed_at: d2 },
  ],
});
assert.equal(peerOnly.summary.local_profile_count, 0);
assert.equal(peerOnly.summary.changes_detected, 0);
assert.equal(peerOnly.cards.some((card) => card.evidence?.source === "signal_local_change"), false);
assert.equal(peerOnly.cards.some((card) => card.evidence?.source === "signal_access_state"), true);

// One owned local observation is a baseline, never a trend.
const baseline = buildSignalInterpretation({
  sources: [{
    id: "local-1",
    source_type: "local_profile",
    platform: "geoapify",
    relationship: "owned",
    status: "active",
    match_confidence: 0.91,
    metadata: { display_name: "Castle Rock CPA", formatted_address: "Castle Rock, CO" },
    last_seen_at: d1,
  }],
  recent_snapshots: [
    { source_id: "local-1", signal_key: "local_display_name", value_text: "Castle Rock CPA", observed_at: d1 },
    { source_id: "local-1", signal_key: "local_formatted_address", value_text: "Castle Rock, CO", observed_at: d1 },
    { source_id: "local-1", signal_key: "local_primary_category", value_text: "accounting", observed_at: d1 },
  ],
});
const baselineCard = baseline.cards.find((card) => card.evidence?.source === "signal_local_identity");
assert.ok(baselineCard);
assert.match(baselineCard.evidence.caveat, /one-day identity baseline/i);
assert.equal(briefCardMaturity(baselineCard), "baseline");
assert.equal(baseline.summary.changes_detected, 0);

// The most recently observed local source wins over a higher-confidence legacy
// source, and its own day count controls baseline/change maturity.
const currentSource = buildSignalInterpretation({
  sources: [
    {
      id: "legacy-google",
      source_type: "review_profile",
      platform: "google_business_profile",
      relationship: "owned",
      status: "active",
      match_confidence: 0.99,
      last_seen_at: d1,
      metadata: { display_name: "Legacy Listing" },
    },
    {
      id: "current-geo",
      source_type: "local_profile",
      platform: "geoapify",
      relationship: "owned",
      status: "active",
      match_confidence: 0.84,
      last_seen_at: d2,
      metadata: { display_name: "Current Geoapify Listing" },
    },
  ],
  recent_snapshots: [
    { source_id: "legacy-google", signal_key: "local_display_name", value_text: "Legacy Listing", observed_at: d1 },
    { source_id: "current-geo", signal_key: "local_display_name", value_text: "Current Geoapify Listing", observed_at: d2 },
  ],
});
const currentSourceCard = currentSource.cards.find((card) => card.evidence?.source === "signal_local_identity");
assert.ok(currentSourceCard);
assert.match(currentSourceCard.body, /Current Geoapify Listing/);
assert.equal(currentSource.summary.current_local_observation_days, 1);
assert.equal(currentSource.summary.changes_detected, 0);

// Multiple values on the same day do not qualify as a change claim.
const sameDay = buildSignalInterpretation({
  sources: [{
    id: "local-1",
    source_type: "local_profile",
    platform: "geoapify",
    relationship: "owned",
    status: "active",
    match_confidence: 0.91,
  }],
  recent_snapshots: [
    { source_id: "local-1", signal_key: "local_formatted_address", value_text: "Address A", observed_at: d1 },
    { source_id: "local-1", signal_key: "local_formatted_address", value_text: "Address B", observed_at: d1Later },
  ],
});
assert.equal(sameDay.summary.local_observation_days, 1);
assert.equal(sameDay.summary.changes_detected, 0);
assert.equal(sameDay.cards.some((card) => card.evidence?.source === "signal_local_change"), false);

// A comparable value change across two days is measured Signal evidence.
const changed = buildSignalInterpretation({
  sources: [{
    id: "local-1",
    source_type: "local_profile",
    platform: "geoapify",
    relationship: "owned",
    status: "active",
    match_confidence: 0.93,
  }],
  recent_snapshots: [
    { source_id: "local-1", signal_key: "local_formatted_address", value_text: "100 Old St", observed_at: d1 },
    { source_id: "local-1", signal_key: "local_formatted_address", value_text: "200 New St", observed_at: d2 },
    { source_id: "local-1", signal_key: "local_website_domain_match", value_numeric: 1, observed_at: d1 },
    { source_id: "local-1", signal_key: "local_website_domain_match", value_numeric: 0, observed_at: d2 },
  ],
});
const changeCard = changed.cards.find((card) => card.evidence?.source === "signal_local_change");
assert.ok(changeCard);
assert.equal(changeCard.type, "fix");
assert.equal(changeCard.evidence.sample_size, 2);
assert.match(changeCard.headline, /no longer points/i);
assert.equal(briefCardMaturity(changeCard), "measured");
assert.equal(changed.summary.changes_detected, 1);

// Search-discovered profiles are verification work, not verified performance.
const social = buildSignalInterpretation({
  sources: [
    {
      id: "social-1",
      source_type: "social_profile",
      platform: "linkedin",
      relationship: "owned",
      status: "discovered",
      match_confidence: 0.84,
      last_seen_at: d2,
    },
    {
      id: "social-2",
      source_type: "social_profile",
      platform: "facebook",
      relationship: "owned",
      status: "discovered",
      match_confidence: 0.72,
      last_seen_at: d2,
    },
  ],
  recent_snapshots: [],
});
const socialCard = social.cards.find((card) => card.evidence?.source === "signal_social_identity");
assert.ok(socialCard);
assert.equal(socialCard.type, "fix");
assert.equal(socialCard.evidence.sample_size, 2);
assert.match(socialCard.evidence.caveat, /not verified ownership/i);
assert.equal(social.summary.verified_social_count, 0);
assert.equal(social.summary.social_candidate_count, 2);
assert.equal(briefCardMaturity(socialCard), "baseline");

// A bounded provider no-match is an evidence gap, not proof of absence.
const noMatch = buildSignalInterpretation({
  sources: [],
  recent_snapshots: [],
  latest_run: {
    metadata: {
      external_providers: {
        geoapify_local: { status: "no_match", candidates: 2, best_confidence: 0.54 },
      },
    },
  },
});
const noMatchCard = noMatch.cards.find((card) => card.evidence?.source === "signal_local_identity");
assert.ok(noMatchCard);
assert.match(noMatchCard.evidence.caveat, /evidence gap/i);
assert.doesNotMatch(noMatchCard.body, /no local listing exists/i);

console.log("Signal Interpretation self-test passed: owned-only evidence, current-source selection, cross-day change requirements, baseline honesty, candidate verification, and no-match caveats.");
