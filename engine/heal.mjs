// ─────────────────────────────────────────────────────────────────────────────
// HEAL — the self-tuning loop. One default recipe can't fit 57 businesses.
// For every site the art critic flags, this builds it in several competing
// recipes, has the critic score each, keeps the WINNER, and locks that choice
// into engine/preview/recipes.json so every future build remembers it.
//
//   node engine/heal.mjs                 # heal everything in critic-report.json marked "flag"
//   node engine/heal.mjs <slug>…         # heal specific sites
//   node engine/heal.mjs --conc 4        # site concurrency (default 4)
//
// This is the difference between "a template with defaults" and "every site
// individually art-directed by a machine that looks at its own work."
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flagArg = k => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : null; };
const CONC = +(flagArg('conc') || 4);

const key = (() => {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim();
  try { return (fs.readFileSync(path.join(ROOT, '.sightline.env'), 'utf8').match(/ANTHROPIC(?:_API)?_KEY\s*=\s*(\S+)/) || [])[1]; } catch {}
  return null;
})();
if (!key) { console.error('heal needs ANTHROPIC_API_KEY'); process.exit(1); }

// candidate recipes — visually distinct directions over the same content
const CANDIDATES = [
  { id: 'editorial',  args: ['--archetype','editorial','--theme','evergreen'] },
  { id: 'split',      args: ['--archetype','split','--theme','community'] },
  { id: 'heritage',   args: ['--archetype','cathedral','--theme','heritage'] },
  { id: 'flagship',   args: ['--archetype','flagship','--theme','modern','--theme-palette'] },
];

const RECIPES_PATH = path.join(ROOT, 'engine/preview/recipes.json');
const recipes = fs.existsSync(RECIPES_PATH) ? JSON.parse(fs.readFileSync(RECIPES_PATH, 'utf8')) : {};

// slug → domain via the harvest roster
const DIRS = ['assets/harvest/business','assets/harvest/fc','assets/harvest/nucleus','assets/harvest/competitors'];
const slugify = d => d.replace(/[^a-z0-9]+/gi,'-').toLowerCase();
const domainOf = {};
for (const d of DIRS) {
  const full = path.join(ROOT, d);
  if (!fs.existsSync(full)) continue;
  for (const f of fs.readdirSync(full)) if (f.endsWith('.html')) {
    const dom = f.replace(/\.html$/,'').replace(/^fc-/,'');
    domainOf[slugify(dom)] = dom;
  }
}

// which slugs to heal
let targets = args.filter(a => !a.startsWith('--') && a !== flagArg('conc'));
if (!targets.length) {
  const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'engine/preview/critic-report.json'), 'utf8'));
  targets = report.filter(r => (r.verdict === 'flag' || (r.score && r.score < 7)) && domainOf[r.slug]).map(r => r.slug);
}
targets = targets.filter(s => domainOf[s]);
console.log(`HEAL: ${targets.length} site(s), ${CANDIDATES.length} candidate recipes each, concurrency ${CONC}\n`);

const build = (domain, extra) => new Promise((res) => {
  execFile('node', [path.join(ROOT,'engine/pipeline.mjs'), domain, '--pages', '--no-render-qa', ...extra],
    { cwd: ROOT, timeout: 300000 }, (err) => res(!err));
});

async function shoot(slug) {
  const { chromium } = await import('playwright-core');
  let exe = null;
  for (const bin of [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean))
    if (fs.existsSync(bin)) { exe = bin; break; }
  const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    const pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
    await pg.goto('file://' + path.join(ROOT, 'demos', slug, 'index.html'), { waitUntil: 'load', timeout: 20000 });
    await pg.waitForTimeout(1600);
    return await pg.screenshot();
  } finally { await b.close(); }
}

async function score(png) {
  const sharp = (await import('sharp')).default;
  const buf = await sharp(png).resize({ width: 1024 }).jpeg({ quality: 80 }).toBuffer();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 120, messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: buf.toString('base64') } },
      { type: 'text', text: 'Score this small-business website hero screenshot 1-10 as a demanding design director (7 = a business would happily pay). Penalize color washes, murky/dim overlays, illegible text, cramped or empty layouts, generic feel. Reply ONLY minified JSON {"score":N}' },
    ]}]}),
  });
  if (!res.ok) return 0;
  const j = await res.json();
  const m = (j.content?.[0]?.text || '').match(/\{.*\}/s);
  try { return m ? (JSON.parse(m[0]).score || 0) : 0; } catch { return 0; }
}

async function healOne(slug) {
  const domain = domainOf[slug];
  let best = { id: null, score: 0 };
  for (const c of CANDIDATES) {
    const ok = await build(domain, c.args);
    if (!ok) { console.log(`   ${slug} · ${c.id}: build failed`); continue; }
    try {
      const png = await shoot(slug);
      const s = await score(png);
      console.log(`   ${slug} · ${c.id}: ${s}/10`);
      if (s > best.score) best = { id: c.id, score: s, args: c.args };
    } catch (e) { console.log(`   ${slug} · ${c.id}: score failed (${String(e.message||e).slice(0,50)})`); }
  }
  if (!best.id) { console.log(`❌ ${slug}: no candidate succeeded`); return { slug, healed: false }; }
  // rebuild with the winner (last built may not be the winner) + lock it in
  if (CANDIDATES[CANDIDATES.length-1].id !== best.id) await build(domain, best.args);
  recipes[slug] = { candidate: best.id, args: best.args, score: best.score, at: new Date().toISOString() };
  fs.writeFileSync(RECIPES_PATH, JSON.stringify(recipes, null, 2));
  console.log(`✅ ${slug} → ${best.id} (${best.score}/10) locked`);
  return { slug, healed: true, score: best.score };
}

// site-level concurrency pool
const queue = [...targets];
const results = [];
await Promise.all(Array.from({ length: Math.min(CONC, queue.length) }, async () => {
  while (queue.length) {
    const slug = queue.shift();
    console.log(`⚕ healing ${slug} (${targets.length - queue.length}/${targets.length})`);
    results.push(await healOne(slug));
  }
}));

const healed = results.filter(r => r.healed);
const avg = healed.length ? (healed.reduce((a,r)=>a+r.score,0)/healed.length).toFixed(1) : '—';
console.log(`\nHEAL COMPLETE: ${healed.length}/${results.length} healed · avg winning score ${avg}/10 · choices locked in engine/preview/recipes.json`);
