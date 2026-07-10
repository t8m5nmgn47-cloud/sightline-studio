// Pure aggregation model for the private admin command center.
// Keeps operating metrics separate from rendering and transport concerns.

import { buildCampaignEconomics } from "./_campaign_economics.js";

const DAY_MS = 86_400_000;
const OPEN_STAGES = new Set(["new", "contacted", "qualified", "demo_sent", "proposal", "negotiating"]);

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

function planPrice(plan = "") {
  const match = String(plan).match(/\$\s?(\d+(?:\.\d+)?)/);
  return match ? num(match[1]) : 0;
}

function stageCounts(rows = []) {
  const counts = {};
  for (const row of rows) {
    const status = String(row?.status || "unknown").toLowerCase();
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

function rowDate(row, keys = ["created_at", "occurred_at", "generated_at", "updated_at"]) {
  for (const key of keys) {
    const value = row?.[key];
    if (value && Number.isFinite(Date.parse(value))) return value;
  }
  return null;
}

function ageDays(value, generatedAt) {
  if (!value) return null;
  const diff = Date.parse(generatedAt) - Date.parse(value);
  return Number.isFinite(diff) ? Math.max(0, Math.floor(diff / DAY_MS)) : null;
}

function periodCount(rows = [], generatedAt, days = 30, dateKeys) {
  const now = Date.parse(generatedAt);
  const currentStart = now - days * DAY_MS;
  const previousStart = now - days * 2 * DAY_MS;
  let current = 0;
  let previous = 0;
  for (const row of rows) {
    const at = Date.parse(rowDate(row, dateKeys) || "");
    if (!Number.isFinite(at)) continue;
    if (at > currentStart && at <= now) current += 1;
    else if (at > previousStart && at <= currentStart) previous += 1;
  }
  const delta = previous > 0 ? Math.round(((current - previous) / previous) * 100) : current > 0 ? 100 : 0;
  return { current, previous, delta_percent: delta };
}

function pendingCampaignResults(events = []) {
  const sent = new Map();
  const completed = new Set();
  for (const event of events) {
    if (!event?.campaign_id) continue;
    if (event.event_type === "campaign_sent") sent.set(event.campaign_id, event);
    if (event.event_type === "campaign_result") completed.add(event.campaign_id);
  }
  return [...sent.values()]
    .filter((event) => !completed.has(event.campaign_id))
    .sort((a, b) => Date.parse(a.occurred_at || 0) - Date.parse(b.occurred_at || 0));
}

function subscriberPlanMix(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const label = String(row.plan || row.tier || row.product || "Unspecified").trim() || "Unspecified";
    const current = map.get(label) || { label, clients: 0, mrr: 0 };
    current.clients += 1;
    current.mrr += num(row.mo);
    map.set(label, current);
  }
  return [...map.values()].sort((a, b) => b.mrr - a.mrr || b.clients - a.clients);
}

function outcomeSummary(outcomes = []) {
  const counts = { successful: 0, inconclusive: 0, unsuccessful: 0, reversed: 0 };
  const lifts = [];
  for (const row of outcomes) {
    const result = String(row?.result || "").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(counts, result)) counts[result] += 1;
    if (Number.isFinite(Number(row?.measured_lift))) lifts.push(Number(row.measured_lift));
  }
  const decisive = counts.successful + counts.unsuccessful + counts.reversed;
  return {
    ...counts,
    total: outcomes.length,
    decisive,
    success_rate: decisive ? Math.round((counts.successful / decisive) * 100) : null,
    average_measured_lift: lifts.length ? Math.round((lifts.reduce((a, b) => a + b, 0) / lifts.length) * 10) / 10 : null,
  };
}

function latestAt(rows = [], keys) {
  return rows
    .map((row) => rowDate(row, keys))
    .filter(Boolean)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
}

function activityStream({ signups = [], leads = [], prospects = [], events = [], insights = [] } = {}) {
  const items = [];
  const push = (item) => {
    if (item.at && Number.isFinite(Date.parse(item.at))) items.push(item);
  };

  for (const row of signups.slice(0, 40)) push({
    type: "pipeline", at: row.created_at, title: row.name || row.business_name || row.domain || "New opportunity",
    detail: `Pipeline · ${String(row.status || "new").replaceAll("_", " ")}${row.plan ? ` · ${row.plan}` : ""}`,
    href: "/pipeline/",
  });
  for (const row of leads.slice(0, 40)) push({
    type: "lead", at: row.created_at || row.updated_at, title: row.business_name || row.name || row.domain || row.email || "Lead signal",
    detail: "Lead activity recorded",
    href: "/leads/",
  });
  for (const row of events.slice(0, 80)) {
    if (!['campaign_sent', 'campaign_result'].includes(row.event_type)) continue;
    push({
      type: row.event_type === "campaign_result" ? "result" : "campaign",
      at: row.occurred_at,
      title: row.campaign_id || row.entity_key || "Campaign activity",
      detail: row.event_type === "campaign_result" ? `Campaign result finalized${row.value_numeric != null ? ` · $${Math.round(num(row.value_numeric)).toLocaleString()} revenue` : ""}` : `Campaign sent${row.channel ? ` · ${row.channel}` : ""}`,
      href: row.event_type === "campaign_result" ? "/intelligence/economics/" : "/intelligence/campaigns/",
    });
  }
  for (const row of insights.slice(0, 60)) push({
    type: "insight", at: row.generated_at,
    title: row.headline || "Recommendation generated",
    detail: `Intelligence · ${String(row.status || "active").replaceAll("_", " ")}`,
    href: row.entity_key ? `/intelligence/?domain=${encodeURIComponent(row.entity_key)}` : "/intelligence/",
  });
  for (const row of prospects.slice(0, 40)) push({
    type: "audit", at: row.updated_at,
    title: row.name || row.domain || "Business audit refreshed",
    detail: `Audit refreshed${row.score != null ? ` · score ${Math.round(num(row.score))}` : ""}`,
    href: row.domain ? `/intelligence/?domain=${encodeURIComponent(row.domain)}` : "/intelligence/portfolio/",
  });

  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 16);
}

function healthRow(key, label, at, generatedAt, href) {
  const age = ageDays(at, generatedAt);
  return {
    key, label, at, age_days: age,
    state: age == null ? "missing" : age <= 2 ? "fresh" : age <= 14 ? "aging" : "stale",
    href,
  };
}

export function buildAdminDashboard({
  subscribers = [], signups = [], leads = [], portfolio = {}, events = [], insights = [], outcomes = [],
  prospects = [], observations = [], generatedAt = new Date().toISOString(),
} = {}) {
  const activeSubscribers = subscribers.filter((row) => String(row.status || "").toLowerCase() === "active");
  const pausedSubscribers = subscribers.filter((row) => String(row.status || "").toLowerCase() === "paused");
  const canceledSubscribers = subscribers.filter((row) => String(row.status || "").toLowerCase() === "canceled");
  const mrr = activeSubscribers.reduce((sum, row) => sum + num(row.mo), 0);
  const pausedMrr = pausedSubscribers.reduce((sum, row) => sum + num(row.mo), 0);
  const arr = mrr * 12;
  const arpa = activeSubscribers.length ? mrr / activeSubscribers.length : 0;

  const openOpportunities = signups.filter((row) => OPEN_STAGES.has(String(row.status || "").toLowerCase()));
  const pipelineMrr = openOpportunities.reduce((sum, row) => sum + planPrice(row.plan), 0);
  const pendingResults = pendingCampaignResults(events);
  const acceptedRecommendations = insights.filter((row) => row.status === "accepted").length;
  const measuredRecommendations = insights.filter((row) => row.status === "measured").length;
  const summary = portfolio.summary || {};
  const economics = buildCampaignEconomics(events);
  const outcomeStats = outcomeSummary(outcomes);
  const signupTrend = periodCount(signups, generatedAt, 30, ["created_at"]);
  const leadTrend = periodCount(leads, generatedAt, 30, ["created_at", "updated_at"]);
  const campaignTrend = periodCount(events.filter((e) => e.event_type === "campaign_sent"), generatedAt, 30, ["occurred_at"]);
  const portfolioRows = portfolio.rows || [];
  const averageReadiness = portfolioRows.length ? Math.round(portfolioRows.reduce((sum, row) => sum + num(row.readiness_score), 0) / portfolioRows.length) : 0;
  const averageScore = portfolioRows.length ? Math.round(portfolioRows.reduce((sum, row) => sum + num(row.current_score), 0) / portfolioRows.length) : 0;
  const staleBusinesses = portfolioRows.filter((row) => row.stale_days == null || row.stale_days > 30).length;

  const priorities = [];
  const attentionRows = portfolioRows.filter((row) => row.bucket === "attention").slice(0, 3);
  for (const row of attentionRows) {
    priorities.push({
      type: "attention",
      label: `${row.name} needs attention`,
      detail: row.reason || row.next_action,
      value: row.current_score != null ? `Score ${Math.round(num(row.current_score))}` : "Review",
      href: `/intelligence/?domain=${encodeURIComponent(row.domain || "")}`,
      action: "Review",
    });
  }
  if (pendingResults.length > 0) priorities.push({
    type: "results",
    label: `Finalize ${pendingResults.length} campaign result${pendingResults.length === 1 ? "" : "s"}`,
    detail: "Pending results block campaign economics and pattern confidence.",
    value: `${pendingResults.length} pending`, href: "/intelligence/outcomes/", action: "Complete",
  });
  if (acceptedRecommendations > 0) priorities.push({
    type: "measure",
    label: `Measure ${acceptedRecommendations} accepted recommendation${acceptedRecommendations === 1 ? "" : "s"}`,
    detail: "Close the learning loop before stacking more changes.",
    value: `${acceptedRecommendations} open`, href: "/intelligence/recommendations/", action: "Measure",
  });
  if (staleBusinesses > 0) priorities.push({
    type: "refresh",
    label: `Refresh evidence for ${staleBusinesses} business${staleBusinesses === 1 ? "" : "es"}`,
    detail: "Old evidence weakens the quality of recommendations and comparisons.",
    value: `${staleBusinesses} stale`, href: "/intelligence/portfolio/", action: "Refresh",
  });
  if (openOpportunities.length > 0) priorities.push({
    type: "pipeline",
    label: `Follow up with ${openOpportunities.length} open opportunit${openOpportunities.length === 1 ? "y" : "ies"}`,
    detail: "Move active conversations forward before adding more cold volume.",
    value: pipelineMrr > 0 ? `$${Math.round(pipelineMrr).toLocaleString()}/mo` : `${openOpportunities.length} open`,
    href: "/pipeline/", action: "Follow up",
  });
  if (!priorities.length) priorities.push({
    type: "build",
    label: "Create the next qualified prospect demo",
    detail: "The operating loops are clear. Put the next strong opportunity into motion.",
    value: "10 min", href: "/admin/intake/", action: "Build",
  });

  const campaignSummary = {
    ...economics.summary,
    pending_results: pendingResults.length,
    result_coverage_percent: economics.summary.campaigns ? Math.round((economics.summary.results_recorded / economics.summary.campaigns) * 100) : 0,
    spend_coverage_percent: economics.summary.results_recorded ? Math.round((economics.summary.spend_recorded / economics.summary.results_recorded) * 100) : 0,
    contribution_after_recorded_spend: economics.summary.revenue_recorded - economics.summary.recorded_spend,
    recent: economics.rows.slice().sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)).slice(0, 6),
    thirty_day: campaignTrend,
  };

  const topPriority = priorities[0];
  return {
    generated_at: generatedAt,
    focus: {
      eyebrow: topPriority.type === "attention" ? "Protect the downside" : topPriority.type === "results" ? "Close the evidence gap" : topPriority.type === "measure" ? "Finish the learning loop" : topPriority.type === "pipeline" ? "Move revenue forward" : "Create momentum",
      headline: topPriority.label,
      detail: topPriority.detail,
      value: topPriority.value,
      href: topPriority.href,
      action: topPriority.action,
    },
    kpis: {
      mrr,
      arr,
      arpa,
      active_subscribers: activeSubscribers.length,
      paused_subscribers: pausedSubscribers.length,
      canceled_subscribers: canceledSubscribers.length,
      paused_mrr: pausedMrr,
      open_opportunities: openOpportunities.length,
      pipeline_mrr: pipelineMrr,
      lead_signals: leads.length,
      lead_signals_30d: leadTrend.current,
      tracked_businesses: num(summary.tracked_businesses),
      attention: num(summary.attention),
      intelligence_ready: num(summary.intelligence_ready),
      pending_campaign_results: pendingResults.length,
      accepted_recommendations: acceptedRecommendations,
      measured_recommendations: measuredRecommendations,
    },
    revenue: {
      mrr, arr, arpa, paused_mrr: pausedMrr,
      status: { active: activeSubscribers.length, paused: pausedSubscribers.length, canceled: canceledSubscribers.length },
      plan_mix: subscriberPlanMix(activeSubscribers),
    },
    pipeline: {
      stages: stageCounts(signups),
      total: signups.length,
      open: openOpportunities.length,
      pipeline_mrr: pipelineMrr,
      signup_30d: signupTrend,
      lead_30d: leadTrend,
      recent: signups.slice().sort((a, b) => Date.parse(rowDate(b, ["created_at"]) || 0) - Date.parse(rowDate(a, ["created_at"]) || 0)).slice(0, 10).map((row) => ({
        name: row.name || row.business_name || row.domain || row.email || "Opportunity",
        status: row.status || "unknown",
        plan: row.plan || null,
        created_at: row.created_at || null,
      })),
    },
    intelligence: {
      summary,
      average_readiness: averageReadiness,
      average_score: averageScore,
      stale_businesses: staleBusinesses,
      top_attention: portfolioRows.slice(0, 10).map((row) => ({
        name: row.name,
        domain: row.domain,
        vertical: row.vertical,
        score: row.current_score,
        urgency: row.urgency,
        bucket: row.bucket,
        reason: row.reason,
        next_action: row.next_action,
        readiness_score: row.readiness_score,
        stale_days: row.stale_days,
        peer_confidence: row.peer_confidence,
      })),
    },
    campaigns: campaignSummary,
    learning: {
      insight_status: stageCounts(insights),
      accepted: acceptedRecommendations,
      measured: measuredRecommendations,
      outcomes: outcomeStats,
    },
    priorities: priorities.slice(0, 7),
    activity: activityStream({ signups, leads, prospects, events, insights }),
    system_health: [
      healthRow("audits", "Audit portfolio", latestAt(prospects, ["updated_at"]), generatedAt, "/intelligence/portfolio/"),
      healthRow("observations", "BI observations", latestAt(observations, ["observed_at"]), generatedAt, "/intelligence/"),
      healthRow("events", "Business events", latestAt(events, ["occurred_at"]), generatedAt, "/intelligence/campaigns/"),
      healthRow("insights", "Recommendations", latestAt(insights, ["generated_at"]), generatedAt, "/intelligence/recommendations/"),
    ],
  };
}
