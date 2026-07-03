// Sightline Exposure Audit — real, measured public-signal probe + transparent
// scoring. Files in /api starting with "_" are NOT routed by Vercel.
//
// Everything here is MEASURED, never authored: HTTPS/redirect/cert, security
// headers, DMARC/SPF (DNS), and on-page signals (viewport, title, description,
// social links, structured data). scoreSignals() maps those measurements to a
// transparent per-check breakdown (Security 40 / Quality 34 / Presence 26).

import { promises as dns } from "dns";
import net from "net";
import * as cheerio from "cheerio";

const UA = "Mozilla/5.0 (compatible; SightlineAudit/1.0; +https://sightline-studio.vercel.app/audit)";
const TIMEOUT = 12000;

export function normDomain(input) {
  return String(input || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
}

// SSRF guard: only audit real, public hostnames. Reject localhost, private and
// reserved ranges, and anything that resolves to them.
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    return p[0] === 10 || p[0] === 127 || p[0] === 0 ||
      (p[0] === 192 && p[1] === 168) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 169 && p[1] === 254) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127);
  }
  const l = ip.toLowerCase();
  return l === "::1" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l === "::";
}

export async function isPublicHost(domain) {
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(domain)) return false;
  if (/(^|\.)(local|internal|localhost)$/i.test(domain)) return false;
  try {
    const addrs = await dns.lookup(domain, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA }, ...opts });
  } finally {
    clearTimeout(t);
  }
}

async function checkHttps(domain) {
  const out = { reachable: false, https_ok: false, cert_valid: false, redirects_to_https: false, final_url: "", status: 0, headers: {}, html: "" };
  // Does http:// redirect to https://?
  try {
    const r = await fetchWithTimeout("http://" + domain, { redirect: "manual" });
    const loc = r.headers.get("location") || "";
    if (r.status >= 300 && r.status < 400 && /^https:/i.test(loc)) out.redirects_to_https = true;
    if (r.status === 200) out.reachable = true;
  } catch {}
  // Fetch over https (follow redirects). A TLS failure throws -> cert_valid stays false.
  try {
    const r = await fetchWithTimeout("https://" + domain, { redirect: "follow" });
    out.reachable = true;
    out.status = r.status;
    out.https_ok = r.ok;
    out.cert_valid = true; // undici throws on invalid/expired cert before we get here
    out.final_url = r.url || "https://" + domain;
    if (/^https:/i.test(out.final_url)) out.redirects_to_https = true;
    const h = out.headers;
    const g = (k) => r.headers.get(k) || "";
    h.hsts = g("strict-transport-security");
    h.csp = g("content-security-policy");
    h.x_frame = g("x-frame-options");
    h.x_content_type = g("x-content-type-options");
    h.referrer = g("referrer-policy");
    h.permissions = g("permissions-policy");
    out.html = (await r.text()).slice(0, 2_500_000);
  } catch (e) {
    out.tls_error = String(e && e.message ? e.message : e);
  }
  return out;
}

async function txt(name) {
  try { return (await dns.resolveTxt(name)).map((chunks) => chunks.join("")); } catch { return []; }
}

async function checkEmail(domain) {
  const dmarcRecs = await txt("_dmarc." + domain);
  const dmarc = dmarcRecs.find((r) => /v=DMARC1/i.test(r)) || "";
  const policyMatch = dmarc.match(/\bp=(none|quarantine|reject)\b/i);
  const spfRecs = await txt(domain);
  const spf = spfRecs.find((r) => /v=spf1/i.test(r)) || "";
  return {
    dmarc_present: !!dmarc,
    dmarc_policy: policyMatch ? policyMatch[1].toLowerCase() : (dmarc ? "none" : ""),
    spf_present: !!spf,
  };
}

const SOCIAL_RE = /(facebook|instagram|linkedin|youtube|tiktok|twitter|x\.com|pinterest|yelp)\.com/i;

function pageSignals(html, finalUrl) {
  const out = { title: "", has_description: false, has_viewport: false, has_favicon: false, has_jsonld: false, has_nap: false, socials: [], html_len: (html || "").length };
  if (!html) return out;
  const $ = cheerio.load(html);
  out.title = $("title").first().text().trim();
  out.has_description = !!$('meta[name="description"], meta[property="og:description"]').attr("content");
  out.has_viewport = !!$('meta[name="viewport"]').attr("content");
  out.has_favicon = !!$('link[rel~="icon"], link[rel="shortcut icon"], link[rel~="apple-touch-icon"]').attr("href");
  out.has_jsonld = $('script[type="application/ld+json"]').length > 0;
  const socials = new Set();
  $("a[href]").each((_, el) => {
    const href = (el.attribs.href || "");
    const m = href.match(SOCIAL_RE);
    if (m) { let k = m[1].toLowerCase(); if (k === "x.com") k = "twitter"; socials.add(k); }
    if (/^tel:/i.test(href)) out.has_nap = true;
  });
  out.socials = [...socials];
  if (!out.has_nap && (/"telephone"/i.test(html) || /\(\d{3}\)\s?\d{3}-\d{4}/.test($("body").text()))) out.has_nap = true;
  return out;
}

// Combine everything into a raw signal bundle.
export async function probeDomain(input) {
  const domain = normDomain(input);
  if (!(await isPublicHost(domain))) return { domain, ok: false, error: "not a reachable public domain" };
  const https = await checkHttps(domain);
  const email = await checkEmail(domain);
  const page = pageSignals(https.html, https.final_url);
  return {
    domain, ok: https.reachable,
    final_url: https.final_url || "https://" + domain,
    https: { ok: https.https_ok, cert_valid: https.cert_valid, redirects_to_https: https.redirects_to_https, status: https.status, tls_error: https.tls_error || null },
    headers: https.headers,
    email,
    page,
  };
}

// ---------------------------------------------------------------------------
// Transparent scoring. Every point is tied to a measured check.
// ---------------------------------------------------------------------------

function has(v) { return typeof v === "string" ? v.trim().length > 0 : !!v; }

export function scoreSignals(s) {
  if (!s || !s.ok) {
    return { overall: 0, areas: { security: 0, quality: 0, presence: 0 }, checks: [], unreachable: true };
  }
  const h = s.headers || {};
  const em = s.email || {};
  const pg = s.page || {};
  const enforced = em.dmarc_policy === "reject" || em.dmarc_policy === "quarantine";

  const checks = [
    // Security — 40
    { area: "security", label: "Redirects HTTP → HTTPS", ok: !!s.https.redirects_to_https, points: 8 },
    { area: "security", label: "Valid HTTPS / certificate", ok: !!s.https.cert_valid && !!s.https.ok, points: 6 },
    { area: "security", label: "HSTS (Strict-Transport-Security)", ok: has(h.hsts) && !/max-age=0\b/.test(h.hsts || ""), points: 6 },
    { area: "security", label: "Content-Security-Policy", ok: has(h.csp), points: 5 },
    { area: "security", label: "X-Frame-Options (clickjacking)", ok: has(h.x_frame), points: 3 },
    { area: "security", label: "X-Content-Type-Options", ok: has(h.x_content_type), points: 3 },
    { area: "security", label: "Referrer-Policy", ok: has(h.referrer), points: 2 },
    { area: "security", label: "Permissions-Policy", ok: has(h.permissions), points: 2 },
    { area: "security", label: "DMARC record present", ok: !!em.dmarc_present, points: 2 },
    { area: "security", label: "DMARC enforced (quarantine/reject)", ok: enforced, points: 2, note: em.dmarc_present && !enforced ? "p=none — email is spoofable" : "" },
    { area: "security", label: "SPF record present", ok: !!em.spf_present, points: 1 },
    // Quality & mobile — 34
    { area: "quality", label: "Site loads (HTTP 200)", ok: s.https.status === 200 || s.ok, points: 8 },
    { area: "quality", label: "Mobile viewport set", ok: !!pg.has_viewport, points: 10 },
    { area: "quality", label: "Page title present", ok: has(pg.title), points: 4 },
    { area: "quality", label: "Meta description present", ok: !!pg.has_description, points: 4 },
    { area: "quality", label: "Favicon present", ok: !!pg.has_favicon, points: 2 },
    { area: "quality", label: "Substantial content", ok: (pg.html_len || 0) > 8000, points: 6 },
    // Reputation & presence — 26
    { area: "presence", label: "At least one social profile", ok: (pg.socials || []).length >= 1, points: 8 },
    { area: "presence", label: "Two or more social channels", ok: (pg.socials || []).length >= 2, points: 6 },
    { area: "presence", label: "Four or more social channels", ok: (pg.socials || []).length >= 4, points: 4 },
    { area: "presence", label: "Structured data (schema.org)", ok: !!pg.has_jsonld, points: 4 },
    { area: "presence", label: "Name/phone on site (NAP)", ok: !!pg.has_nap, points: 4 },
  ];

  const areas = { security: 0, quality: 0, presence: 0 };
  const maxes = { security: 0, quality: 0, presence: 0 };
  checks.forEach((c) => { maxes[c.area] += c.points; if (c.ok) areas[c.area] += c.points; });
  const overall = Math.round(areas.security + areas.quality + areas.presence);
  return { overall, areas, maxes, checks, unreachable: false };
}

export async function auditDomain(input) {
  const signals = await probeDomain(input);
  const score = scoreSignals(signals);
  return { ...signals, score };
}
