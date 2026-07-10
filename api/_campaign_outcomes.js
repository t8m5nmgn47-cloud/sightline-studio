// Campaign outcome completion helpers. A campaign send can remain pending until
// results are known, then be finalized exactly once with an explicit result event.

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function text(v, max = 500) {
  return String(v || "").trim().slice(0, max);
}

export function foldCampaignOutcomeQueue(events = []) {
  const sends = new Map();
  const results = new Map();

  for (const event of events) {
    if (!event.campaign_id) continue;
    if (event.event_type === "campaign_sent" && !sends.has(event.campaign_id)) sends.set(event.campaign_id, event);
    if (event.event_type === "campaign_result") {
      const current = results.get(event.campaign_id);
      if (!current || Date.parse(event.occurred_at) > Date.parse(current.occurred_at)) results.set(event.campaign_id, event);
    }
  }

  const rows = [];
  for (const [campaignId, send] of sends.entries()) {
    const result = results.get(campaignId) || null;
    const sendMeta = send.metadata && typeof send.metadata === "object" ? send.metadata : {};
    const resultMeta = result?.metadata && typeof result.metadata === "object" ? result.metadata : {};
    rows.push({
      campaign_id: campaignId,
      campaign_name: sendMeta.campaign_name || campaignId,
      channel: send.channel || null,
      offer_id: send.offer_id || null,
      creative_id: send.creative_id || null,
      comparison_group: sendMeta.comparison_group || null,
      audience_size: sendMeta.audience_size ?? null,
      spend: sendMeta.spend ?? null,
      sent_at: send.occurred_at,
      status: result ? "finalized" : "pending",
      finalized_at: result?.occurred_at || null,
      bookings: result ? Math.max(0, Math.round(num(resultMeta.bookings, 0))) : null,
      revenue: result ? num(result.value_numeric, 0) : null,
    });
  }

  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
    return Date.parse(b.sent_at || 0) - Date.parse(a.sent_at || 0);
  });
  return rows;
}

export function validateCampaignCompletion(input = {}) {
  const bookings = num(input.bookings, NaN);
  const revenue = num(input.revenue, NaN);
  if (!Number.isInteger(bookings) || bookings < 0) throw new Error("Bookings must be a whole number of zero or more.");
  if (!Number.isFinite(revenue) || revenue < 0) throw new Error("Revenue must be zero or more.");
  const notes = text(input.notes, 3000) || null;
  return { bookings, revenue, notes };
}

export function campaignCompletionEvents(campaign, completion, occurredAt = new Date().toISOString()) {
  if (!campaign?.campaign_id) throw new Error("Campaign is required.");
  if (campaign.status === "finalized") throw new Error("Campaign results are already finalized.");
  const result = validateCampaignCompletion(completion);
  const base = {
    entity_key: campaign.entity_key,
    campaign_id: campaign.campaign_id,
    channel: campaign.channel || null,
    offer_id: campaign.offer_id || null,
    creative_id: campaign.creative_id || null,
    occurred_at: new Date(occurredAt).toISOString(),
  };
  const events = [{
    ...base,
    event_type: "campaign_result",
    value_numeric: result.revenue,
    metadata: { bookings: result.bookings, results_finalized: true, notes: result.notes },
  }];
  if (result.bookings > 0) {
    events.push({
      ...base,
      event_type: "booking_created",
      value_numeric: result.revenue || null,
      metadata: { count: result.bookings, finalized_from_campaign_result: true },
    });
  } else if (result.revenue > 0) {
    events.push({
      ...base,
      event_type: "sale_completed",
      value_numeric: result.revenue,
      metadata: { count: 1, finalized_from_campaign_result: true },
    });
  }
  return events;
}
