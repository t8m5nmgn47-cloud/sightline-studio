// Prospect Intake Engine — extraction library.
// Files in /api starting with "_" are NOT routed by Vercel — shared code only.
//
// Pipeline (see api/intake.js):
//   1. Fetch the prospect's HTML (fast tier). Escalate to headless Chromium
//      only when the page is a JS shell (little server-rendered text).
//   2. Deterministically extract structured facts + logo candidates + colour
//      signals (JSON-LD / OpenGraph / meta / <img> / CSS). No guessing here.
//   3. Optionally have Claude normalise the messy signals into our clean
//      prospects.json schema. If ANTHROPIC_API_KEY is unset the engine still
//      returns the deterministic draft for human review — the LLM is an
//      enhancer, not a hard dependency.

import * as cheerio from "cheerio";

const UA =
  "Mozilla/5.0 (compatible; SightlineStudioIntake/1.0; +https://sightline-studio.vercel.app/intake)";

// ---------------------------------------------------------------------------
// Fetch tiers
// ---------------------------------------------------------------------------

// Fast tier: plain HTTPS fetch of the homepage HTML. Handles the ~90% of
// local-business sites that are server-rendered (WordPress, Wix, Squarespace,
// site-builder platforms). Follows http->https and redirects.
export async function fetchHtml(domain, { timeoutMs = 15000 } = {}) {
  let lastErr = "";
  for (const scheme of ["https://", "http://"]) {
    const url = scheme + domain.replace(/^https?:\/\//, "");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      });
      clearTimeout(t);
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        continue;
      }
      const html = (await res.text()).slice(0, 3_000_000);
      return { ok: true, finalUrl: res.url || url, html, tier: "fetch" };
    } catch (e) {
      clearTimeout(t);
      lastErr = String(e && e.message ? e.message : e);
    }
  }
  return { ok: false, error: lastErr };
}

// Anti-bot fallback tier: Firecrawl (https://firecrawl.dev). Sites behind
// Akamai / Cloudflare bot managers (e.g. olivegarden.com, mark7reloading.com)
// return 403 to both our fetch UA and Vercel's datacenter IPs. Firecrawl runs
// a real browser on unblocked infra and solves most challenges. Failure-
// tolerant: if FIRECRAWL_API_KEY is unset or the call fails, the caller
// surfaces the original error instead of 500ing.
export async function fetchViaFirecrawl(domain, { timeoutMs = 60000 } = {}) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return { ok: false, skipped: true, error: "FIRECRAWL_API_KEY not set" };
  const url = "https://" + domain.replace(/^https?:\/\//, "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, formats: ["html"] }),
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, error: `Firecrawl HTTP ${res.status}` };
    const data = await res.json().catch(() => null);
    const html = data && data.success && data.data && data.data.html;
    if (!html) return { ok: false, error: "Firecrawl returned no HTML" };
    return {
      ok: true,
      finalUrl: (data.data.metadata && data.data.metadata.url) || url,
      html: String(html).slice(0, 3_000_000),
      tier: "firecrawl",
    };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

// Escalation tier: render with headless Chromium (playwright-core +
// @sparticuz/chromium on Vercel). Dynamically imported and failure-tolerant —
// if the deps aren't installed or the launch fails, the caller falls back to
// the fast-tier HTML rather than 500ing.
export async function renderHtml(domain, { timeoutMs = 25000 } = {}) {
  let browser;
  try {
    const [{ default: chromium }, { chromium: pw }] = await Promise.all([
      import("@sparticuz/chromium"),
      import("playwright-core"),
    ]);
    browser = await pw.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    const page = await browser.newPage({ userAgent: UA });
    const url = "https://" + domain.replace(/^https?:\/\//, "");
    await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });
    const html = await page.content();
    const finalUrl = page.url();
    await browser.close();
    return { ok: true, finalUrl, html, tier: "chromium" };
  } catch (e) {
    if (browser) try { await browser.close(); } catch {}
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

// ---------------------------------------------------------------------------
// Deterministic extraction
// ---------------------------------------------------------------------------

function absolutize(base, href) {
  try { return new URL(href, base).href; } catch { return href; }
}

// Flatten a JSON-LD document (handles @graph and arrays) into a list of nodes.
function flattenLd(node, out) {
  if (!node) return;
  if (Array.isArray(node)) { node.forEach((n) => flattenLd(n, out)); return; }
  if (typeof node !== "object") return;
  if (Array.isArray(node["@graph"])) flattenLd(node["@graph"], out);
  out.push(node);
}

function ldType(node) {
  const t = node["@type"];
  return Array.isArray(t) ? t.map((x) => String(x)) : t ? [String(t)] : [];
}

const ORG_TYPES = /Organization|LocalBusiness|Store|Restaurant|Dentist|Attorney|LegalService|MedicalBusiness|HomeAndConstructionBusiness|ProfessionalService|Church/i;

function firstLogoFromLd(nodes, base) {
  for (const n of nodes) {
    if (!ldType(n).some((t) => ORG_TYPES.test(t))) continue;
    const logo = n.logo || n.image;
    const url = typeof logo === "string" ? logo : logo && logo.url;
    if (url) return absolutize(base, url);
  }
  return "";
}

// Ordered logo candidates, most-authoritative first.
function logoCandidates($, base, ldNodes) {
  const out = [];
  const push = (why, u) => {
    if (!u || /^data:/i.test(u.trim())) return; // skip inline data-URI lazy-load spacers
    out.push({ why, url: absolutize(base, u) });
  };

  push("json-ld", firstLogoFromLd(ldNodes, base));

  // header/nav <img> whose alt/class/src mentions "logo"
  $("header img, nav img, .header img, #header img, img").each((_, el) => {
    const a = el.attribs || {};
    const src = a.src || a["data-src"] || a["data-lazy-src"] || "";
    const blob = `${a.alt || ""} ${a.class || ""} ${a.id || ""} ${src}`.toLowerCase();
    if (src && blob.includes("logo")) push("img-logo", src);
  });

  $('meta[property="og:image"], meta[name="og:image"], meta[property="og:image:secure_url"], meta[name="twitter:image"]').each((_, el) => {
    push("og-image", (el.attribs || {}).content);
  });
  $('link[rel~="apple-touch-icon"]').each((_, el) => push("apple-touch-icon", (el.attribs || {}).href));
  $('link[rel~="icon"], link[rel="shortcut icon"]').each((_, el) => push("favicon", (el.attribs || {}).href));

  const seen = new Set();
  return out.filter((c) => c.url && !seen.has(c.url) && seen.add(c.url)).slice(0, 6);
}

// Brand-colour signals: theme-color meta wins; then most-frequent non-neutral
// hex colours in the source. Final palette is refined client-side (canvas
// quantisation of the logo) in the review UI.
function colorSignals(html, themeColor) {
  const counts = new Map();
  const bump = (hex, w) => {
    const h = hex.toLowerCase();
    if (["#fff", "#ffffff", "#000", "#000000"].includes(h)) return;
    counts.set(h, (counts.get(h) || 0) + w);
  };
  if (themeColor) bump(themeColor.trim(), 500);
  (html.match(/#[0-9a-fA-F]{6}\b/g) || []).forEach((h) => bump(h, 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([h]) => h);
}

function visibleText($) {
  $("script, style, noscript, svg").remove();
  return $("body").text().replace(/\s+/g, " ").trim().slice(0, 14000);
}

function metaVal($, ...keys) {
  for (const k of keys) {
    const v = $(`meta[property="${k}"], meta[name="${k}"]`).attr("content");
    if (v) return v.trim();
  }
  return "";
}

// Pull the useful structured bits out of an Organization/LocalBusiness node.
function orgFacts(nodes) {
  const org = nodes.find((n) => ldType(n).some((t) => ORG_TYPES.test(t)));
  if (!org) return {};
  const addr = org.address || {};
  const geo = [addr.addressLocality, addr.addressRegion].filter(Boolean).join(", ");
  const tel = org.telephone || addr.telephone || "";
  const rating = org.aggregateRating || {};
  return {
    ld_name: org.name || "",
    ld_type: ldType(org).join(", "),
    ld_location: geo,
    ld_phone: typeof tel === "string" ? tel : "",
    ld_email: org.email || "",
    ld_social: Array.isArray(org.sameAs) ? org.sameAs : [],
    ld_rating: rating.ratingValue ? { value: rating.ratingValue, count: rating.reviewCount } : null,
  };
}

// The old site's primary navigation — the "key tabs" to mirror in the rebuild.
const NAV_SKIP = /^(home|search|menu|toggle navigation|skip to (main )?content|»|›|‹|\.\.\.)$/i;
function navTabs($, base) {
  const out = [];
  const seen = new Set();
  let host = "";
  try { host = new URL(base).host; } catch {}
  $("header nav a, nav a, header a, .nav a, #nav a, .menu a, .navbar a, .navigation a").each((_, el) => {
    if (out.length >= 10) return;
    const a = el.attribs || {};
    const href = a.href || "";
    const label = $(el).text().replace(/\s+/g, " ").trim();
    if (!label || label.length > 28 || NAV_SKIP.test(label)) return;
    if (/^(tel:|mailto:|javascript:|#)/i.test(href)) return;
    let abs;
    try { abs = new URL(href, base); } catch { return; }
    if (host && abs.host !== host) return; // internal links only
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label, href: abs.href });
  });
  return out;
}

// Candidate mottos / key phrases — hero headings, tagline/slogan elements.
function heroPhrases($) {
  const out = [];
  const seen = new Set();
  const add = (t) => {
    const s = (t || "").replace(/\s+/g, " ").trim();
    if (s.length >= 8 && s.length <= 120 && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); out.push(s); }
  };
  $("h1").slice(0, 2).each((_, el) => add($(el).text()));
  $("[class]").each((_, el) => {
    if (out.length >= 8) return;
    const c = (el.attribs.class || "").toLowerCase();
    if (/tagline|slogan|motto|subtitle|hero__|lead-text/.test(c)) add($(el).text());
  });
  $("h2").slice(0, 3).each((_, el) => add($(el).text()));
  return out.slice(0, 8);
}

// Officers / team from JSON-LD Person nodes (name, title, headshot).
function peopleFromLd(nodes, base) {
  const out = [];
  const seen = new Set();
  nodes.forEach((n) => {
    if (!ldType(n).some((t) => /Person/i.test(t))) return;
    const name = (typeof n.name === "string" ? n.name : "").trim();
    if (!name || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    const img = typeof n.image === "string" ? n.image : (n.image && n.image.url) || "";
    const title = typeof n.jobTitle === "string" ? n.jobTitle : (typeof n.description === "string" ? n.description : "");
    out.push({ name, title, headshot: img ? absolutize(base, img) : "" });
  });
  return out.slice(0, 12);
}

// Turn raw HTML into the deterministic signal bundle.
export function extractSignals(html, finalUrl) {
  const $ = cheerio.load(html);
  const themeColor = $('meta[name="theme-color"]').attr("content") || "";

  const ldNodes = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try { flattenLd(JSON.parse(raw), ldNodes); } catch {}
  });

  const logos = logoCandidates($, finalUrl, ldNodes);
  const nav_tabs = navTabs($, finalUrl);
  const hero_phrases = heroPhrases($);
  const people = peopleFromLd(ldNodes, finalUrl);
  const text = visibleText($); // NB: mutates $ (strips script/style) — do DOM work above this

  return {
    finalUrl,
    title: $("title").first().text().trim(),
    og_site_name: metaVal($, "og:site_name"),
    og_title: metaVal($, "og:title"),
    description: metaVal($, "description", "og:description"),
    theme_color: themeColor,
    ...orgFacts(ldNodes),
    logo_candidates: logos,
    color_signals: colorSignals(html, themeColor),
    nav_tabs,
    hero_phrases,
    people,
    js_shell: text.length < 400,
    visible_text: text,
  };
}

// ---------------------------------------------------------------------------
// Claude normalisation (enhancer — skipped gracefully if no API key)
// ---------------------------------------------------------------------------

// Mirrors data/prospects.json. Structured-output schema: no length/number
// constraints, additionalProperties:false on every object.
const PROFILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["business_name", "category", "services"],
  properties: {
    business_name: { type: "string" },
    category: { type: "string", description: "e.g. 'Dental practice', 'Business law firm', 'Jewelry store'" },
    tagline: { type: "string", description: "their positioning in their own words" },
    services: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name"],
        properties: { name: { type: "string" }, blurb: { type: "string" } },
      },
      description: "4-8 REAL services/practice areas with a short plain-language blurb each",
    },
    serves: { type: "string", description: "who and where they serve" },
    location: { type: "string", description: "city, state" },
    owner: { type: "string", description: "owner/principal/lead person if shown, else empty" },
    phone: { type: "string" },
    email: { type: "string" },
    differentiators: { type: "array", items: { type: "string" }, description: "2-4 genuine, specific differentiators" },
    motto: { type: "string", description: "the single best short slogan/tagline in their own words, if any (else empty)" },
    key_phrases: { type: "array", items: { type: "string" }, description: "3-6 distinctive phrases or value-props they actually use on the site" },
    notes: { type: "string" },
  },
};

export function llmAvailable() {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function normalizeWithClaude(signals) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, skipped: true, reason: "ANTHROPIC_API_KEY not set" };

  const prompt =
    `You are extracting an ACCURATE business profile from a prospect's real website, so we can rebuild ` +
    `their site with faithful content. Use ONLY the evidence below — do not invent services or facts. ` +
    `If something is not present, leave it empty.\n\n` +
    `URL: ${signals.finalUrl}\n` +
    `<title>: ${signals.title}\n` +
    `og:site_name: ${signals.og_site_name}\n` +
    `meta description: ${signals.description}\n` +
    `Structured-data name: ${signals.ld_name || ""}\n` +
    `Structured-data type: ${signals.ld_type || ""}\n` +
    `Structured-data location: ${signals.ld_location || ""}\n` +
    `Structured-data phone: ${signals.ld_phone || ""}\n` +
    `Structured-data email: ${signals.ld_email || ""}\n` +
    `Social profiles: ${(signals.ld_social || []).join(", ")}\n` +
    `Hero / headline phrases seen on the page: ${(signals.hero_phrases || []).map((p) => `"${p}"`).join(" | ")}\n\n` +
    `Visible page text (truncated):\n"""${signals.visible_text}"""\n\n` +
    `Return the clean profile object. Prefer structured-data values for name/phone/location when present. ` +
    `For "motto" pick the single best real slogan/tagline (from the hero phrases or text) — or leave empty. ` +
    `For "key_phrases" list 3-6 distinctive phrases/value-props they actually use.`;

  const body = {
    model: "claude-opus-4-8",
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: PROFILE_SCHEMA } },
    messages: [{ role: "user", content: prompt }],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, error: `Anthropic ${res.status}: ${detail.slice(0, 400)}` };
  }
  const data = await res.json();
  if (data.stop_reason === "refusal") return { ok: false, error: "model refused" };
  const textBlock = (data.content || []).find((b) => b.type === "text");
  if (!textBlock) return { ok: false, error: "no text block in response" };
  try {
    return { ok: true, profile: JSON.parse(textBlock.text) };
  } catch {
    return { ok: false, error: "could not parse profile JSON" };
  }
}
