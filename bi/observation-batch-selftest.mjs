import assert from "node:assert/strict";
import { normalizeObservationInsertRows, observationInsertShapeIsUniform } from "../api/_observation_rows.js";

const at = "2026-07-10T18:00:00Z";
const mixed = [
  {
    entity_key: "example.com",
    entity_name: "Example",
    metric: "overall_score",
    value_numeric: 72,
    observed_at: at,
    source: "scheduled_audit_refresh",
    dimensions: { unit: "score", max: 100 },
  },
  {
    entity_key: "example.com",
    entity_name: "Example",
    metric: "check::security::dmarc",
    value_numeric: 0,
    value_text: "fail",
    observed_at: at,
    source: "scheduled_audit_refresh",
    dimensions: { unit: "boolean", label: "DMARC", area: "security" },
  },
];

// The historical production failure: score rows omitted value_text while check
// rows included it. Normalization must produce identical object keys.
{
  const rows = normalizeObservationInsertRows(mixed);
  assert.equal(rows.length, 2);
  assert.deepEqual(Object.keys(rows[0]), Object.keys(rows[1]));
  assert.equal(rows[0].value_text, null);
  assert.equal(rows[1].value_text, "fail");
  assert.equal(observationInsertShapeIsUniform(mixed), true);
}

// Null values stay null; JavaScript Number(null) must not silently create a zero.
{
  const rows = normalizeObservationInsertRows([{ ...mixed[0], metric: "text_only", value_numeric: null, value_text: "observed" }]);
  assert.equal(rows[0].value_numeric, null);
  assert.equal(rows[0].value_text, "observed");
}

// Invalid rows are filtered instead of poisoning the entire insert batch.
{
  const rows = normalizeObservationInsertRows([
    mixed[0],
    { entity_key: "example.com", observed_at: at },
    null,
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].metric, "overall_score");
}

console.log("BI observation batch self-test passed: mixed score/check rows normalize to a uniform PostgREST insert shape.");
