import assert from "node:assert/strict";
import { buildProspectSnapshotCard, snapshotObservationRows } from "../api/_prospect_snapshot.js";

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
  assert.match(card.headline, /clearest current audit gap/i);
  assert.match(card.body, /No DMARC record/);
  assert.match(card.evidence.comparison, /Current score 63\/100/);
  assert.match(card.evidence.comparison, /stored peer average 71\/100/);
  assert.match(card.evidence.comparison, /rank 4\/6/);
  assert.match(card.evidence.caveat, /baseline snapshot, not a trend claim/i);
}

{
  const strong = buildProspectSnapshotCard({
    ...base,
    score: 89,
    top_gap: "Only minor gaps — you're already in strong shape online",
  });
  assert.equal(strong.type, "repeat");
  assert.match(strong.headline, /strong at 89\/100/i);
}

{
  assert.deepEqual(snapshotObservationRows({ ...base, score: "not-a-score" }), []);
  assert.deepEqual(snapshotObservationRows({ ...base, updated_at: "not-a-date" }), []);
  assert.equal(buildProspectSnapshotCard(null), null);
}

console.log("brief bootstrap self-test passed");
