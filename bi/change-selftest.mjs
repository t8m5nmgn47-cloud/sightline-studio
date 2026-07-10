import assert from "node:assert/strict";
import { checkMetric, checkObservationRows } from "../api/_check_observations.js";
import { buildCheckChangeCards, countCheckChanges } from "../api/_change_intelligence.js";

function check(metric, value, at, label, area = "quality", points = 2) {
  return {
    metric,
    value_numeric: value,
    value_text: value ? "pass" : "fail",
    observed_at: at,
    source: "test",
    dimensions: { label, area, points, note: value ? "passing" : "needs attention" },
  };
}

// 1) Measured audit checks become stable immutable pass/fail observations.
{
  const rows = checkObservationRows({
    ok: true,
    domain: "example.com",
    score: {
      unreachable: false,
      checks: [
        { area: "quality", label: "Mobile viewport set", ok: true, points: 3, note: "viewport present" },
        { area: "security", label: "DMARC record present", ok: false, points: 5, note: "no record" },
      ],
    },
  }, { observedAt: "2026-07-01T00:00:00Z", source: "test" });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].metric, checkMetric("quality", "Mobile viewport set"));
  assert.equal(rows[0].value_numeric, 1);
  assert.equal(rows[1].value_numeric, 0);
  assert.equal(rows[1].dimensions.points, 5);
}

// 2) Pass -> Fail creates a specific Fix card.
{
  const metric = checkMetric("security", "DMARC record present");
  const rows = [
    check(metric, 1, "2026-06-01T00:00:00Z", "DMARC record present", "security", 5),
    check(metric, 0, "2026-07-01T00:00:00Z", "DMARC record present", "security", 5),
  ];
  const cards = buildCheckChangeCards(rows);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].type, "fix");
  assert.match(cards[0].headline, /DMARC record present regressed/i);
  assert.equal(cards[0].evidence.comparison, "Pass → Fail");
}

// 3) Fail -> Pass creates a Repeat card.
{
  const metric = checkMetric("quality", "Mobile viewport set");
  const rows = [
    check(metric, 0, "2026-06-01T00:00:00Z", "Mobile viewport set", "quality", 3),
    check(metric, 1, "2026-07-01T00:00:00Z", "Mobile viewport set", "quality", 3),
  ];
  const cards = buildCheckChangeCards(rows);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].type, "repeat");
  assert.match(cards[0].headline, /Mobile viewport set is now passing/i);
  assert.equal(cards[0].evidence.comparison, "Fail → Pass");
}

// 4) Unchanged checks produce no false change cards.
{
  const metric = checkMetric("quality", "Meta description present");
  const rows = [
    check(metric, 1, "2026-06-01T00:00:00Z", "Meta description present"),
    check(metric, 1, "2026-07-01T00:00:00Z", "Meta description present"),
  ];
  assert.deepEqual(buildCheckChangeCards(rows), []);
  assert.equal(countCheckChanges(rows), 0);
}

// 5) When several checks regress, the highest-point regression is prioritized.
{
  const low = checkMetric("quality", "Meta description present");
  const high = checkMetric("security", "Valid HTTPS / certificate");
  const rows = [
    check(low, 1, "2026-06-01T00:00:00Z", "Meta description present", "quality", 2),
    check(low, 0, "2026-07-01T00:00:00Z", "Meta description present", "quality", 2),
    check(high, 1, "2026-06-01T00:00:00Z", "Valid HTTPS / certificate", "security", 10),
    check(high, 0, "2026-07-01T00:00:00Z", "Valid HTTPS / certificate", "security", 10),
  ];
  const cards = buildCheckChangeCards(rows);
  assert.equal(cards[0].type, "fix");
  assert.match(cards[0].headline, /Valid HTTPS/i);
  assert.equal(countCheckChanges(rows), 2);
}

// 6) A simultaneous regression and improvement produces one focused card of each type.
{
  const reg = checkMetric("security", "DMARC record present");
  const imp = checkMetric("quality", "Mobile viewport set");
  const rows = [
    check(reg, 1, "2026-06-01T00:00:00Z", "DMARC record present", "security", 5),
    check(reg, 0, "2026-07-01T00:00:00Z", "DMARC record present", "security", 5),
    check(imp, 0, "2026-06-01T00:00:00Z", "Mobile viewport set", "quality", 3),
    check(imp, 1, "2026-07-01T00:00:00Z", "Mobile viewport set", "quality", 3),
  ];
  const cards = buildCheckChangeCards(rows);
  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map((c) => c.type), ["fix", "repeat"]);
  assert.equal(countCheckChanges(rows), 2);
}

console.log("Check-change self-test passed: observation normalization, exact transitions, no-change honesty, prioritization, and change counts.");
