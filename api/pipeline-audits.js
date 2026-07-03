// GET /api/pipeline-audits — live measured audit data for the pipeline (admin-only).
// Returns { ok:true, source, generated_at, prospects:{slug:{...}} } from Supabase.
// On any issue returns { ok:false } (HTTP 200) so the pipeline cleanly falls back
// to the committed /data/prospect_audits.json snapshot.
import { sbSelect } from "./_lib.js";

export default async function handler(req, res) {
  try {
    const rows = await sbSelect("prospect_audits", "select=*");
    if (!Array.isArray(rows) || !rows.length) return res.status(200).json({ ok: false, reason: "empty" });
    const prospects = {};
    let latest = "";
    for (const r of rows) {
      prospects[r.slug] = {
        rank: r.rank, count: r.count, score: r.score, field_avg: r.field_avg,
        leads: r.leads, top_gap: r.top_gap, dmarc: r.dmarc, competitors: r.competitors || [],
      };
      if (r.updated_at && r.updated_at > latest) latest = r.updated_at;
    }
    return res.status(200).json({ ok: true, source: "live " + String(latest).slice(0, 10), generated_at: latest, prospects });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e && e.message ? e.message : e) });
  }
}
