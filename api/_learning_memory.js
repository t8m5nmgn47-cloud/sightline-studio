// Recommendation Learning Memory — summarizes what happened after Sightline
// recommendations were accepted, implemented, and measured.

const DECISIVE = new Set(["successful", "unsuccessful", "reversed"]);

function pct(n, d) {
  return d > 0 ? Math.round((n / d) * 100) : null;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function learningCategory(insight = {}) {
  const source = String(insight?.evidence?.source || "").toLowerCase();
  if (source === "campaign_events") return "campaign_performance";
  if (source === "review_events") return "reputation";
  if (source === "peer_movement") return "competitive_movement";
  if (/audit|scan/.test(source)) return "online_health";
  if (source === "evidence_readiness") return "evidence_building";
  return "other";
}

function summarize(records) {
  const measured = records.length;
  const successful = records.filter((r) => r.result === "successful").length;
  const unsuccessful = records.filter((r) => r.result === "unsuccessful").length;
  const reversed = records.filter((r) => r.result === "reversed").length;
  const inconclusive = records.filter((r) => r.result === "inconclusive").length;
  const decisive = records.filter((r) => DECISIVE.has(r.result)).length;
  const lifts = records.map((r) => num(r.measured_lift)).filter((v) => v != null);
  return {
    measured,
    decisive,
    successful,
    unsuccessful,
    reversed,
    inconclusive,
    success_rate: pct(successful, decisive),
    inconclusive_rate: pct(inconclusive, measured),
    lift_count: lifts.length,
    average_measured_lift: lifts.length ? Math.round((lifts.reduce((a, b) => a + b, 0) / lifts.length) * 10) / 10 : null,
  };
}

function memoryCard(summary) {
  if (summary.decisive >= 2) {
    if (summary.success_rate >= 67) {
      return {
        type: "repeat",
        headline: "Measured Sightline recommendations are earning trust",
        body: `${summary.successful} of ${summary.decisive} decisive recommendation outcomes were successful (${summary.success_rate}%). Inconclusive tests are tracked separately and do not inflate this rate.`,
        recommendation: "Keep closing recommendation loops and repeat the testing discipline that produced decisive results before expanding into more complex attribution.",
        confidence: summary.decisive >= 5 ? "high" : "medium",
        evidence: {
          sample_size: summary.measured,
          comparison: `${summary.successful} successful of ${summary.decisive} decisive; ${summary.inconclusive} inconclusive`,
          source: "recommendation_outcomes",
          caveat: "Success rate describes measured recommendation outcomes for this business, not guaranteed future lift.",
        },
      };
    }
    if (summary.success_rate <= 40) {
      return {
        type: "watch",
        headline: "Recent recommendation outcomes need tighter tests",
        body: `${summary.successful} of ${summary.decisive} decisive recommendation outcomes were successful (${summary.success_rate}%). The learning loop is working, but the evidence says the current recommendation or implementation process needs refinement.`,
        recommendation: "Review failed and reversed recommendations for common causes, reduce the number of variables changed at once, and define the outcome metric before the next test starts.",
        confidence: summary.decisive >= 5 ? "high" : "medium",
        evidence: {
          sample_size: summary.measured,
          comparison: `${summary.successful} successful of ${summary.decisive} decisive; ${summary.inconclusive} inconclusive`,
          source: "recommendation_outcomes",
          caveat: "A low rate may reflect weak recommendations, implementation differences, or uncontrolled tests; review each outcome before generalizing.",
        },
      };
    }
    return {
      type: "watch",
      headline: "Recommendation outcomes are mixed",
      body: `${summary.successful} of ${summary.decisive} decisive recommendation outcomes were successful (${summary.success_rate}%). There is enough learning history to review patterns, but not a consistently strong result yet.`,
      recommendation: "Compare successful and unsuccessful recommendation categories, then concentrate the next tests where Sightline has the strongest measured history.",
      confidence: summary.decisive >= 5 ? "high" : "medium",
      evidence: {
        sample_size: summary.measured,
        comparison: `${summary.successful} successful of ${summary.decisive} decisive; ${summary.inconclusive} inconclusive`,
        source: "recommendation_outcomes",
        caveat: "Category-level results are more useful than a blended rate when recommendation types differ substantially.",
      },
    };
  }

  if (summary.inconclusive >= 2) {
    return {
      type: "test",
      headline: "Too many recommendation tests are ending inconclusive",
      body: `${summary.inconclusive} measured recommendations ended inconclusive and there are not yet two decisive outcomes to judge the learning loop.`,
      recommendation: "Tighten the next measurement window, choose one primary outcome, and reduce simultaneous changes so the result can become decisive.",
      confidence: "medium",
      evidence: {
        sample_size: summary.measured,
        comparison: `${summary.inconclusive} inconclusive outcomes`,
        source: "recommendation_outcomes",
        caveat: "Inconclusive is an honest outcome, but repeated inconclusive tests usually signal measurement or experiment-design problems.",
      },
    };
  }

  return null;
}

export function buildLearningMemory({ insights = [], outcomes = [] } = {}) {
  const insightById = new Map((insights || []).map((insight) => [insight.id, insight]));
  const timeline = (outcomes || [])
    .filter((outcome) => outcome?.result && insightById.has(outcome.insight_id))
    .map((outcome) => {
      const insight = insightById.get(outcome.insight_id);
      return {
        insight_id: insight.id,
        headline: insight.headline,
        insight_type: insight.insight_type,
        category: learningCategory(insight),
        confidence: insight.confidence || "low",
        generated_at: insight.generated_at || null,
        accepted_at: outcome.accepted_at || null,
        implemented_at: outcome.implemented_at || null,
        measurement_start: outcome.measurement_start || null,
        measurement_end: outcome.measurement_end || null,
        result: outcome.result,
        measured_lift: num(outcome.measured_lift),
        notes: outcome.notes || null,
      };
    })
    .sort((a, b) => Date.parse(b.measurement_end || b.generated_at || 0) - Date.parse(a.measurement_end || a.generated_at || 0));

  const summary = summarize(timeline);
  const categories = {};
  for (const record of timeline) {
    if (!categories[record.category]) categories[record.category] = [];
    categories[record.category].push(record);
  }
  const byCategory = Object.entries(categories)
    .map(([category, records]) => ({ category, ...summarize(records) }))
    .sort((a, b) => b.measured - a.measured || a.category.localeCompare(b.category));

  return {
    summary,
    by_category: byCategory,
    timeline,
    card: memoryCard(summary),
  };
}
