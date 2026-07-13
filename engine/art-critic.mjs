// ─────────────────────────────────────────────────────────────────────────────
// Art critic — the visual QA gate. qa.mjs checks structure; this checks TASTE.
// For each demo it captures TWO screenshots (Chrome required):
//   1. FULL-PAGE desktop (1280 wide, top to bottom — every section, not just
//      above the fold; a scroll pass first triggers lazy/reveal content)
//   2. Mobile viewport (390x844, above the fold)
// and sends both in ONE vision call so Claude judges the whole page like a
// design director: color, hero, section rhythm, image appropriateness (logos
// or text-banners posing as photos get flagged), and mobile usability.
//
//   node engine/art-critic.mjs --all              # every demo in demos/
//   node engine/art-critic.mjs <slug> [<slug>…]   # specific demos
//   node engine/art-critic.mjs --all --min 7      # custom pass threshold
//
// Requires ANTHROPIC_API_KEY (env or .sightline.env). ~1¢/site with Haiku;
// set CRITIC_MODEL for a stronger eye (e.g. claude-sonnet-5).
// Writes engine/preview/critic-report.json (per-site: score, verdict, issues,
// mobileIssues, best, flagged; API failures are recorded as {error} and count
// as FLAGGED — this gate fails closed). Exits non-zero if any site flags.
//
// Test seam: CRITIC_STUB env skips the API — 'fail' throws like an API error,
// any other value is parsed as the JSON verdict. Screenshots still run.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function envVal(name){
  if (process.env[name]) return process.env[name].trim();
  try {
    const m = fs.readFileSync(path.join(ROOT, '.sightline.env'),'utf8').match(new RegExp(name + '\\s*=\\s*(\\S+)'));
    if (m) return m[1];
  } catch {}
  return null;
}
const KEY = envVal('ANTHROPIC_API_KEY') || envVal('ANTHROPIC_KEY');
const MODEL = envVal('CRITIC_MODEL') || 'claude-haiku-4-5';
const STUB = process.env.CRITIC_STUB || null;
if (!KEY && !STUB){ console.error('art-critic needs ANTHROPIC_API_KEY (env or .sightline.env)'); process.exit(1); }

const RUBRIC = `You are a demanding design director reviewing a small-business website.
Image 1 is the FULL desktop page (1280px wide, top to bottom — every section).
Image 2 is the mobile viewport (390x844, above the fold).
Score 1-10 and be strict. A 7 is "a real business would happily pay for this."

Judge the WHOLE desktop page, every section:
1. COLOR: Is brand color used as tasteful accent, or does it flood/tint everything (monochrome wash = automatic ≤4)? Are combinations harmonious across all sections?
2. HERO: Is the headline instantly legible? Does imagery look natural (not weirdly tinted/stretched/blurry)? Does copy match the business type shown in the name/logo?
3. IMAGERY: Every image slot on the page must hold a real, appropriate photograph. FLAG any logo, text-banner, icon, map tile, or screenshot used where a photo belongs, and any repeated/stretched/irrelevant photo — in ANY section, not just the hero.
4. LAYOUT & RHYTHM: Balanced spacing and alignment in every section; consistent section rhythm down the page; nothing overlapping, cut off, cramped, or abruptly empty near the footer.
5. TRUST: Would the owner proudly send this to customers? Does anything look "template-y", broken, or mismatched (e.g. logo brand ≠ site name)?

Then judge MOBILE usability from image 2:
- Is the hero headline legible at 390px wide?
- Is navigation present (a hamburger/menu button must exist on mobile)?
- Are tap targets sane (buttons/links large and separated enough to tap)?
- Nothing overflowing horizontally, overlapping, or microscopically small?

Reply with ONLY minified JSON: {"score":N,"verdict":"pass"|"flag","issues":["…"],"mobileIssues":["…"],"best":"…"}
"issues" = whole-page desktop problems; "mobileIssues" = mobile-only problems (empty array if none).
verdict "flag" if score < MIN_SCORE or any issue is embarrassing (wrong industry copy, unreadable text, brand/name mismatch, color wash, logo-as-photo, missing mobile nav).`;

// Scroll to the bottom then back to top so lazy images, IntersectionObserver
// reveals, and scroll-triggered animations have fired before the full-page
// shot. Hard-capped so a page never costs more than ~3s of settle time.
async function settleFullPage(pg){
  await pg.evaluate(async () => {
    await new Promise((resolve) => {
      const deadline = Date.now() + 1600;                 // scroll pass budget
      const step = Math.max(400, Math.floor(window.innerHeight * 0.75));
      (function down(){
        window.scrollBy(0, step);
        const bottom = window.scrollY + window.innerHeight >= document.body.scrollHeight - 4;
        if (bottom || Date.now() > deadline) { window.scrollTo(0, 0); resolve(); }
        else setTimeout(down, 80);
      })();
    });
  });
  await pg.waitForTimeout(600);                           // reveals settle back at top
}

async function screenshot(slug, chromium, exe){
  const url = 'file://' + path.join(ROOT, 'demos', slug, 'index.html');
  const desk = path.join(ROOT, 'thumbs', slug + '.png');
  const mob = path.join(ROOT, 'thumbs', slug + '-mobile.png');
  fs.mkdirSync(path.join(ROOT, 'thumbs'), { recursive: true });
  const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    // full-page desktop
    const pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
    await pg.goto(url, { waitUntil: 'load', timeout: 20000 });
    await pg.waitForTimeout(700);                         // fonts + first paint settle
    await settleFullPage(pg);
    await pg.screenshot({ path: desk, fullPage: true });
    await pg.close();
    // mobile above-the-fold
    const mp = await b.newPage({ viewport: { width: 390, height: 844 } });
    await mp.goto(url, { waitUntil: 'load', timeout: 20000 });
    await mp.waitForTimeout(700);
    await mp.screenshot({ path: mob });
    await mp.close();
  } finally { await b.close(); }
  return { desk, mob };
}

async function prepImages(shots){
  let sharp = null; try { sharp = (await import('sharp')).default; } catch {}
  if (!sharp) return [                                     // degraded fallback: raw PNGs
    { media: 'image/png', data: fs.readFileSync(shots.desk) },
    { media: 'image/png', data: fs.readFileSync(shots.mob) },
  ];
  // desktop full-page: cap height before downscaling so very tall pages
  // stay within vision-friendly dimensions (~4000px pre-resize)
  let d = sharp(shots.desk);
  const meta = await d.metadata();
  if ((meta.height || 0) > 4000) d = d.extract({ left: 0, top: 0, width: meta.width, height: 4000 });
  const deskBuf = await d.resize({ width: 1024 }).jpeg({ quality: 80 }).toBuffer();
  const mobBuf = await sharp(shots.mob).jpeg({ quality: 80 }).toBuffer(); // 390 wide is already small
  return [
    { media: 'image/jpeg', data: deskBuf },
    { media: 'image/jpeg', data: mobBuf },
  ];
}

async function critique(shots, min){
  if (STUB){
    if (STUB === 'fail') throw new Error('API 500: stubbed failure (CRITIC_STUB=fail)');
    return JSON.parse(STUB);
  }
  const images = await prepImages(shots);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 600, messages: [{ role: 'user', content: [
      ...images.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.media, data: im.data.toString('base64') } })),
      { type: 'text', text: RUBRIC.replace('MIN_SCORE', String(min)) },
    ]}]}),
  });
  if (!res.ok) throw new Error('API ' + res.status + ': ' + (await res.text()).slice(0, 120));
  const j = await res.json();
  const txt = (j.content?.[0]?.text || '').replace(/^[^{]*/, '').replace(/[^}]*$/, '');
  return JSON.parse(txt);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function critiqueWithRetry(shots, min, slug){
  try { return await critique(shots, min); }
  catch (e) {
    console.log(`   ↻ ${slug}: critic call failed (${String(e.message || e).slice(0, 70)}) — retrying in 2s`);
    await sleep(2000);
    return await critique(shots, min);
  }
}

// ── run ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = k => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : null; };
const MIN = +(flag('min') || 7);
const slugs = args.includes('--all')
  ? fs.readdirSync(path.join(ROOT, 'demos')).filter(d => fs.existsSync(path.join(ROOT, 'demos', d, 'index.html')))
  : args.filter(a => !a.startsWith('--'));
if (!slugs.length){ console.error('usage: node engine/art-critic.mjs <slug>… | --all [--min 7]'); process.exit(1); }

let chromium, exe;
try {
  ({ chromium } = await import('playwright-core'));
  for (const bin of [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean))
    if (fs.existsSync(bin)) { exe = bin; break; }
} catch {}
if (!exe){ console.error('art-critic needs Chrome for screenshots — set CHROME_BIN or install Chrome'); process.exit(1); }

const report = [];
let flagged = 0;
for (const slug of slugs){
  try {
    const shots = await screenshot(slug, chromium, exe);
    const r = await critiqueWithRetry(shots, MIN, slug);
    const bad = r.verdict === 'flag' || r.score < MIN;
    if (bad) flagged++;
    report.push({ slug, ...r, flagged: bad, at: new Date().toISOString() });
    const mob = (r.mobileIssues || []).length;
    console.log(`${bad ? '🚩' : '🎨'} ${slug}  ${r.score}/10${(r.issues||[]).length ? '  — ' + r.issues.slice(0, 2).join(' · ') : ''}${mob ? `  · 📱 ${mob} mobile issue${mob > 1 ? 's' : ''}` : ''}`);
  } catch (e) {
    // fail closed: a site the critic could not judge is a FLAGGED site,
    // never a silently passed one
    flagged++;
    report.push({ slug, error: String(e.message || e).slice(0, 120), flagged: true, at: new Date().toISOString() });
    console.log(`🚩 ${slug} — critic failed after retry, counting as flagged: ${String(e.message || e).slice(0, 90)}`);
  }
}
fs.mkdirSync(path.join(ROOT, 'engine/preview'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'engine/preview/critic-report.json'), JSON.stringify(report, null, 2));
console.log(`\nART CRITIC: ${slugs.length - flagged}/${slugs.length} at or above ${MIN}/10 · report: engine/preview/critic-report.json`);
process.exit(flagged ? 1 : 0);
