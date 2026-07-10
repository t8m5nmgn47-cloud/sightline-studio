// Pure aggregation model for the private admin dashboard.
// Keeps operating metrics separate from rendering and transport concerns.

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

export function buildAdminDashboard({ subscribers = [], signups = [], leads = [], portfolio = {}, events = [], insights = [] } = {}) {
  const activeSubscribers = subscribers.filter((row) => row.status === "active");
  const pausedSubscribers = subscribers.filter((row) => row.status === "paused");
  const canceledSubscribers = subscribers.filter((row) => row.status === "canceled");
  const mrr = activeSubscribers.reduce((sum, row) => sum + num(row.mo), 0);

  const openOpportunities = signups.filter((row) => ["new", "contacted"].includes(String(row.status || "").toLowerCase()));
  const pipelineMrr = openOpportunities.reduce((sum, row) => sum + planPrice(row.plan), 0);
  const pendingResults = pendingCampaignResults(events);
  const acceptedRecommendations = insights.filter((row) => row.status === "accepted").length;
  const measuredRecommendations = insights.filter((row) => row.status === "measured").length;
  const summary = portfolio.summary || {};

  const priorities = [];
  const attentionRows = (portfolio.rows || []).filter((row) => row.bucket === "attention").slice(0, 3);
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
  if (acceptedRecommendations > 0) priorities.push({
    type: "measure",
    label: `Measure ${acceptedRecommendations} accepted recommendation${acceptedRecommendations === 1 ? "" : "s"}`,
    detail: "Close the learning loop before stacking more changes.",
    value: `${acceptedRecommendations} open`, href: "/intelligence/recommendations/", action: "Measure",
  });
  if (pendingResults.length > 0) priorities.push({
    type: "results",
    label: `Finalize ${pendingResults.length} campaign result${pendingResults.length === 1 ? "" : "s"}`,
    detail: "Pending results cannot support economics or pattern claims yet.",
    value: `${pendingResults.length} pending`, href: "/intelligence/outcomes/", action: "Complete",
  });
  if (openOpportunities.length > 0) priorities.push({
    type: "pipeline",
    label: `Follow up with ${openOpportunities.length} open opportunit${openOpportunities.length === 1 ? "y" : "ies"}`,
    detail: "Speed-to-lead is the highest-leverage pipeline action.",
    value: pipelineMrr > 0 ? `$${Math.round(pipelineMrr).toLocaleString()}/mo` : `${openOpportunities.length} open`,
    href: "/leads/", action: "Follow up",
  });
  if (!priorities.length) priorities.push({
    type: "build",
    label: "Create the next qualified prospect demo",
    detail: "Keep the top of the pipeline moving while current loops are closed.",
    value: "10 min", href: "/admin/intake/", action: "Build",
  });

  return {
    generated_at: new Date().toISOString(),
    kpis: {
      mrr,
      active_subscribers: activeSubscribers.length,
      paused_subscribers: pausedSubscribers.length,
      canceled_subscribers: canceledSubscribers.length,
      open_opportunities: openOpportunities.length,
      pipeline_mrr: pipelineMrr,
      lead_signals: leads.length,
      tracked_businesses: num(summary.tracked_businesses),
      attention: num(summary.attention),
      intelligence_ready: num(summary.intelligence_ready),
      pending_campaign_results: pendingResults.length,
      accepted_recommendations: acceptedRecommendations,
      measured_recommendations: measuredRecommendations,
    },
    pipeline: {
      stages: stageCounts(signups),
      recent: signups.slice(0, 8).map((row) => ({
        name: row.name || row.business_name || row.domain || row.email || "Opportunity",
        status: row.status || "unknown",
        plan: row.plan || null,
        created_at: row.created_at || null,
      })),
    },
    intelligence: {
      summary,
      top_attention: (portfolio.rows || []).slice(0, 6).map((row) => ({
        name: row.name,
        domain: row.domain,
        score: row.current_score,
        urgency: row.urgency,
        bucket: row.bucket,
        reason: row.reason,
        readiness_score: row.readiness_score,
      })),
    },
    priorities: priorities.slice(0, 5),
  };
}
