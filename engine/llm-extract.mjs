// ─────────────────────────────────────────────────────────────────────────────
// LLM extraction pass — one cheap structured call over the crawled pages' text.
// Extracts the prospect's REAL services, staff, testimonials, hours, offer and
// voice, replacing brittle regex heuristics. Activates only when
// ANTHROPIC_API_KEY is set; callers must treat a null return as "fall back to
// heuristics". Never invents content: the prompt instructs extraction-only,
// and every list is length/shape validated before use.
//
// Usage:  const x = await llmExtract(pages, { domain });   // pages: [{url, html}]
// ─────────────────────────────────────────────────────────────────────────────
import * as cheerio from 'cheerio';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Key resolution (matches ai-content.mjs): either env var name, or the
// gitignored .sightline.env file at the repo root — one key, set once,
// activates BOTH AI passes.
function resolveKey(){
  const k = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY;
  if (k) return k.trim();
  try {
    const m = fs.readFileSync(path.join(ROOT, '.sightline.env'),'utf8').match(/ANTHROPIC(?:_API)?_KEY\s*=\s*(\S+)/);
    if (m) return m[1];
  } catch {}
  return null;
}

function extractModel(){
  if (process.env.EXTRACT_MODEL) return process.env.EXTRACT_MODEL.trim();
  try {
    const m = fs.readFileSync(path.join(ROOT, '.sightline.env'),'utf8').match(/EXTRACT_MODEL\s*=\s*(\S+)/);
    if (m) return m[1];
  } catch {}
  return 'claude-haiku-4-5';
}
const MODEL = extractModel();
const MAX_PER_PAGE = 9000;    // chars of text per page
const MAX_TOTAL = 32000;      // chars total across pages

function pageText(html) {
  const $ = cheerio.load(html);
  $('script,style,noscript,svg,iframe').remove();
  return $('body').text().replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
}

// clamp at a WORD boundary — a hard slice once shipped "closely aligned wi"
const str = (v, max) => { if (typeof v !== 'string') return '';
  const t = v.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 25)).replace(/[,;:.\s]+$/, '') + '…'; };
const arr = (v) => (Array.isArray(v) ? v : []);

// validate + clamp the model's JSON so bad output can never poison a build
function sanitize(j) {
  if (!j || typeof j !== 'object') return null;
  return {
    businessName: str(j.business_name, 60),
    services: arr(j.services).map((s) => ({ h: str(s.name || s.h, 60), p: str(s.description || s.p, 160) }))
      .filter((s) => s.h && s.h.length >= 3).slice(0, 8),
    staff: arr(j.staff).map((s) => ({ name: str(s.name, 60), role: str(s.role, 60) }))
      .filter((s) => s.name && /^[A-Z]/.test(s.name)).slice(0, 8),
    reviews: arr(j.testimonials).map((r) => ({ q: str(r.quote || r.q, 300), name: str(r.author || r.name, 60) }))
      .filter((r) => r.q && r.q.length >= 20).slice(0, 6),
    hours: arr(j.hours).map((h) => str(h, 60)).filter(Boolean).slice(0, 7),
    serviceTimes: arr(j.service_times).map((t) => str(t, 60)).filter(Boolean).slice(0, 5),
    address: str(j.address, 160),
    tagline: str(j.tagline, 120),
    mission: str(j.mission, 240),
    offer: str(j.offer, 200),
    differentiators: arr(j.differentiators).map((d) => str(d, 80)).filter(Boolean).slice(0, 5),
  };
}

export async function llmExtract(pages, { domain = '', timeoutMs = 45000 } = {}) {
  const key = resolveKey();
  if (!key) return null;

  let total = 0;
  const docs = [];
  for (const p of pages) {
    const t = pageText(p.html).slice(0, MAX_PER_PAGE);
    if (t.length < 100 || total + t.length > MAX_TOTAL) continue;
    total += t.length;
    docs.push(`── PAGE: ${p.url}\n${t}`);
  }
  if (!docs.length) return null;

  const prompt = `You are extracting factual content from a small business or church website (${domain}) so it can be rebuilt. Below is the visible text of ${docs.length} crawled page(s).

Extract ONLY information that is explicitly present in the text. Never invent, embellish, or generalize. If a field has no clear answer, use an empty string or empty array.

Return ONLY a JSON object (no markdown fence, no commentary) with exactly these keys:
{
  "business_name": "the official business/practice/organization name as they write it (check logo text, footer, about page) — NOT an SEO phrase like 'Denver CO Dentist'",
  "services": [{"name": "...", "description": "one short sentence, from their text, may be empty string"}],   // their actual named services/practice areas/ministries, max 8
  "staff": [{"name": "First Last", "role": "their title"}],   // real people only, max 8
  "testimonials": [{"quote": "verbatim or lightly trimmed customer quote", "author": "name if given, else empty"}],   // ONLY real quotes attributed to customers/patients/clients on the site, max 6
  "hours": ["Mon–Fri · 8:00 AM – 5:00 PM"],   // business hours if stated
  "service_times": ["Sundays at 9 & 11 AM"],  // worship/mass times if this is a church
  "address": "street, city, state zip if stated",
  "tagline": "their own short tagline/slogan if one exists",
  "mission": "their mission statement if one exists, verbatim-ish",
  "offer": "any new-customer/new-patient special they advertise",
  "differentiators": ["short phrases they use to set themselves apart"]
}

${docs.join('\n\n')}`;

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ac.signal,
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) { console.error('llm-extract: API ' + res.status); return null; }
    const data = await res.json();
    let text = (data.content || []).map((c) => c.text || '').join('');
    const m = text.match(/\{[\s\S]*\}/);        // tolerate stray prose/fences
    if (!m) return null;
    return sanitize(JSON.parse(m[0]));
  } catch (e) {
    console.error('llm-extract failed:', e.message || e);
    return null;
  } finally { clearTimeout(t); }
}

export default { llmExtract };
