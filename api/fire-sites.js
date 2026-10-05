// Fire Department Outreach (admin): proxies to the Supabase `fire-sites-api` edge function.
// Admin-only: Basic Auth via requireAdmin (same credentials as /admin).
import { requireAdmin } from "./_admin_auth.js";

const ACTIONS = new Set(["targets", "stats", "queue", "search", "department", "save_outreach"]);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!requireAdmin(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body || !ACTIONS.has(body.action)) return res.status(400).json({ error: "Unknown action" });
  if (!process.env.FIRE_API_URL || !process.env.FIRE_API_KEY) return res.status(503).json({ error: "The fire departments database is not connected yet." });
  try {
    const r = await fetch(process.env.FIRE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.FIRE_API_KEY },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    res.status(r.status).setHeader("Content-Type", "application/json");
    return res.send(text);
  } catch {
    return res.status(502).json({ error: "The database did not answer. Try again in a moment." });
  }
}
