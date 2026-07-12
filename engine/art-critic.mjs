// ─────────────────────────────────────────────────────────────────────────────
// Art critic — the visual QA gate. qa.mjs checks structure; this checks TASTE.
// Screenshots each demo (Chrome required) and asks Claude vision to judge it
// like a design director: color balance, hero legibility, layout coherence,
// overall "would the owner be proud of this?" Flags anything below the bar.
//
//   node engine/art-critic.mjs --all              # every demo in demos/
//   node engine/art-critic.mjs <slug> [<slug>…]   # specific demos
//   node engine/art-critic.mjs --all --min 7      # custom pass threshold
//
// Requires ANTHROPIC_API_KEY (env or .sightline.env). ~1¢/site with Haiku;
// set CRITIC_MODEL for a stronger eye (e.g. claude-sonnet-5).
// Writes engine/preview/critic-report.json; exits non-zero if any site flags.
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
if (!KEY){ console.error('art-critic needs ANTHROPIC_API_KEY (env or .sightline.env)'); process.exit(1); }

const RUBRIC = `You are a demanding design director reviewing a small-business website screenshot (above-the-fold, desktop).
Score 1-10 and be strict. A 7 is "a real business would happily pay for this."

Judge:
1. COLOR: Is brand color used as tasteful accent, or does it flood/tint everything (monochrome wash = automatic ≤4)? Are combinations harmonious?
2. HERO: Is the headline instantly legible? Does imagery look natural (not weirdly tinted/stretched/blurry)? Does copy match the business type shown in the name/logo?
3. LAYOUT: Balanced spacing, aligned elements, nothing overlapping/cut off/cramped?
4. TRUST: Would the owner proudly send this to customers? Does anything look "template-y", broken, or mismatched (e.g. logo brand ≠ site name)?

Reply with ONLY minified JSON: {"score":N,"verdict":"pass"|"flag","issues":["…"],"best":"…"}
verdict "flag" if score < MIN_SCORE or any issue is embarrassing (wrong industry copy, unreadable text, brand/name mismatch, color wash).`;

async function screenshot(slug, chromium, exe){
  const out = path.join(ROOT, 'thumbs', slug + '.png');
  fs.mkdirSync(path.join(ROOT, 'thumbs'), { recursive: true });
  const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    const pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
    await pg.goto('file://' + path.join(ROOT, 'demos', slug, 'index.html'), { waitUntil: 'load', timeout: 20000 });
    await pg.waitForTimeout(700);                       // fonts + first paint settle
    await pg.screenshot({ path: out });
  } finally { await b.close(); }
  return out;
}

async function critique(pngPath, min){
  let sharp = null; try { sharp = (await import('sharp')).default; } catch {}
  const buf = sharp
    ? await sharp(pngPath).resize({ width: 1024 }).jpeg({ quality: 80 }).toBuffer()
    : fs.readFileSync(pngPath);
  const media = sharp ? 'image/jpeg' : 'image/png';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: media, data: buf.toString('base64') } },
      { type: 'text', text: RUBRIC.replace('MIN_SCORE', String(min)) },
    ]}]}),
  });
  if (!res.ok) throw new Error('API ' + res.status + ': ' + (await res.text()).slice(0, 120));
  const j = await res.json();
  const txt = (j.content?.[0]?.text || '').replace(/^[^{]*/, '').replace(/[^}]*$/, '');
  return JSON.parse(txt);
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
if (!exe){ console.error('art-critic needs Chrome for screenshots — run on your Mac'); process.exit(1); }

const report = [];
let flagged = 0;
for (const slug of slugs){
  try {
    const shot = await screenshot(slug, chromium, exe);
    const r = await critique(shot, MIN);
    const bad = r.verdict === 'flag' || r.score < MIN;
    if (bad) flagged++;
    report.push({ slug, ...r, at: new Date().toISOString() });
    console.log(`${bad ? '🚩' : '🎨'} ${slug}  ${r.score}/10${(r.issues||[]).length ? '  — ' + r.issues.slice(0, 2).join(' · ') : ''}`);
  } catch (e) {
    report.push({ slug, error: String(e.message || e).slice(0, 120) });
    console.log(`⚠ ${slug} — ${String(e.message || e).slice(0, 90)}`);
  }
}
fs.mkdirSync(path.join(ROOT, 'engine/preview'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'engine/preview/critic-report.json'), JSON.stringify(report, null, 2));
console.log(`\nART CRITIC: ${slugs.length - flagged}/${slugs.length} at or above ${MIN}/10 · report: engine/preview/critic-report.json`);
process.exit(flagged ? 1 : 0);
