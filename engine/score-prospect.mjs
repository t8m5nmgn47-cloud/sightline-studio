// ─────────────────────────────────────────────────────────────────────────────
// Shared prospect scoring — one source of truth used by pond.mjs (new captures)
// and rescore.mjs (live re-verification). Fetches a prospect's site TODAY,
// falls back to headless Chrome for JS-built sites, and scores it on the same
// readiness rubric as the rest of the pond.
// ─────────────────────────────────────────────────────────────────────────────
import * as cheerio from 'cheerio';
import { scoreBusiness, corpusFromPages } from './business.mjs';
import { scoreCongregation } from './congregation.mjs';
import { detectVertical } from './vertical-content.mjs';
import { renderWithChrome } from './capture.mjs';

const UA = { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36' }, redirect: 'follow' };

// Run fn over items with N parallel workers. Every prospect is a different
// host, so modest parallelism is polite AND ~6x faster than one-at-a-time.
export async function pool(items, size, fn){
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length){ const idx = i++; out[idx] = await fn(items[idx], idx); }
  }));
  return out;
}

export const JUNK_NAME = /^(home ?page|home|welcome|untitled|index|error|checking your browser|just a moment|attention required)$|^\d{3}\b|forbidden|not found|access denied|default web ?site|apache|nginx|test page/i;
export const BAD_CAPTURE = /checking your browser|just a moment\.\.\.|attention required|access denied|error 40[34]|are you a (human|robot)|enable javascript to/i;
export const DEAD = /launching soon|coming soon|under construction|site is being built|domain (is )?for sale|godaddy|this domain|parked|account suspended|default web ?site|page not found|404 not found/i;
export const humanize = d => d.replace(/\.[a-z]+$/,'').replace(/[-_.]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
export function detectTradition(t){ t=t.toLowerCase();
  if (/\b(mass times?|sacrament|parish|eucharist|reconciliation|diocese|ocia|rcia)\b/.test(t)) return 'catholic';
  if (/\b(elca|lcms|umc|pc\(usa\)|pcusa|episcopal|synod)\b/.test(t)) return 'mainline';
  return 'contemporary'; }
export const MRR = { dental:249, medical:249, optometry:229, law:299, accounting:229, insurance:199, mortgage:229, title:229, medspa:249, trades:199, childcare:199, retail:199, business:199, church:99 };

const textLen = html => { const $ = cheerio.load(html); $('script,style,noscript,svg').remove(); return $('body').text().replace(/\s+/g,' ').trim().length; };

export async function fetchSite(domain){
  let html = null;
  try {
    const ac = new AbortController(); const t = setTimeout(()=>ac.abort(), 15000);
    const res = await fetch('https://'+domain, { ...UA, signal: ac.signal });
    clearTimeout(t);
    if (res.ok) html = await res.text();
  } catch {}
  let rendered = false;
  // JS-shell or bot-wall? Let a real browser look before judging.
  if (!html || textLen(html) < 400 || BAD_CAPTURE.test(html)){
    const dom = renderWithChrome('https://'+domain);
    if (dom && textLen(dom) > (html ? textLen(html) : 0)) { html = dom; rendered = true; }
  }
  if (html && BAD_CAPTURE.test(html)) return { html: null, rendered };   // still walled — can't judge fairly
  return { html, rendered };
}

// Score a domain as it exists RIGHT NOW. Returns null if unreachable/unjudgeable.
export async function scoreDomain(entry, { churchHint = false, categoryHint = null } = {}){
  const { html, rendered } = await fetchSite(entry.domain);
  if (!html) return null;

  const $ = cheerio.load(html);
  const bodyText = $('body').text();
  const rawName = ($('meta[property="og:site_name"]').attr('content') || $('title').first().text().split(/[|–—·]/)[0] || '').replace(/\s+/g,' ').trim();
  const name = (!rawName || JUNK_NAME.test(rawName) || rawName.length<3) ? (entry.hintName || humanize(entry.domain)) : rawName;
  const cleanText = bodyText.replace(/\s+/g,' ').trim();
  const title = ($('title').first().text() || '').toLowerCase();
  // DEAD means a placeholder, not a real site. Judge VISIBLE text only (raw
  // HTML contains "page not found" strings inside healthy WordPress scripts),
  // and a real dead page is also short — a 5,000-char site is alive.
  const dead = cleanText.length < 300
    || (DEAD.test(cleanText) && cleanText.length < 2500)
    || /for sale|parked|coming soon|under construction/.test(title);
  const corpus = corpusFromPages({ home: html }, cheerio, { https:true, mobile:/viewport/.test(html) });

  let type, tradition, r;
  if (churchHint || /\b(church|worship|sermon|congregation)\b/i.test(bodyText.slice(0,4000))){
    type = 'church'; tradition = detectTradition(bodyText);
    r = scoreCongregation(corpus, { tradition });
  } else {
    type = 'business'; tradition = detectVertical(name+' '+bodyText.slice(0,4000));
    const CAT_VERTICAL = { dentist:'dental', medical:'medical', optometry:'optometry', law:'law',
      accounting:'accounting', insurance:'insurance', medspa:'medspa', trades:'trades', childcare:'childcare' };
    if (tradition === 'business' && CAT_VERTICAL[categoryHint]) tradition = CAT_VERTICAL[categoryHint];
    r = scoreBusiness(corpus);
  }
  const gaps = r.dims.filter(d=>!d.found).map(d=>d.label);
  const tier = dead ? 'DEAD' : r.score < (type==='church'?45:40) ? 'HOT' : r.score < 60 ? 'WARM' : r.score < 80 ? 'MILD' : 'SERVED';
  const pitch = dead
    ? `${name} has no working website — a dead placeholder where their front door should be.`
    : gaps.length
      ? (type==='business'
          ? `Leaking leads — missing ${gaps.slice(0,3).join(', ').toLowerCase()}. Scores ${r.score}/100; each fix is booked revenue.`
          : `Pays for a site but it's missing ${gaps.slice(0,3).join(', ').toLowerCase()} — scores ${r.score}/100 on congregation-readiness.`)
      : `Strong site (${r.score}/100) — low priority.`;
  const base = MRR[tradition] || MRR.business;
  const need = dead ? 0.55 : Math.min(0.6, 0.2 + (100 - r.score)/100*0.45);
  return {
    type, domain: entry.domain, name, tradition,
    score: dead?0:r.score, tier, gaps, pitch, dead, rendered,
    dims: r.dims.map(d=>({l:d.label,f:d.found,w:d.why})),
    phone: entry.phone || null,
    mrr: base, annual: base*12, winPct: Math.round(need*100), expected: Math.round(base*12*need),
  };
}
