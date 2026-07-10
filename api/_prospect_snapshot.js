// Converts the latest tracked prospect audit into clearly labeled baseline evidence
// when immutable BI history has not started yet. A snapshot is a baseline, not a
// trend: it must never be used to claim improvement or regression by itself.

const num = (value, fallback = null) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

function validIso(value) {
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function snapshotObservationRows(prospect) {
  const score = num(prospect?.score);
  const observedAt = validIso(prospect?.updated_at);
  if (score == null || !observedAt) return [];
  return [{
    metric: "overall_score",
    value_numeric: score,
    value_text: null,
    observed_at: observedAt,
    source: "prospect_audit_snapshot",
    dimensions: { unit: "score", max: 100, baseline_only: true },
  }];
}

function comparison(prospect, score) {
  const parts = [`Current score ${Math.round(score)}/100`];
  const avg = num(prospect?.field_avg);
  const rank = num(prospect?.rank);
  const count = num(prospect?.count);
  if (avg != null && avg > 0) parts.push(`stored peer average ${Math.round(avg)}/100`);
  if (rank != null && count != null && rank > 0 && count > 0) parts.push(`rank ${Math.round(rank)}/${Math.round(count)}`);
  return parts.join(" · ");
}

export function buildProspectSnapshotCard(prospect) {
  const score = num(prospect?.score);
  const observedAt = validIso(prospect?.updated_at);
  if (score == null || !observedAt) return null;

  const gap = String(prospect?.top_gap || "").trim();
  const minor = /^only minor gaps/i.test(gap);
  const type = minor && score >= 78 ? "repeat" : gap ? "fix" : "watch";

  if (type === "repeat") {
    return {
      type,
      headline: `Current audit baseline is strong at ${Math.round(score)}/100`,
      body: gap || "The latest tracked audit establishes a strong current baseline.",
      recommendation: "Protect the current strengths and run the next comparable audit after one meaningful change so Sightline can measure direction, not just a point-in-time score.",
      confidence: "high",
      evidence: {
        sample_size: 1,
        period_start: observedAt,
        period_end: observedAt,
        comparison: comparison(prospect, score),
        absolute_lift: null,
        relative_lift: null,
        source: "prospect_audit_snapshot",
        caveat: "This is a current baseline snapshot, not a trend claim.",
      },
    };
  }

  if (type === "fix") {
    return {
      type,
      headline: "Fix the clearest current audit gap first",
      body: `The latest tracked audit scored ${Math.round(score)}/100. Clearest measured gap: ${gap}`,
      recommendation: "Address this one gap first, then run a comparable audit before stacking several unrelated changes. That creates the before/after evidence needed for stronger advice.",
      confidence: "high",
      evidence: {
        sample_size: 1,
        period_start: observedAt,
        period_end: observedAt,
        comparison: comparison(prospect, score),
        absolute_lift: null,
        relative_lift: null,
        source: "prospect_audit_snapshot",
        caveat: "This is a current baseline snapshot, not a trend claim.",
      },
    };
  }

  return {
    type: "watch",
    headline: `Current audit baseline is ${Math.round(score)}/100`,
    body: "Sightline has a current measured baseline but not enough repeated history yet to claim improvement or regression.",
    recommendation: "Keep the next audit comparable and change one important variable at a time so the next brief can measure direction.",
    confidence: "high",
    evidence: {
      sample_size: 1,
      period_start: observedAt,
      period_end: observedAt,
      comparison: comparison(prospect, score),
      absolute_lift: null,
      relative_lift: null,
      source: "prospect_audit_snapshot",
      caveat: "This is a current baseline snapshot, not a trend claim.",
    },
  };
}
