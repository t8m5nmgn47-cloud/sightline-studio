// POST /api/scan-live — PUBLIC instant scan.
// Body: { domain: "example.com", biz?: "...", email?: "..." }
//
// Runs the same live, measured audit engine as /api/audit (HTTPS/headers/DNS/
// on-page — nothing authored), but public-facing: rate-limited, cached, and
// SSRF-guarded (via isPublicHost inside auditDomain). If a valid email is
// supplied we also capture a lead so the full report can follow by email.
//
// Note: rate limiting + cache here are in-memory and therefore best-effort on
// serverless (each warm instance keeps its own). For durable limits across all
// instances, put these in Vercel KV / Upstash. Good enough to blunt abuse.

import { readBody, clean, isEmail, insertLead, notifySlack, methodGuard } from "./_lib.js";
import { auditDomain, normDomain } from "./_audit.js";

const RL_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RL_MAX = 12;                    // scans per IP per window
const CACHE_TTL_MS = 10 * 60 * 1000;  // re-use a domain's result for 10 min

const rl = new Map();     // ip -> { count, reset }
const cache = new Map();  // domain -> { at, data }

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
}

function rateLimited(ip) {
  const now = Date.now();
  const rec = rl.get(ip);
  if (!rec || now > rec.reset) {
    rl.set(ip, { count: 1, reset: now + RL_WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count > RL_MAX;
}

// Trim the engine output down to what the client needs to render.
function publicShape(result) {
  const s = result.score || {};
  return {
    ok: !!result.ok,
    domain: result.domain,
    final_url: result.final_url || null,
    unreachable: !!s.unreachable || !result.ok,
    overall: s.overall || 0,
    areas: s.areas || { security: 0, quality: 0, presence: 0 },
    maxes: s.maxes || { security: 40, quality: 34, presence: 26 },
    // pass/fail per check, but drop internal-only fields
    checks: (s.checks || []).map((c) => ({ area: c.area, label: c.label, ok: !!c.ok, points: c.points, note: c.note || "" })),
  };
}

export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;

  const body = readBody(req);
  const domain = normDomain(body.domain);
  if (!domain || !/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(domain)) {
    return res.status(400).json({ ok: false, error: "Enter a valid website address, e.g. yourbusiness.com" });
  }

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    res.setHeader("Retry-After", "600");
    return res.status(429).json({ ok: false, error: "You've run a lot of scans — please try again in a few minutes." });
  }

  try {
    // Serve a fresh-enough cached result if we have one.
    const cached = cache.get(domain);
    let result;
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      result = cached.data;
    } else {
      result = await auditDomain(domain); // includes SSRF/public-host guard
      cache.set(domain, { at: Date.now(), data: result });
    }

    const payload = publicShape(result);

    // Optional lead capture — never let it break the scan response.
    const email = clean(body.email, 320);
    const biz = clean(body.biz, 200);
    if (isEmail(email)) {
      try {
        await insertLead({
          type: "scan",
          business: biz || domain,
          website: domain,
          email,
          message: `Instant scan · overall ${payload.overall}/100`,
          source: "instant-scan",
          user_agent: req.headers["user-agent"] || null,
        });
        await notifySlack(`⚡ Instant scan + lead\n*${biz || domain}* — ${domain} — score ${payload.overall}/100\n${email}`);
      } catch (e) {
        console.error("instant-scan lead capture failed:", e);
      }
    }

    return res.status(200).json({ ok: true, generated_at: new Date().toISOString(), ...payload });
  } catch (e) {
    console.error("scan-live failed:", e);
    return res.status(500).json({ ok: false, error: "Scan failed — please try again." });
  }
}
