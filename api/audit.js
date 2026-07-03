// POST /api/audit — real public-signal exposure audit (admin-only).
// Body: { domain: "example.com" }  or  { domains: ["a.com","b.com", ...] }
// Returns measured signals + transparent scores for each domain. Every number
// is probed live (HTTPS/headers/DNS/on-page) — nothing is authored.
import { readBody, methodGuard } from "./_lib.js";
import { auditDomain, normDomain } from "./_audit.js";

export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;

  const body = readBody(req);
  let domains = [];
  if (Array.isArray(body.domains)) domains = body.domains;
  else if (body.domain) domains = [body.domain];
  domains = [...new Set(domains.map(normDomain).filter(Boolean))].slice(0, 12);

  if (!domains.length) {
    return res.status(400).json({ ok: false, error: "Provide domain or domains[]" });
  }

  try {
    const results = await Promise.all(
      domains.map((d) => auditDomain(d).catch((e) => ({ domain: d, ok: false, error: String(e && e.message ? e.message : e), score: { overall: 0, areas: {}, checks: [], unreachable: true } })))
    );
    // Rank reachable domains by overall score (desc) for a ready leaderboard.
    const ranked = [...results].sort((a, b) => (b.score?.overall || 0) - (a.score?.overall || 0));
    return res.status(200).json({ ok: true, generated_at: new Date().toISOString(), count: results.length, results, ranked_domains: ranked.map((r) => r.domain) });
  } catch (e) {
    console.error("audit failed:", e);
    return res.status(500).json({ ok: false, error: "Audit failed" });
  }
}
