// ─────────────────────────────────────────────────────────────────────────────
// Site strategy director — one grounded planning pass after capture.
//
// The extraction layer answers "what facts are on the current site?". This layer
// answers the different question that was missing from the engine: "what should
// the new site say first, what proof should it lead with, and which composition
// best fits THIS business?"
//
// Hard rule: factual copy may only use the supplied extracted facts or source
// page text. Strategy may reorganize and sharpen; it may not invent claims.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'node:url';
import { callAnthropic } from './anthropic.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ALLOWED_ARCHETYPES = new Set(['flagship', 'editorial', 'split', 'minimal', 'modern']);
const ALLOWED_STRUCTURES = new Set(['proof', 'story', 'offer', 'showcase', 'flagship', 'classic']);
const MAX_PER_PAGE = 10000;
const MAX_TOTAL = 42000;

function resolveKey(){
  const direct = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY;
  if (direct) return direct.trim();
  try {
    const m = fs.readFileSync(path.join(ROOT, '.sightline.env'), 'utf8')
      .match(/ANTHROPIC(?:_API)?_KEY\s*=\s*(\S+)/);
    return m ? m[1] : null;
  } catch { return null; }
}

function strategyModel(){
  if (process.env.STRATEGY_MODEL) return process.env.STRATEGY_MODEL.trim();
  try {
    const m = fs.readFileSync(path.join(ROOT, '.sightline.env'), 'utf8')
      .match(/STRATEGY_MODEL\s*=\s*(\S+)/);
    if (m) return m[1];
  } catch {}
  return process.env.EXTRACT_MODEL || 'claude-haiku-4-5';
}

const str = (v, max=240) => typeof v === 'string'
  ? v.replace(/\s+/g, ' ').trim().slice(0, max)
  : '';
const arr = v => Array.isArray(v) ? v : [];

function sanitize(j){
  if (!j || typeof j !== 'object') return null;
  const hero = j.hero && typeof j.hero === 'object' ? j.hero : {};
  const about = j.about && typeof j.about === 'object' ? j.about : {};
  const feature = j.feature && typeof j.feature === 'object' ? j.feature : {};
  const faq = arr(j.faq).map(x => ({ q: str(x?.q, 140), a: str(x?.a, 360) }))
    .filter(x => x.q.length >= 8 && x.a.length >= 20).slice(0, 6);
  const archetype = ALLOWED_ARCHETYPES.has(j.archetype) ? j.archetype : '';
  const structure = ALLOWED_STRUCTURES.has(j.structure) ? j.structure : '';
  return {
    heroHeadline: str(hero.headline, 110),
    heroSubhead: str(hero.subhead, 220),
    primaryCta: str(hero.cta, 44),
    aboutTitle: str(about.title, 100),
    aboutBody: str(about.body, 700),
    featureTitle: str(feature.title, 100),
    featurePoints: arr(feature.points).map(x => str(x, 120)).filter(Boolean).slice(0, 6),
    faq,
    offer: str(j.offer, 240),
    moneyLead: str(j.money_lead, 320),
    trustSignals: arr(j.trust_signals).map(x => str(x, 100)).filter(Boolean).slice(0, 6),
    archetype,
    structure,
    rationale: str(j.rationale, 300),
  };
}

function pageText(html){
  const $ = cheerio.load(html);
  $('script,style,noscript,svg,iframe').remove();
  return $('body').text().replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
}

async function fetchPage(url, timeoutMs=14000){
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/126 Safari/537.36' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
  finally { clearTimeout(timer); }
}

export async function createSiteStrategy({
  domain = '', name = '', vertical = 'business', pageUrls = [], pages = [], extracted = {}, timeoutMs = 60000,
} = {}) {
  const key = resolveKey();
  if (!key) return null;

  // Prefer the HTML capture already fetched (pages: [{url, html}]) — the old
  // behavior re-crawled the prospect's site a second time per build, doubling
  // load and inviting WAF throttling under parallel releases. Fetching is now
  // only a fallback for URLs the capture didn't hand us.
  const byUrl = new Map(pages.filter(p => p?.html).map(p => [p.url, p.html]));
  const docs = [];
  let total = 0;
  for (const url of [...new Set([...byUrl.keys(), ...pageUrls])].slice(0, 7)) {
    const html = byUrl.get(url) || await fetchPage(url);
    if (!html) continue;
    const text = pageText(html).slice(0, MAX_PER_PAGE);
    if (text.length < 120 || total + text.length > MAX_TOTAL) continue;
    total += text.length;
    docs.push(`── PAGE: ${url}\n${text}`);
  }
  if (!docs.length) return null;

  const prompt = `You are the senior web strategy and creative director for a high-end website studio. You are planning a rebuild for "${name}" (${vertical}) at ${domain}.

Your job is NOT to make a generic industry template. Decide the conversion argument and visual composition for THIS business from its actual content and proof.

GROUNDING RULES:
- Every factual claim in copy must be supported by EXTRACTED FACTS or SOURCE PAGES below.
- Never invent years in business, local ownership, licensing, insurance acceptance, financing, free consultations, guarantees, awards, ratings, prices, offers, or business hours.
- You may sharpen wording and reorganize facts, but never add a fact.
- If a fact is not supported, omit it. Empty is better than false.
- FAQ answers must be answerable from source material. Do not write generic industry advice.
- Avoid cliché filler: "welcome to", "your trusted partner", "excellence", "quality service", "we care", "state-of-the-art", "one-stop shop".

COMPOSITION OPTIONS — choose from evidence, not from industry stereotypes:
- flagship: cinematic, image-led, dramatic; only for strong photography and a clear emotional story.
- editorial: authority-led, typographic, structured; best for expertise, nuanced services, or dense proof.
- split: human and conversion-clear; strong when one image plus a direct service proposition can carry the first screen.
- minimal: restrained premium confidence; only when the brand/content can support sparse composition.
- modern: bold, energetic, product-forward; for genuinely energetic brands, launches, retail, or strong offers.

ARGUMENT STRUCTURES:
- proof: lead with real reviews/results/proof.
- story: lead with mission, founder, philosophy, or meaningful origin.
- offer: lead with a real, explicitly supported offer or urgent conversion path.
- showcase: lead with projects, products, transformations, or a deep gallery.
- flagship: balanced service → difference → proof → story arc.
- classic: use the vertical's default order only when no stronger argument is supported.

Return ONLY valid JSON in this exact shape:
{
  "hero": {"headline":"6-12 words, specific and distinctive","subhead":"one plain sentence, max 26 words","cta":"2-5 words"},
  "about": {"title":"specific section title","body":"2-4 grounded sentences that sound like this organization"},
  "feature": {"title":"specific why-us title","points":["3-6 grounded differentiators"]},
  "faq": [{"q":"question","a":"grounded answer"}],
  "offer":"supported offer text or empty string",
  "money_lead":"supported insurance/financing/payment copy or empty string",
  "trust_signals":["only explicit, supportable proof signals"],
  "archetype":"flagship|editorial|split|minimal|modern",
  "structure":"proof|story|offer|showcase|flagship|classic",
  "rationale":"one sentence explaining why the chosen composition fits the evidence"
}

EXTRACTED FACTS:
${JSON.stringify(extracted, null, 2)}

SOURCE PAGES:
${docs.join('\n\n')}`;

  // Resilient call with backoff + truncation detection; temperature:0 keeps
  // the strategy stable so borderline sites can't flip pass/fail on sampling.
  const r = await callAnthropic(
    { model: strategyModel(), max_tokens: 2400, temperature: 0, messages: [{ role: 'user', content: prompt }] },
    { key, timeoutMs, label: 'site-strategy' },
  );
  if (!r.ok) return null;
  try {
    const raw = (r.data.content || []).map(c => c.text || '').join('');
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return sanitize(JSON.parse(match[0]));
  } catch (e) {
    console.error('site-strategy parse failed:', e.message || e);
    return null;
  }
}

export default { createSiteStrategy };
