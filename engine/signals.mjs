// ─────────────────────────────────────────────────────────────────────────────
// External proof signals — verifiable, third-party facts for the cold call,
// gathered with NO paid APIs:
//   • Google PageSpeed Insights (works keyless at low volume; API key optional
//     via PSI_API_KEY for higher quotas — still free)
//   • HTTPS reachability + redirect-to-https behaviour
//   • DNS resolution (dead domain = DEAD tier confirmation)
//
// Enriches engine/preview/prospects.json in place with a `signals` object per
// prospect and folds the strongest fact into the cold-call opener. Results are
// cached (engine/preview/signals-cache.json, 14-day TTL) so re-runs are cheap
// and polite.
//
//   node engine/signals.mjs             # enrich all prospects (cache-aware)
//   node engine/signals.mjs --limit 10  # only the 10 weakest first
//   node engine/signals.mjs --no-psi    # skip PageSpeed (fast pass)
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROSPECTS = path.join(ROOT, 'engine/preview/prospects.json');
const CACHE = path.join(ROOT, 'engine/preview/signals-cache.json');
const TTL = 14 * 24 * 3600 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
const fresh = (d) => cache[d] && Date.now() - cache[d].at < TTL;

async function dnsOk(domain) {
  try { await dns.lookup(domain); return true; } catch { return false; }
}

async function httpsCheck(domain) {
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 10000);
    const res = await fetch('https://' + domain, { redirect: 'follow', signal: ac.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; sightline-signals/1.0)' } });
    clearTimeout(t);
    return { ok: res.ok, status: res.status };
  } catch { return { ok: false, status: 0 }; }
}

async function psi(domain) {
  const key = process.env.PSI_API_KEY ? '&key=' + process.env.PSI_API_KEY : '';
  const u = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent('https://' + domain)}&strategy=mobile&category=performance${key}`;
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 60000);
    const res = await fetch(u, { signal: ac.signal });
    clearTimeout(t);
    if (!res.ok) return null;                              // 429 = quota; just skip
    const j = await res.json();
    const lh = j.lighthouseResult;
    if (!lh) return null;
    return {
      perf: Math.round((lh.categories?.performance?.score || 0) * 100),
      lcp: lh.audits?.['largest-contentful-paint']?.displayValue || null,
      fieldSlow: j.loadingExperience?.overall_category === 'SLOW' || undefined,
    };
  } catch { return null; }
}

// ── run ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : null; };
const limit = +flag('limit') || Infinity;
const usePsi = !args.includes('--no-psi');

if (!fs.existsSync(PROSPECTS)) { console.error('run engine/prospector.mjs first'); process.exit(1); }
const rows = JSON.parse(fs.readFileSync(PROSPECTS, 'utf8'));

// weakest first — the ones you'll actually call
const targets = rows.filter((r) => r.domain).slice(0, limit);
let done = 0, cached = 0;
for (const r of targets) {
  if (fresh(r.domain)) { r.signals = cache[r.domain].signals; cached++; continue; }
  const signals = {};
  signals.dns = await dnsOk(r.domain);
  if (signals.dns) {
    const h = await httpsCheck(r.domain);
    signals.https = h.ok; signals.status = h.status;
    if (usePsi && h.ok) {
      const p = await psi(r.domain);
      if (p) { signals.perf = p.perf; signals.lcp = p.lcp; if (p.fieldSlow) signals.fieldSlow = true; }
      await sleep(1200);                                   // keyless PSI: stay well under quota
    }
  }
  r.signals = signals;
  cache[r.domain] = { at: Date.now(), signals };
  done++;
  process.stdout.write(`\r  checked ${done}/${targets.length - cached}…   `);
}
console.log('');

// fold the hardest external fact into the pitch/opener
for (const r of rows) {
  const s = r.signals; if (!s) continue;
  if (!s.dns) r.externalFact = 'their domain no longer resolves — the site is fully offline';
  // 403/429/503 are usually bot walls, not real outages — never claim those on a call
  else if (!s.https && !(s.status >= 400 && s.status < 500) && s.status !== 503)
    r.externalFact = `their site fails to load over HTTPS${s.status ? ` (status ${s.status})` : ''} — visitors hit an error or a not-secure warning`;
  else if (s.perf != null && s.perf < 50) r.externalFact = `Google scores their mobile speed ${s.perf}/100${s.lcp ? ` (loads in ${s.lcp})` : ''} — most visitors give up before it paints`;
  else if (s.fieldSlow) r.externalFact = 'Google field data rates their real-visitor experience as SLOW';
  if (r.externalFact && !r.dead) {
    r.opener = `Hi — quick heads-up about ${r.name}'s website: ${r.externalFact}. I checked because I'd already rebuilt a faster version of your site — two minutes to show you?`;
  }
}

fs.writeFileSync(PROSPECTS, JSON.stringify(rows, null, 2));
fs.writeFileSync(CACHE, JSON.stringify(cache));
const withFacts = rows.filter((r) => r.externalFact).length;
console.log(`SIGNALS: ${done} checked · ${cached} from cache · ${withFacts} prospects now have a verifiable external fact in the opener`);
