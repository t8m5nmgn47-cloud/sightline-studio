// Independent public social-profile discovery through Brave Web Search API.

import { normDomain } from "./_audit.js";
import { normalizePublicUrl, platformFromUrl, sourceKey, stableHash } from "./_signals.js";

const TIMEOUT_MS = 10_000;
const SOCIAL_PLATFORMS = [
  { platform: "linkedin", site: "linkedin.com/company" },
  { platform: "facebook", site: "facebook.com" },
  { platform: "instagram", site: "instagram.com" },
  { platform: "youtube", site: "youtube.com" },
];
const NAME_STOPWORDS = new Set(["and", "the", "of", "a", "an", "llc", "inc", "ltd", "company", "co", "pllc", "pc"]);

function bounded(value, max = 1000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function tokenSet(value) {
  return new Set(String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !NAME_STOPWORDS.has(token)));
}

function overlapScore(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / Math.max(1, Math.min(left.size, right.size));
}

function baseBrand(domain) {
  return normDomain(domain).replace(/^www\./, "").split(".")[0] || "";
}

async function fetchJson(url, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), options.timeout || TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: ctrl.signal });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    if (!response.ok) {
      const message = data?.error?.message || data?.message || text || `HTTP ${response.status}`;
      throw new Error(`${response.status}: ${bounded(message, 500)}`);
    }
    return data || {};
  } finally {
    clearTimeout(timer);
  }
}

function sourceWithKey(source) {
  return { ...source, source_key: sourceKey(source) };
}

function snapshot(source, signalKey, observedAt, value, dimensions = {}, provenance = {}) {
  const numeric = typeof value === "number" && Number.isFinite(value);
  const valueNumeric = numeric ? value : null;
  const valueText = numeric || value == null ? null : bounded(value, 12_000);
  const day = String(observedAt).slice(0, 10);
  return {
    snapshot_key: stableHash([source.source_key, signalKey, valueNumeric ?? "", valueText ?? "", day].join("|")),
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

export function scoreSocialSearchResult(result = {}, { domain = "", name = "", platform = "" } = {}) {
  const url = normalizePublicUrl(result?.url || "");
  if (!url || platformFromUrl(url) !== platform) return 0;
  let path = "";
  try { path = new URL(url).pathname.toLowerCase(); } catch {}
  if (/\/(share|sharer|login|feed|posts?|watch)(\/|$)/.test(path)) return 0;

  const title = bounded(result?.title, 500);
  const description = bounded(result?.description, 1500);
  const haystack = `${title} ${description} ${url}`.toLowerCase();
  const overlap = overlapScore(`${title} ${description}`, name);
  let score = Math.min(0.58, overlap * 0.58);
  const normalizedName = bounded(name).toLowerCase();
  if (normalizedName && title.toLowerCase().includes(normalizedName)) score += 0.16;
  const brand = baseBrand(domain);
  if (brand && haystack.replace(/[^a-z0-9]/g, "").includes(brand.replace(/[^a-z0-9]/g, ""))) score += 0.14;
  if (domain && haystack.includes(normDomain(domain).replace(/^www\./, ""))) score += 0.08;
  score += 0.04;
  return Math.min(1, Number(score.toFixed(3)));
}

function socialHandle(platform, url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    if (!parts.length) return null;
    if (platform === "linkedin" && ["company", "in"].includes(parts[0])) return parts[1] || null;
    if (platform === "youtube" && parts[0]?.startsWith("@")) return parts[0];
    return parts[0] || null;
  } catch { return null; }
}

export async function collectBraveSocialDiscovery({
  entityKey,
  entityName,
  relationship = "owned",
  observedAt = new Date().toISOString(),
  existingPlatforms = [],
} = {}) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY || "";
  const domain = normDomain(entityKey || "");
  const name = bounded(entityName || domain, 300);
  if (!apiKey) return { sources: [], snapshots: [], items: [], errors: [], warnings: [], provider: { key: "brave_social_search", status: "unconfigured" } };

  const existing = new Set(existingPlatforms || []);
  const sources = [];
  const snapshots = [];
  const errors = [];
  const warnings = [];
  const discoveredUrls = new Set();
  let queriesRun = 0;

  for (const spec of SOCIAL_PLATFORMS.filter((item) => !existing.has(item.platform)).slice(0, 4)) {
    const query = `"${name}" site:${spec.site}`;
    const querySource = sourceWithKey({
      entity_key: domain,
      entity_name: name,
      source_type: "search_query",
      platform: "brave_search",
      source_url: "",
      external_id: stableHash(query),
      handle: null,
      relationship,
      status: "active",
      match_confidence: 1,
      metadata: { provider: "brave_web_search_api", query, searched_platform: spec.platform, match_method: "independent_search" },
    });
    sources.push(querySource);
    try {
      const endpoint = new URL("https://api.search.brave.com/res/v1/web/search");
      endpoint.searchParams.set("q", query);
      endpoint.searchParams.set("count", "5");
      endpoint.searchParams.set("search_lang", "en");
      endpoint.searchParams.set("safesearch", "moderate");
      const data = await fetchJson(endpoint.toString(), {
        headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
      });
      queriesRun += 1;
      const results = Array.isArray(data?.web?.results) ? data.web.results : [];
      snapshots.push(snapshot(querySource, "search_result_count", observedAt, results.length, { searched_platform: spec.platform }, { provider: "brave_web_search_api", query }));
      const ranked = results
        .map((result) => ({ result, score: scoreSocialSearchResult(result, { domain, name, platform: spec.platform }) }))
        .filter((entry) => entry.score >= 0.68)
        .sort((a, b) => b.score - a.score);
      const best = ranked[0];
      snapshots.push(snapshot(querySource, "social_candidates_discovered", observedAt, ranked.length, { searched_platform: spec.platform }, { provider: "brave_web_search_api", query }));
      if (!best) continue;
      const url = normalizePublicUrl(best.result.url || "");
      if (!url || discoveredUrls.has(url)) continue;
      discoveredUrls.add(url);
      sources.push(sourceWithKey({
        entity_key: domain,
        entity_name: name,
        source_type: "social_profile",
        platform: spec.platform,
        source_url: url,
        external_id: socialHandle(spec.platform, url) || url,
        handle: socialHandle(spec.platform, url),
        relationship,
        status: "discovered",
        match_confidence: best.score,
        metadata: {
          provider: "brave_web_search_api",
          match_method: "independent_search",
          search_query: query,
          result_title: bounded(best.result.title, 500),
          result_description: bounded(best.result.description, 1500),
          caveat: "high-confidence public search candidate; verify before treating as an official account",
        },
      }));
    } catch (error) {
      errors.push(`Brave social search (${spec.platform}): ${bounded(error?.message || error, 500)}`);
    }
  }

  if (!discoveredUrls.size && queriesRun) warnings.push(`No high-confidence independent social profiles were found for ${domain}.`);
  return {
    sources, snapshots, items: [], errors, warnings,
    provider: { key: "brave_social_search", status: errors.length && !queriesRun ? "error" : "active", queries_run: queriesRun, profiles_discovered: discoveredUrls.size },
  };
}
