// POST /api/discover — find genuinely-local competitors (admin-only).
// Body: { location: "Highlands Ranch, CO", category: "Dental practice",
//         exclude_domain?, radius_km? }
// Returns real nearby same-category businesses that have a website (via OSM).
import { readBody, clean, methodGuard } from "./_lib.js";
import { discoverCompetitors } from "./_discover.js";

export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;
  const body = readBody(req);
  const location = clean(body.location, 160);
  const category = clean(body.category, 160);
  const excludeDomain = clean(body.exclude_domain, 253);
  const radiusKm = Math.min(40, Math.max(3, Number(body.radius_km) || 12));

  if (!location) return res.status(400).json({ ok: false, error: "location required" });

  try {
    const r = await discoverCompetitors(category, location, { radiusKm, limit: 14, excludeDomain });
    return res.status(r.ok ? 200 : 502).json(r);
  } catch (e) {
    console.error("discover failed:", e);
    return res.status(500).json({ ok: false, error: "Discovery failed" });
  }
}
