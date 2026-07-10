// Shared helpers for lead-capture endpoints.
// Files in /api starting with "_" are NOT routed by Vercel — safe for shared code.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL; // optional

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isEmail(v) {
  return typeof v === "string" && EMAIL_RE.test(v.trim());
}

export function clean(v, max = 2000) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function readBody(req) {
  // Vercel Node functions auto-parse JSON/urlencoded into req.body.
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

function sbHeaders(prefer = null) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase env vars are not configured");
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

// PostgREST requires every object in a JSON insert array to have the same key set.
// Normalize sparse rows to the union of keys so mixed observation types can be
// inserted together without turning omitted fields into a batch-level failure.
export function normalizeInsertRows(row) {
  if (!Array.isArray(row) || row.length < 2) return row;
  const keys = [...new Set(row.flatMap((item) => Object.keys(item || {})))];
  return row.map((item) => Object.fromEntries(keys.map((key) => [key, Object.prototype.hasOwnProperty.call(item || {}, key) ? item[key] : null])));
}

// Insert one row or an array of rows via PostgREST.
export async function sbInsert(table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: sbHeaders("return=minimal"),
    body: JSON.stringify(normalizeInsertRows(row)),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Supabase insert failed (${res.status}): ${detail}`);
  }
}

// Insert and return the created representation. Useful when a follow-up workflow
// needs the generated UUID immediately (for example recommendation tracking).
export async function sbInsertReturning(table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: sbHeaders("return=representation"),
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Supabase insert failed (${res.status}): ${detail}`);
  }
  return res.json();
}

export const insertLead = (row) => sbInsert("leads", row);
export const insertOrder = (row) => sbInsert("orders", row);
export const insertCustomer = (row) => sbInsert("customers", row);

// Read rows from a table (service-role; bypasses RLS). `query` is a PostgREST
// query string, e.g. "select=*&order=updated_at.asc&limit=6".
export async function sbSelect(table, query = "select=*") {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase env vars are not configured");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase select failed (${res.status}): ${await res.text().catch(() => "")}`);
  return res.json();
}

// Upsert: insert or replace on a unique column, e.g. onConflict="domain".
export async function sbUpsert(table, row, onConflict) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase env vars are not configured");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: sbHeaders("resolution=merge-duplicates,return=minimal"),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase upsert failed (${res.status}): ${await res.text().catch(() => "")}`);
}

// Patch rows matching a PostgREST filter, e.g. filter="slug=eq.foo".
export async function sbUpdate(table, filter, row) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase env vars are not configured");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: sbHeaders("return=minimal"),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase update failed (${res.status}): ${await res.text().catch(() => "")}`);
}

// Optional Slack notification. No-ops if SLACK_WEBHOOK_URL is unset.
// Never throws — a failed notification must not fail the lead capture.
export async function notifySlack(text) {
  if (!SLACK_WEBHOOK_URL) return;
  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.error("Slack notify failed:", e);
  }
}

export function methodGuard(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return false;
  }
  return true;
}
