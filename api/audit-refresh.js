// GET /api/audit-refresh — the self-running heart of the Outreach Engine.
// Re-audits the stalest prospects' stored competitor sets, recomputes rank /
// score / top gap, and writes them back to Supabase. Triggered by a Vercel Cron
// (which sends Authorization: Bearer $CRON_SECRET). Not behind Basic-Auth so the
// cron can reach it; guarded by CRON_SECRET instead.
import { sbSelect, sbUpdate, sbInsert } from "./_lib.js";
import { auditDomain, normDomain } from "./_audit.js";
import { scanObservationRows } from "./_intelligence.js";
import { checkObservationRows } from "./_check_observations.js";
import { normalizeObservationInsertRows } from "./_observation_rows.js";
import { assessPeerSet } from "./_peer_quality.js";

const BATCH = 6; // stalest N per run — daily cron cycles the full book in ~1 week

export function topGap(a) {
  if (!a || !a.ok) return "Site not reachable over HTTPS";
  const by = {}; (a.score.checks || []).forEach((c) => (by[c.label] = c));
  const failed = (l) => by[l] && !by[l].ok;
  const em = a.email || {};
  if (failed("Redirects HTTP → HTTPS") || failed("Valid HTTPS / certificate")) return "No proper HTTPS — browsers can warn visitors your site isn't secure";
  if (em.dmarc_present && em.dmarc_policy === "none") return "DMARC isn't enforced (p=none) — your email can be spoofed by scammers";
  if (!em.dmarc_present) return "No DMARC record — your email domain can be impersonated";
  const secHdr = ["HSTS (Strict-Transport-Security)", "Content-Security-Policy", "X-Frame-Options (clickjacking)", "X-Content-Type-Options"].filter(failed).length;
  if (secHdr >= 3) return "Missing web-security headers (clickjacking & content protections)";
  if (failed("Mobile viewport set")) return "Not mobile-friendly — the site doesn't adapt to phones";
  if (failed("Meta description present")) return "Weak search presence — no meta description for Google";
  if (failed("At least one social profile")) return "No social profiles linked from the site";
  if (secHdr >= 1) return "A couple of web-security headers are missing";
  return "Only minor gaps — you're already in strong shape online";
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ ok: false, error: "CRON_SECRET not configured" });
  if ((req.headers.authorization || "") !== `Bearer ${secret}`) return res.status(401).json({ ok: false, error: "unauthorized" });
  let rows;
  try { rows = await sbSelect("prospect_audits", "select=slug,name,domain,vertical,competitors&order=updated_at.asc&limit=" + BATCH); }
  catch (e) { return res.status(500).json({ ok: false, error: String(e && e.message ? e.message : e) }); }

  const results = [];
  for (const row of rows) {
    try {
      const pd = normDomain(row.domain);
      const peerSet = assessPeerSet(row.vertical || "", row.competitors || []);
      const comps = peerSet.eligible.slice(0, 8);
      const domains = [pd, ...comps.map((c) => normDomain(c.domain)).filter(Boolean)];
      const audited = await Promise.all(domains.map((d) => auditDomain(d).catch(() => ({ domain: d, ok: false, score: { overall: 0, areas: {}, checks: [] } }))));
      const field = audited.filter((a) => a.ok).sort((a, b) => b.score.overall - a.score.overall);
      const N = field.length;
      const prospect = audited.find((a) => normDomain(a.domain) === pd);
      const reliableRank = peerSet.confidence !== "low" && field.filter((a) => normDomain(a.domain) !== pd).length >= 3;
      const rankIndex = field.findIndex((a) => normDomain(a.domain) === pd);
      const rank = reliableRank && rankIndex >= 0 ? rankIndex + 1 : null;
      const count = reliableRank ? N : null;
      const avg = N ? Math.round(field.reduce((s, a) => s + a.score.overall, 0) / N) : 0;
      const score = prospect && prospect.ok ? prospect.score.overall : 0;
      const dmarc = prospect && prospect.email ? prospect.email.dmarc_policy || "" : "";
      const leads = !!rank && rank <= 2 && score >= 78;
      const compByDomain = new Map(comps.map((c) => [normDomain(c.domain), c]));
      const competitors = field.filter((a) => normDomain(a.domain) !== pd).map((a) => {
        const stored = compByDomain.get(normDomain(a.domain)) || {};
        return {
          name: stored.name || a.domain,
          domain: normDomain(a.domain),
          score: a.score.overall,
          distance_km: stored.distance_km ?? null,
          peer_quality: stored.peer_quality || null,
        };
      });
      const observedAt = new Date().toISOString();
      await sbUpdate("prospect_audits", `slug=eq.${encodeURIComponent(row.slug)}`, {
        rank, count, score, field_avg: avg, leads, top_gap: topGap(prospect), dmarc, competitors, updated_at: observedAt,
      });

      // Preserve immutable score + check history for the prospect and every
      // eligible measured peer. Best-effort: BI storage must not stop refreshes.
      try {
        const rawObservations = audited.flatMap((a) => {
          const d = normDomain(a.domain);
          const peer = compByDomain.get(d);
          const opts = {
            entityKey: d,
            entityName: d === pd ? (row.name || pd) : (peer?.name || d),
            source: "scheduled_audit_refresh",
            observedAt,
          };
          return [
            ...scanObservationRows(a, opts),
            ...checkObservationRows(a, opts),
          ];
        });
        const observations = normalizeObservationInsertRows(rawObservations);
        if (observations.length) await sbInsert("bi_observations", observations);
      } catch (e) {
        console.error(`BI observation save failed for ${row.slug}:`, e?.message || e);
      }

      results.push({
        slug: row.slug,
        rank,
        count,
        score,
        peer_confidence: peerSet.confidence,
        eligible_peers: peerSet.eligible_count,
        suppressed_peers: peerSet.suppressed_count,
      });
    } catch (e) { results.push({ slug: row.slug, error: String(e && e.message ? e.message : e) }); }
  }
  return res.status(200).json({ ok: true, refreshed: results.length, results });
}
