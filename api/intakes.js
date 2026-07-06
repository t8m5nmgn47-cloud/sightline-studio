// GET /api/intakes — recent prospect-intake runs (admin-only via middleware).
// Returns the latest saved run per domain, newest first, ready to reopen in
// the intake UI without re-crawling.

import { sbSelect } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  try {
    const rows = await sbSelect(
      "prospect_intakes",
      "select=domain,tier,profile,signals,updated_at&order=updated_at.desc&limit=40"
    );
    return res.status(200).json({ ok: true, intakes: rows });
  } catch (e) {
    return res.status(503).json({ ok: false, error: e.message });
  }
}
