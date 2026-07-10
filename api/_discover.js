// Local competitor discovery — finds genuinely-nearby, same-category businesses
// that have a website, using OpenStreetMap (Nominatim geocode + Overpass POIs).
// Keyless. Files in /api starting with "_" are NOT routed by Vercel.

import { normDomain } from "./_audit.js";
import { scorePeer } from "./_peer_quality.js";

const UA = "SightlineStudio/1.0 (+https://sightline-studio.vercel.app; kris.emery@brains-and-motion.com)";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OVERPASS = "https://overpass-api.de/api/interpreter";

// Prospect category -> OSM tag filters (key/value). First matching rule wins.
const RULES = [
  [/dental|dentist|orthodont|endodont/i, [["amenity", "dentist"]]],
  [/optometr|eye ?care|vision|optician/i, [["shop", "optician"], ["healthcare", "optometrist"]]],
  [/dermatolog|obstetr|gyn|ob-?gyn|otolaryng|\bent\b|allerg|family medicine|primary care|midwif|physician|medical|clinic/i, [["amenity", "doctors"], ["amenity", "clinic"], ["healthcare", "doctor"]]],
  [/med ?spa|medspa|aesthetic|skin care|day spa/i, [["shop", "beauty"], ["leisure", "spa"], ["amenity", "spa"]]],
  [/law|attorney|legal|litigation|counsel/i, [["office", "lawyer"]]],
  [/church|parish|congregation|worship|faith|catholic|lutheran|methodist|gospel|christ/i, [["amenity", "place_of_worship"]]],
  [/insurance/i, [["office", "insurance"]]],
  [/mortgage|lend|home loan/i, [["office", "financial"], ["office", "financial_advisor"]]],
  [/wealth|financial|advisor|advisory|invest|registered investment/i, [["office", "financial_advisor"], ["office", "financial"]]],
  [/accountant|accounting|\bcpa\b|\btax\b/i, [["office", "accountant"]]],
  [/title|escrow|settlement|closing/i, [["office", "estate_agent"], ["office", "notary"], ["office", "financial"]]],
  [/jewel/i, [["shop", "jewelry"]]],
  [/landscap|lawn|garden/i, [["shop", "garden_centre"], ["craft", "gardener"]]],
  [/hvac|heating|cooling|plumb|furnace/i, [["craft", "hvac"], ["craft", "plumber"], ["craft", "electrician"]]],
  [/home ?builder|construction|contractor|remodel|bath|kitchen|design-?build/i, [["craft", "builder"], ["shop", "doityourself"]]],
  [/montessori|preschool|pre-?k|childcare|early childhood|academy|\bschool\b|education/i, [["amenity", "kindergarten"], ["amenity", "childcare"], ["amenity", "school"]]],
  [/restaurant|cafe|coffee|bakery|bar|grill|pizza/i, [["amenity", "restaurant"], ["amenity", "cafe"], ["amenity", "fast_food"]]],
  [/fitness|gym|yoga|pilates|crossfit/i, [["leisure", "fitness_centre"], ["leisure", "sports_centre"], ["sport", "fitness"]]],
  [/salon|barber|hair|nail|beauty/i, [["shop", "hairdresser"], ["shop", "beauty"]]],
  [/real estate|realtor|broker|property/i, [["office", "estate_agent"]]],
];

export function categoryFilters(category) {
  const c = String(category || "");
  for (const [re, filters] of RULES) if (re.test(c)) return filters;
  return [["office", "company"], ["shop", "yes"]]; // weak fallback
}

async function get(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try { return await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, "Accept-Language": "en" }, ...opts }); }
  finally { clearTimeout(t); }
}

// Reduce a verbose prospect location to a geocodable "City, State".
// e.g. "Littleton, Colorado (multiple campuses…)" -> "Littleton, Colorado".
export function cleanLocation(loc) {
  let s = String(loc || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const st = s.match(/\b(Colorado|CO|[A-Z]{2})\b/);
  const city = (s.split(",")[0] || "").trim();
  if (city && /[a-z]/i.test(city)) return st ? `${city}, ${st[1]}` : city;
  return s;
}

export async function geocode(location) {
  const url = `${NOMINATIM}?q=${encodeURIComponent(cleanLocation(location))}&format=json&limit=1&countrycodes=us`;
  const r = await get(url);
  if (!r.ok) return null;
  const d = await r.json().catch(() => []);
  if (!d || !d.length) return null;
  return { lat: parseFloat(d[0].lat), lon: parseFloat(d[0].lon), display: d[0].display_name };
}

function haversineKm(a, b, lat, lon) {
  const R = 6371, toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(lat - a), dLon = toR(lon - b);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a)) * Math.cos(toR(lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 10) / 10;
}

// Discover local competitors for a category near a location.
export async function discoverCompetitors(category, location, { radiusKm = 12, limit = 12, excludeDomain = "" } = {}) {
  if (!location) return { ok: false, error: "location required" };
  const center = await geocode(location);
  if (!center) return { ok: false, error: `could not geocode "${location}"` };

  const filters = categoryFilters(category);
  const radius = Math.round(radiusKm * 1000);
  const clauses = filters.map(([k, v]) => `node["${k}"="${v}"](around:${radius},${center.lat},${center.lon});way["${k}"="${v}"](around:${radius},${center.lat},${center.lon});`).join("");
  const q = `[out:json][timeout:25];(${clauses});out center tags 200;`;

  const r = await get(OVERPASS, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) });
  if (!r.ok) return { ok: false, error: `overpass ${r.status}`, center };
  const data = await r.json().catch(() => ({ elements: [] }));

  // Aggregators/social/directories — not the business's own website.
  const BLOCK = /(^|\.)(yelp|facebook|instagram|twitter|x|google|goo\.gl|linktr\.ee|business\.site|foursquare|nextdoor|tripadvisor|mapquest|yellowpages|bbb)\.(com|org|us|ee|gl)$/i;
  const bare = (d) => normDomain(d).replace(/^www\./, "");
  const exclude = bare(excludeDomain);
  const seen = new Set();
  const out = [];
  for (const el of data.elements || []) {
    const t = el.tags || {};
    const web = t.website || t["contact:website"] || t.url || "";
    if (!web || !/^https?:\/\//i.test(web)) continue;
    const domain = normDomain(web);
    const key = bare(domain);
    if (!domain || !key || key === exclude || seen.has(key) || BLOCK.test(domain)) continue;
    seen.add(key);
    const plat = el.lat != null ? el.lat : (el.center && el.center.lat);
    const plon = el.lon != null ? el.lon : (el.center && el.center.lon);
    const peer = {
      name: t.name || domain,
      domain,
      website: web,
      distance_km: (plat != null && plon != null) ? haversineKm(center.lat, center.lon, plat, plon) : null,
    };
    peer.peer_quality = scorePeer(category, peer, { tags: t, filters });
    out.push(peer);
  }

  out.sort((a, b) => {
    const quality = (b.peer_quality?.score || 0) - (a.peer_quality?.score || 0);
    if (quality) return quality;
    return (a.distance_km ?? 999) - (b.distance_km ?? 999);
  });

  const eligible = out.filter((peer) => peer.peer_quality?.eligible);
  const suppressed = out.filter((peer) => !peer.peer_quality?.eligible);
  return {
    ok: true,
    center: center.display,
    category_filters: filters,
    count: eligible.length,
    discovered_count: out.length,
    suppressed_count: suppressed.length,
    competitors: eligible.slice(0, limit),
    suppressed_preview: suppressed.slice(0, 5).map((peer) => ({
      name: peer.name,
      domain: peer.domain,
      distance_km: peer.distance_km,
      peer_quality: peer.peer_quality,
    })),
  };
}
