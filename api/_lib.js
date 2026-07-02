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

// Insert a lead into Supabase via the REST API (no SDK dependency).
export async function insertLead(row) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase env vars are not configured");
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Supabase insert failed (${res.status}): ${detail}`);
  }
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
