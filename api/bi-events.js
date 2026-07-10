// GET /api/bi-events?domain=example.com
// POST /api/bi-events with { event } or { events: [...] }
// Admin-only via middleware. Provides the manual event spine for campaign,
// conversion, review and operational learning before direct integrations exist.

import { clean, readBody, sbInsert, sbSelect } from "./_lib.js";
import { normDomain } from "./_audit.js";

const DOMAIN_RE = /^([a-z0-9-]+\.)+[a-z]{2,}$/i;
const EVENT_TYPES = new Set([
  "campaign_sent",
  "post_published",
  "promotion_started",
  "email_opened",
  "link_clicked",
  "lead_created",
  "booking_created",
  "conversion",
  "sale_completed",
  "review_received",
]);
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function normalizeEvent(input = {}) {
  const entityKey = normDomain(input.entity_key || input.domain || "");
  if (!entityKey || !DOMAIN_RE.test(entityKey)) throw new Error("Each event needs a valid business domain.");
  const eventType = clean(input.event_type, 80);
  if (!EVENT_TYPES.has(eventType)) throw new Error(`Unsupported event type: ${eventType || "missing"}`);

  const occurred = input.occurred_at ? new Date(input.occurred_at) : new Date();
  if (Number.isNaN(occurred.getTime())) throw new Error("occurred_at must be a valid date/time.");
  const metadata = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? input.metadata : {};
  const storedDay = clean(input.local_weekday, 20);
  const localHourRaw = input.local_hour;
  const localHour = localHourRaw === "" || localHourRaw == null ? null : Number(localHourRaw);
  if (localHour != null && (!Number.isInteger(localHour) || localHour < 0 || localHour > 23)) throw new Error("local_hour must be an integer from 0 to 23.");

  return {
    entity_key: entityKey,
    event_type: eventType,
    occurred_at: occurred.toISOString(),
    channel: clean(input.channel, 80) || null,
    campaign_id: clean(input.campaign_id, 160) || null,
    offer_id: clean(input.offer_id, 160) || null,
    creative_id: clean(input.creative_id, 160) || null,
    customer_ref: clean(input.customer_ref, 160) || null,
    local_weekday: DAY_NAMES.includes(storedDay) ? storedDay : null,
    local_hour: localHour,
    value_numeric: input.value_numeric == null || input.value_numeric === "" ? null : Number(input.value_numeric),
    metadata,
  };
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const domain = normDomain(req.query?.domain || "");
    if (!domain || !DOMAIN_RE.test(domain)) return res.status(400).json({ ok: false, error: "Enter a valid domain." });
    try {
      const rows = await sbSelect(
        "bi_events",
        `select=id,event_type,occurred_at,channel,campaign_id,offer_id,creative_id,local_weekday,local_hour,value_numeric,metadata&entity_key=eq.${encodeURIComponent(domain)}&order=occurred_at.desc&limit=500`,
      );
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json({ ok: true, entity_key: domain, events: rows });
    } catch (e) {
      console.error("BI event read failed:", e?.message || e);
      return res.status(500).json({ ok: false, error: "Could not load BI events." });
    }
  }

  if (req.method === "POST") {
    try {
      const body = readBody(req);
      const raw = Array.isArray(body.events) ? body.events : body.event ? [body.event] : [body];
      if (!raw.length || raw.length > 100) return res.status(400).json({ ok: false, error: "Send between 1 and 100 events per request." });
      const rows = raw.map(normalizeEvent);
      for (const row of rows) {
        if (row.value_numeric != null && !Number.isFinite(row.value_numeric)) throw new Error("value_numeric must be a number.");
      }
      await sbInsert("bi_events", rows);
      return res.status(201).json({ ok: true, inserted: rows.length, entity_key: rows[0].entity_key });
    } catch (e) {
      return res.status(400).json({ ok: false, error: String(e?.message || e) });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
