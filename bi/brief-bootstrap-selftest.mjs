import assert from "node:assert/strict";
import { buildProspectSnapshotCard, snapshotObservationRows } from "../api/_prospect_snapshot.js";
import { canonicalDomainIdentity, domainAliases, resolveDomainRecord } from "../api/_domain_identity.js";

const base = {
  score: 63,
  field_avg: 71,
  rank: 4,
  count: 6,
  top_gap: "No DMARC record — your email domain can be impersonated",
  updated_at: "2026-07-10T18:00:00.000Z",
};

{
  const rows = snapshotObservationRows(base);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].metric, "overall_score");
  assert.equal(rows[0].value_numeric, 63);
  assert.equal(rows[0].source, "prospect_audit_snapshot");
  assert.equal(rows[0].dimensions.baseline_only, true);
}

{
  const card = buildProspectSnapshotCard(base);
  assert.ok(card);
  assert.equal(card.type, "fix");
  assert.match(card.headline, /current audit priority/i);
  assert.match(card.headline, /No DMARC record/i);
  assert.match(card.body, /No DMARC record/);
  assert.match(card.evidence.comparison, /Current score 63\/100/);
  assert.doesNotMatch(card.evidence.comparison, /peer average|rank/i);
  assert.equal(card.confidence, "medium");
  assert.match(card.evidence.caveat, /baseline snapshot, not a trend or peer-performance claim/i);
}

{
  const strong = buildProspectSnapshotCard({
    ...base,
    score: 89,
    top_gap: "Only minor gaps — you're already in strong shape online",
  });
  assert.equal(strong.type, "repeat");
  assert.equal(strong.confidence, "medium");
  assert.match(strong.headline, /strong at 89\/100/i);
}

{
  assert.deepEqual(snapshotObservationRows({ ...base, score: "not-a-score" }), []);
  assert.deepEqual(snapshotObservationRows({ ...base, updated_at: "not-a-date" }), []);
  assert.equal(buildProspectSnapshotCard(null), null);
}

// Castle Rock CPA regression: common URL and hostname spellings must resolve to
// one identity so a tracked audit cannot disappear from the Weekly Brief.
{
  assert.equal(
    canonicalDomainIdentity(" HTTPS://WWW.CastleRockCPA.com:443/services/ "),
    "castlerockcpa.com",
  );
  assert.deepEqual(
    domainAliases("CastlerockCPA.com"),
    ["castlerockcpa.com", "www.castlerockcpa.com"],
  );

  const resolved = resolveDomainRecord([
    { domain: "unrelated.example", score: 91, updated_at: "2026-07-10T12:00:00Z" },
    { domain: "https://WWW.CastleRockCPA.com/", score: 68, updated_at: "2026-07-09T12:00:00Z" },
    { domain: "www.castlerockcpa.com", score: 72, updated_at: "2026-07-10T12:00:00Z" },
  ], "castlerockcpa.com");

  assert.ok(resolved);
  assert.equal(resolved.score, 72);
  assert.equal(canonicalDomainIdentity(resolved.domain), "castlerockcpa.com");
}

console.log("brief bootstrap self-test passed");
