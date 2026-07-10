// Convert measured audit checks into immutable BI observations.
// Each stable metric records pass/fail over time so Sightline can explain
// exactly what changed instead of reporting only aggregate score movement.

function iso(v) {
  const d = v ? new Date(v) : new Date();
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function slug(v) {
  return String(v || "check")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "check";
}

export function checkMetric(area, label) {
  return `check::${slug(area || "other")}::${slug(label)}`;
}

export function checkObservationRows(result, opts = {}) {
  const score = result?.score || {};
  const entityKey = opts.entityKey || result?.domain || "";
  const entityName = opts.entityName || entityKey;
  const observedAt = iso(opts.observedAt);
  const source = opts.source || "exposure_audit";

  if (!entityKey || !result?.ok || score.unreachable) return [];

  return (score.checks || []).map((check) => ({
    entity_key: entityKey,
    entity_name: entityName,
    metric: checkMetric(check.area, check.label),
    value_numeric: check.ok ? 1 : 0,
    value_text: check.ok ? "pass" : "fail",
    observed_at: observedAt,
    source,
    dimensions: {
      unit: "boolean",
      label: String(check.label || "Unnamed check"),
      area: String(check.area || "other"),
      points: Number.isFinite(Number(check.points)) ? Number(check.points) : 0,
      note: String(check.note || "").slice(0, 1000),
    },
  }));
}
