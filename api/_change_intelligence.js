// Exact audit-change intelligence built from immutable check observations.
// Deterministic only: Pass -> Fail and Fail -> Pass transitions.

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function groupCheckHistory(observations = []) {
  const groups = new Map();
  for (const row of observations) {
    if (!String(row.metric || "").startsWith("check::")) continue;
    if (!groups.has(row.metric)) groups.set(row.metric, []);
    groups.get(row.metric).push(row);
  }
  for (const rows of groups.values()) {
    rows.sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
  }
  return groups;
}

function transition(rowHistory) {
  if (!rowHistory || rowHistory.length < 2) return null;
  const previous = rowHistory[rowHistory.length - 2];
  const latest = rowHistory[rowHistory.length - 1];
  const before = num(previous.value_numeric);
  const after = num(latest.value_numeric);
  if (before === after) return null;
  const dimensions = latest.dimensions && typeof latest.dimensions === "object"
    ? latest.dimensions
    : (previous.dimensions || {});
  return {
    previous,
    latest,
    before,
    after,
    count: rowHistory.length,
    label: dimensions.label || latest.metric,
    area: dimensions.area || "other",
    points: num(dimensions.points),
    note: dimensions.note || "",
  };
}

function evidence(change) {
  return {
    sample_size: change.count,
    period_start: change.previous.observed_at,
    period_end: change.latest.observed_at,
    comparison: change.after ? "Fail → Pass" : "Pass → Fail",
    absolute_lift: change.after ? 1 : -1,
    relative_lift: null,
    source: change.latest.source || "exposure_audit",
    caveat: null,
  };
}

function regressionCard(change) {
  return {
    type: "fix",
    headline: `${change.label} regressed in the latest audit`,
    body: `This measured check previously passed and now fails${change.note ? `: ${change.note}` : "."}`,
    recommendation: `Fix this ${change.area} regression before starting a lower-impact improvement, then re-scan to confirm the check returns to passing.`,
    confidence: change.count >= 3 ? "high" : "medium",
    evidence: evidence(change),
  };
}

function improvementCard(change) {
  return {
    type: "repeat",
    headline: `${change.label} is now passing`,
    body: `This measured check changed from failing to passing${change.note ? `: ${change.note}` : "."}`,
    recommendation: `Protect the change that fixed this ${change.area} issue and avoid changing multiple related settings until the next measurement confirms it stays resolved.`,
    confidence: change.count >= 3 ? "high" : "medium",
    evidence: evidence(change),
  };
}

export function buildCheckChangeCards(observations = []) {
  const transitions = [...groupCheckHistory(observations).values()]
    .map(transition)
    .filter(Boolean);

  const regressions = transitions
    .filter((x) => x.before === 1 && x.after === 0)
    .sort((a, b) => b.points - a.points || a.label.localeCompare(b.label));
  const improvements = transitions
    .filter((x) => x.before === 0 && x.after === 1)
    .sort((a, b) => b.points - a.points || a.label.localeCompare(b.label));

  const cards = [];
  if (regressions[0]) cards.push(regressionCard(regressions[0]));
  if (improvements[0]) cards.push(improvementCard(improvements[0]));
  return cards;
}

export function countCheckChanges(observations = []) {
  return [...groupCheckHistory(observations).values()]
    .map(transition)
    .filter(Boolean).length;
}
