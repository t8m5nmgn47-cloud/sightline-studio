// Sightline Signal Network — public evidence collection helpers.
// Conservative by design: public hosts only, bounded crawl size, robots-aware
// website collection, and no bypass of login walls, CAPTCHAs or access controls.

import { createHash } from "crypto";
import * as cheerio from "cheerio";
import { isPublicHost, normDomain } from "./_audit.js";

const UA = "Mozilla/5.0 (compatible; SightlineSignal/1.0; +https://sightline-studio.vercel.app/)";
const TIMEOUT_MS = 10_000;
const MAX_TEXT_BYTES = 1_500_000;
const MAX_PAGES_DEFAULT = 8;

const SOCIAL_HOSTS = [
  ["instagram", /(^|\.)instagram\.com$/i],
  ["facebook", /(^|\.)facebook\.com$/i],
  ["youtube", /(^|\.)youtube\.com$/i],
  ["tiktok", /(^|\.)tiktok\.com$/i],
  ["linkedin", /(^|\.)linkedin\.com$/i],
  ["twitter", /(^|\.)(x|twitter)\.com$/i],
  ["pinterest", /(^|\.)pinterest\.com$/i],
  ["yelp", /(^|\.)yelp\.com$/i],
];

export function stableHash(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

export function sourceKey({ entity_key, source_type, platform = "", source_url = "", external_id = "" }) {
  return stableHash([normDomain(entity_key), source_type, platform, source_url, external_id].join("|"));
}

function boundedText(value, max = 12_000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function countValue(raw, suffix = "") {
  const n = Number(String(raw || "").replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[String(suffix || "").toLowerCase()] || 1;
  return Math.round(n * mult);
}

export function parseVisibleCounts(text = "") {
  const out = {};
  const pattern = /([\d,.]+)\s*([kmb])?\s+(followers?|subscribers?|posts?|videos?|views?)/gi;
  for (const match of String(text).matchAll(pattern)) {
    const value = countValue(match[1], match[2]);
    if (value == null) continue;
    const rawLabel = match[3].toLowerCase();
    const key = rawLabel.startsWith("follower") ? "followers"
      : rawLabel.startsWith("subscriber") ? "subscribers"
      : rawLabel.startsWith("post") ? "posts"
      : rawLabel.startsWith("video") ? "videos"
      : "views";
    if (out[key] == null || value > out[key]) out[key] = value;
  }
  return out;
}

export function platformFromUrl(input) {
  try {
    const host = new URL(input).hostname.toLowerCase().replace(/^www\./, "");
    return SOCIAL_HOSTS.find(([, re]) => re.test(host))?.[0] || "";
  } catch {
    return "";
  }
}

export function normalizePublicUrl(input, baseUrl = null) {
  try {
    const u = baseUrl ? new URL(input, baseUrl) : new URL(input);
    if (!/^https?:$/.test(u.protocol)) return "";
    u.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"].forEach((key) => u.searchParams.delete(key));
    if (!u.searchParams.size) u.search = "";
    return u.toString();
  } catch {
    return "";
  }
}

function socialHandle(platform, url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    if (!parts.length) return null;
    if (platform === "youtube" && parts[0]?.startsWith("@")) return parts[0];
    if (platform === "linkedin" && ["company", "in"].includes(parts[0])) return parts[1] || null;
    if (platform === "facebook" && ["share", "sharer", "dialog"].includes(parts[0])) return null;
    return parts[0] || null;
  } catch {
    return null;
  }
}

function detectTechnologies(html = "") {
  const tests = [
    ["wordpress", /wp-content|wp-includes|wordpress/i],
    ["wix", /wixstatic|wix\.com/i],
    ["squarespace", /static1\.squarespace|squarespace-cdn/i],
    ["shopify", /cdn\.shopify|shopify-section/i],
    ["webflow", /webflow\.com|data-wf-page/i],
    ["google_tag_manager", /googletagmanager\.com/i],
    ["google_analytics", /google-analytics\.com|gtag\(/i],
    ["meta_pixel", /connect\.facebook\.net\/.*fbevents/i],
    ["hubspot", /js\.hs-scripts\.com|hubspot/i],
    ["calendly", /calendly\.com/i],
    ["acuity", /acuityscheduling\.com/i],
    ["mindbody", /mindbodyonline\.com/i],
    ["toast", /toasttab\.com/i],
  ];
  return tests.filter(([, re]) => re.test(html)).map(([name]) => name);
}

function schemaTypes($) {
  const types = new Set();
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const visit = (node) => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) return node.forEach(visit);
        const type = node["@type"];
        if (Array.isArray(type)) type.forEach((v) => types.add(String(v)));
        else if (type) types.add(String(type));
        Object.values(node).forEach(visit);
      };
      visit(data);
    } catch {}
  });
  return [...types].slice(0, 40);
}

export function analyzePublicPage(html = "", pageUrl = "") {
  const $ = cheerio.load(html || "");
  const socialMap = new Map();
  const links = new Set();
  $("a[href]").each((_, el) => {
    const href = normalizePublicUrl($(el).attr("href"), pageUrl);
    if (!href) return;
    links.add(href);
    const platform = platformFromUrl(href);
    if (platform && !socialMap.has(href)) socialMap.set(href, { platform, url: href, handle: socialHandle(platform, href) });
  });
  const ctas = [];
  $('a[href],button').each((_, el) => {
    const text = boundedText($(el).text(), 100);
    if (text && /book|schedule|contact|call|quote|estimate|consult|start|get started|reserve|buy|shop|apply/i.test(text)) ctas.push(text);
  });
  const canonical = normalizePublicUrl($('link[rel="canonical"]').attr("href") || "", pageUrl) || pageUrl;
  const bodyText = boundedText($("body").text(), 60_000);
  return {
    url: pageUrl,
    canonical_url: canonical,
    title: boundedText($("title").first().text(), 500),
    description: boundedText($('meta[name="description"]').attr("content") || $('meta[property="og:description"]').attr("content"), 1000),
    h1: $("h1").map((_, el) => boundedText($(el).text(), 500)).get().filter(Boolean).slice(0, 10),
    word_count: bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0,
    form_count: $("form").length,
    ctas: [...new Set(ctas)].slice(0, 25),
    schema_types: schemaTypes($),
    technologies: detectTechnologies(html),
    socials: [...socialMap.values()].slice(0, 30),
    links: [...links].slice(0, 500),
    content_hash: stableHash([boundedText($("title").text(), 1000), boundedText($("body").text(), 100_000)].join("|")),
  };
}

function parseRobots(text = "") {
  const sitemapUrls = [];
  const disallow = [];
  let applies = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (key === "sitemap" && value) sitemapUrls.push(value);
    if (key === "user-agent") applies = value === "*" || /sightlinesignal/i.test(value);
    if (key === "disallow" && applies && value) disallow.push(value);
  }
  return { sitemapUrls, disallow };
}

function pathAllowed(url, robots) {
  try {
    const path = new URL(url).pathname || "/";
    return !(robots?.disallow || []).some((rule) => rule === "/" || (rule && path.startsWith(rule)));
  } catch {
    return false;
  }
}

async function safeFetch(url, { timeout = TIMEOUT_MS, accept = "text/html,*/*;q=0.8" } = {}) {
  let current = new URL(url);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const domain = normDomain(current.hostname);
    if (!(await isPublicHost(domain))) throw new Error(`blocked non-public host: ${domain || "unknown"}`);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const response = await fetch(current, {
        redirect: "manual",
        signal: ctrl.signal,
        headers: { "User-Agent": UA, Accept: accept },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return { response, url: current.toString(), text: "" };
        current = new URL(location, current);
        continue;
      }
      const type = response.headers.get("content-type") || "";
      const text = /text|xml|json|javascript/i.test(type) ? (await response.text()).slice(0, MAX_TEXT_BYTES) : "";
      return { response, url: current.toString(), text };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("too many redirects");
}

async function sitemapUrls(domain, robots) {
  const candidates = [...(robots?.sitemapUrls || []), `https://${domain}/sitemap.xml`];
  const urls = new Set();
  for (const candidate of [...new Set(candidates)].slice(0, 3)) {
    try {
      const result = await safeFetch(candidate, { accept: "application/xml,text/xml,text/plain,*/*;q=0.5" });
      if (!result.response.ok) continue;
      const $ = cheerio.load(result.text, { xmlMode: true });
      $("loc").each((_, el) => {
        const value = normalizePublicUrl($(el).text().trim());
        if (!value) return;
        try { if (normDomain(new URL(value).hostname) === normDomain(domain)) urls.add(value); } catch {}
      });
    } catch {}
    if (urls.size) break;
  }
  return [...urls];
}

async function mapLimit(values, limit, fn) {
  const queue = [...values];
  const out = [];
  const workers = Array.from({ length: Math.max(1, Math.min(limit, queue.length || 1)) }, async () => {
    while (queue.length) {
      const value = queue.shift();
      try { out.push(await fn(value)); } catch (error) { out.push({ error: String(error?.message || error), input: value }); }
    }
  });
  await Promise.all(workers);
  return out;
}

function websiteSource(entityKey, finalUrl, relationship, entityName) {
  const source = {
    entity_key: entityKey,
    entity_name: entityName || entityKey,
    source_type: "website",
    platform: "web",
    source_url: finalUrl,
    external_id: entityKey,
    handle: null,
    relationship,
    status: "active",
    match_confidence: 1,
    metadata: {},
  };
  return { ...source, source_key: sourceKey(source) };
}

function socialSource(entityKey, profile, relationship, entityName, discoveredOn) {
  const source = {
    entity_key: entityKey,
    entity_name: entityName || entityKey,
    source_type: "social_profile",
    platform: profile.platform,
    source_url: profile.url,
    external_id: profile.handle || profile.url,
    handle: profile.handle,
    relationship,
    status: "discovered",
    match_confidence: 0.98,
    metadata: { match_method: "website_link", discovered_on: discoveredOn },
  };
  return { ...source, source_key: sourceKey(source) };
}

function snapshot(source, signalKey, observedAt, value, dimensions = {}, provenance = {}) {
  const numeric = typeof value === "number" && Number.isFinite(value);
  const valueText = numeric || value == null ? null : String(value);
  const valueNumeric = numeric ? value : null;
  const day = String(observedAt).slice(0, 10);
  const identity = [source.source_key, signalKey, valueNumeric ?? "", valueText ?? "", day].join("|");
  return {
    snapshot_key: stableHash(identity),
    source_key: source.source_key,
    entity_key: source.entity_key,
    signal_key: signalKey,
    value_numeric: valueNumeric,
    value_text: valueText,
    observed_at: observedAt,
    dimensions,
    provenance,
  };
}

async function publicSocialMetadata(source, observedAt) {
  const snapshots = [];
  try {
    const result = await safeFetch(source.source_url);
    const type = result.response.headers.get("content-type") || "";
    if (!result.response.ok || !/html|text/i.test(type)) {
      return { source: { ...source, status: result.response.status === 401 || result.response.status === 403 ? "blocked" : "error", metadata: { ...source.metadata, http_status: result.response.status } }, snapshots };
    }
    const $ = cheerio.load(result.text || "");
    const title = boundedText($('meta[property="og:title"]').attr("content") || $("title").first().text(), 500);
    const description = boundedText($('meta[property="og:description"]').attr("content") || $('meta[name="description"]').attr("content"), 1500);
    if (title) snapshots.push(snapshot(source, "profile_title", observedAt, title, {}, { method: "public_html_metadata" }));
    if (description) snapshots.push(snapshot(source, "profile_description", observedAt, description, {}, { method: "public_html_metadata" }));
    const counts = parseVisibleCounts(`${title} ${description}`);
    Object.entries(counts).forEach(([key, value]) => snapshots.push(snapshot(source, `visible_${key}`, observedAt, value, {}, { method: "public_html_metadata", caveat: "visible public profile metadata" })));
    return { source: { ...source, status: "active", source_url: result.url, metadata: { ...source.metadata, http_status: result.response.status } }, snapshots };
  } catch (error) {
    return { source: { ...source, status: "error", metadata: { ...source.metadata, error: String(error?.message || error).slice(0, 500) } }, snapshots };
  }
}

async function youtubeApiMetadata(source, observedAt, apiKey) {
  if (!apiKey || source.platform !== "youtube") return null;
  try {
    const u = new URL(source.source_url);
    const parts = u.pathname.split("/").filter(Boolean);
    let filter = "";
    if (parts[0]?.startsWith("@")) filter = `forHandle=${encodeURIComponent(parts[0].slice(1))}`;
    else if (parts[0] === "channel" && parts[1]) filter = `id=${encodeURIComponent(parts[1])}`;
    if (!filter) return null;
    const endpoint = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&${filter}&key=${encodeURIComponent(apiKey)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, { signal: ctrl.signal, headers: { "User-Agent": UA } });
      if (!response.ok) return null;
      const data = await response.json();
      const item = data?.items?.[0];
      if (!item) return null;
      const stats = item.statistics || {};
      const snapshots = [
        snapshot(source, "profile_title", observedAt, item.snippet?.title || "", {}, { method: "youtube_data_api_v3" }),
        snapshot(source, "visible_subscribers", observedAt, Number(stats.subscriberCount), {}, { method: "youtube_data_api_v3" }),
        snapshot(source, "visible_videos", observedAt, Number(stats.videoCount), {}, { method: "youtube_data_api_v3" }),
        snapshot(source, "visible_views", observedAt, Number(stats.viewCount), {}, { method: "youtube_data_api_v3" }),
      ].filter((row) => row.value_text || Number.isFinite(row.value_numeric));
      return { source: { ...source, status: "active", external_id: item.id, metadata: { ...source.metadata, collector: "youtube_data_api_v3" } }, snapshots };
    } finally { clearTimeout(timer); }
  } catch { return null; }
}

export async function collectDeepPublicSignals(input, options = {}) {
  const entityKey = normDomain(input);
  const relationship = ["owned", "peer", "market"].includes(options.relationship) ? options.relationship : "owned";
  const entityName = options.entityName || entityKey;
  const maxPages = Math.max(1, Math.min(20, Number(options.maxPages) || MAX_PAGES_DEFAULT));
  const collectedAt = options.observedAt || new Date().toISOString();
  const errors = [];

  if (!(await isPublicHost(entityKey))) {
    return { entity_key: entityKey, entity_name: entityName, relationship, collected_at: collectedAt, sources: [], snapshots: [], items: [], errors: ["Domain is not a reachable public host."], summary: { pages: 0, social_profiles: 0 } };
  }

  let robots = { sitemapUrls: [], disallow: [] };
  try {
    const result = await safeFetch(`https://${entityKey}/robots.txt`, { accept: "text/plain,*/*;q=0.5" });
    if (result.response.ok) robots = parseRobots(result.text);
  } catch (error) { errors.push(`robots: ${String(error?.message || error)}`); }

  if (!pathAllowed(`https://${entityKey}/`, robots)) {
    return { entity_key: entityKey, entity_name: entityName, relationship, collected_at: collectedAt, sources: [], snapshots: [], items: [], errors: ["robots.txt disallows collection of the site root."], summary: { pages: 0, social_profiles: 0, robots_blocked: true } };
  }

  let homepage;
  try { homepage = await safeFetch(`https://${entityKey}/`); }
  catch (error) {
    return { entity_key: entityKey, entity_name: entityName, relationship, collected_at: collectedAt, sources: [], snapshots: [], items: [], errors: [`homepage: ${String(error?.message || error)}`], summary: { pages: 0, social_profiles: 0 } };
  }

  const finalDomain = normDomain(new URL(homepage.url).hostname);
  const siteSource = websiteSource(entityKey, homepage.url, relationship, entityName);
  const discovered = await sitemapUrls(finalDomain, robots);
  const pageUrls = [...new Set([homepage.url, ...discovered.filter((url) => pathAllowed(url, robots))])].slice(0, maxPages);
  const pageResults = await mapLimit(pageUrls, 3, async (url) => {
    if (url === homepage.url) return { url: homepage.url, html: homepage.text, status: homepage.response.status };
    const result = await safeFetch(url);
    return { url: result.url, html: result.text, status: result.response.status };
  });

  const pages = [];
  for (const result of pageResults) {
    if (result?.error) { errors.push(`page ${result.input}: ${result.error}`); continue; }
    if (!result?.html) continue;
    pages.push(analyzePublicPage(result.html, result.url));
  }

  const sources = [siteSource];
  const snapshots = [
    snapshot(siteSource, "pages_collected", collectedAt, pages.length, {}, { collector: "website_crawl_v1" }),
    snapshot(siteSource, "forms_detected", collectedAt, pages.reduce((sum, page) => sum + page.form_count, 0), {}, { collector: "website_crawl_v1" }),
    snapshot(siteSource, "ctas_detected", collectedAt, pages.reduce((sum, page) => sum + page.ctas.length, 0), {}, { collector: "website_crawl_v1" }),
  ];

  const allTechnologies = [...new Set(pages.flatMap((page) => page.technologies))];
  snapshots.push(snapshot(siteSource, "technology_stack", collectedAt, allTechnologies.join(", "), {}, { collector: "website_crawl_v1" }));

  const items = pages.map((page) => ({
    item_key: stableHash(`${siteSource.source_key}|web_page|${page.canonical_url || page.url}`),
    source_key: siteSource.source_key,
    entity_key: entityKey,
    item_type: "web_page",
    external_id: page.canonical_url || page.url,
    item_url: page.url,
    published_at: null,
    title: page.title || null,
    body_text: page.description || null,
    media_type: "text/html",
    metrics: { word_count: page.word_count, form_count: page.form_count, cta_count: page.ctas.length },
    classifications: { schema_types: page.schema_types, technologies: page.technologies },
    metadata: { canonical_url: page.canonical_url, h1: page.h1, ctas: page.ctas },
    content_hash: page.content_hash,
  }));

  const socialByUrl = new Map();
  for (const page of pages) {
    for (const profile of page.socials) {
      const normalized = normalizePublicUrl(profile.url);
      if (!normalized || socialByUrl.has(normalized)) continue;
      socialByUrl.set(normalized, socialSource(entityKey, { ...profile, url: normalized }, relationship, entityName, page.url));
    }
  }

  const socialResults = await mapLimit([...socialByUrl.values()].slice(0, 12), 3, async (source) => {
    const official = await youtubeApiMetadata(source, collectedAt, process.env.YOUTUBE_API_KEY);
    return official || publicSocialMetadata(source, collectedAt);
  });
  for (const result of socialResults) {
    if (result?.error) { errors.push(`social ${result.input?.source_url || "unknown"}: ${result.error}`); continue; }
    if (!result?.source) continue;
    const source = { ...result.source, source_key: sourceKey(result.source) };
    sources.push(source);
    for (const row of result.snapshots || []) snapshots.push({ ...row, source_key: source.source_key });
  }

  snapshots.push(snapshot(siteSource, "social_profiles_discovered", collectedAt, sources.filter((source) => source.source_type === "social_profile").length, {}, { collector: "website_crawl_v1" }));

  return {
    entity_key: entityKey,
    entity_name: entityName,
    relationship,
    collected_at: collectedAt,
    sources,
    snapshots,
    items,
    errors,
    summary: {
      pages: pages.length,
      social_profiles: sources.filter((source) => source.source_type === "social_profile").length,
      snapshots: snapshots.length,
      items: items.length,
      technologies: allTechnologies,
    },
  };
}
