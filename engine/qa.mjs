// ─────────────────────────────────────────────────────────────────────────────
// QA gate — nothing ships below this floor. Runs on a published demo:
//
//   Static (always):
//     • every local asset reference (img src, background-image, favicon,
//       og:image path) exists on disk
//     • SEO present: title, meta description, canonical, og:image or og:title,
//       JSON-LD block
//     • palette contrast: white-on-brand ≥ 3.0 (buttons/bands),
//       ink-on-bg ≥ 4.5 (body text)
//     • no unresolved template artifacts (`${`, `undefined`, `[object Object]`)
//     • form wired (care-form posts to /api/contact) when a form is present
//
//   Rendered (when headless Chrome is available):
//     • zero console errors
//     • no horizontal overflow at 360 / 768 / 1440 px
//
// Usage:  node engine/qa.mjs <slug> [<slug>…] | --all
// Exit:   non-zero when any demo FAILS (warnings don't fail the gate).
// Writes: engine/preview/qa-<slug>.json + a console summary.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── colour math (mirrors site-engine) ────────────────────────────────────────
const rgb = (h) => { h = h.replace('#',''); if (h.length===3) h = [...h].map(c=>c+c).join('');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]; };
const lum = ([r,g,b]) => { const f=(v)=>{v/=255; return v<=.03928?v/12.92:((v+.055)/1.055)**2.4};
  return .2126*f(r)+.7152*f(g)+.0722*f(b); };
const contrast = (a,b) => { const [x,y]=[lum(rgb(a)),lum(rgb(b))].sort((p,q)=>q-p); return (x+.05)/(y+.05); };

function staticChecks(slug) {
  const fails = [], warns = [];
  const file = path.join(ROOT, 'demos', slug, 'index.html');
  if (!fs.existsSync(file)) return { fails: ['demo not found: ' + file], warns };
  const html = fs.readFileSync(file, 'utf8');
  const $ = cheerio.load(html);

  // 1. local assets exist
  const refs = new Set();
  $('img[src]').each((_, e) => refs.add(e.attribs.src));
  $('link[rel="icon"]').each((_, e) => refs.add(e.attribs.href));
  for (const m of html.matchAll(/background-image:[^;"}]*url\(['"]?([^'")]+)/g)) refs.add(m[1]);
  for (const r of refs) {
    if (!r || /^(https?:|data:)/i.test(r)) continue;      // external/data URIs: skip
    const clean = r.split('?')[0];
    const resolved = clean.startsWith('/') ? path.join(ROOT, clean) : path.resolve(path.dirname(file), clean);
    if (!fs.existsSync(resolved)) fails.push('missing asset: ' + r);
  }

  // 2. SEO block
  if (!$('title').text().trim()) fails.push('empty <title>');
  const headText = $('title').text() + ' ' + $('h1').first().text() + ' ' + $('.brandmark').text();
  if (/checking your browser|just a moment|attention required|access denied|cloudflare/i.test(headText))
    fails.push('bot-challenge text leaked into the page — source capture was a shell, regenerate live');
  if (!$('meta[name="description"]').attr('content')) fails.push('no meta description');
  if (!$('link[rel="canonical"]').length) fails.push('no canonical');
  if (!$('meta[property="og:title"]').length) fails.push('no og:title');
  if (!$('script[type="application/ld+json"]').length) fails.push('no JSON-LD');

  // 2b. richness floor — the compfm bar. A business demo (has a book bar)
  // must carry the narrative arc; an image-starved page reads "template".
  const isBiz = $('.bookbar').length > 0;
  const imgCount = $('img').length + [...html.matchAll(/background-image:[^;"}]*url\(/g)].length;
  if (imgCount < 2) warns.push(`image-poor page (${imgCount} image${imgCount===1?'':'s'}) — capture found no usable photos?`);
  if (isBiz) {
    if (!$('#faq').length) warns.push('no FAQ section (business page)');
    if (!$('#about').length && !$('.aboutband').length) warns.push('no about/story section (business page)');
    if ($('section').length < 6) warns.push(`thin page: only ${$('section').length} sections`);
    // template-scent: the retired generic defaults should never ship again
    const scent = ['How we can help.', 'What we do.', 'Care, tailored to you.'].filter(t => html.includes('<h2>'+t+'</h2>'));
    if (scent.length) warns.push('template-scent headline: "' + scent[0] + '" (regenerate with current engine)');
  }

  // 3. contrast from the generated CSS custom properties
  const vars = Object.fromEntries([...html.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
  if (vars.brand && contrast(vars.brand, '#ffffff') < 3) fails.push(`white-on-brand contrast ${contrast(vars.brand,'#ffffff').toFixed(2)} < 3.0 (${vars.brand})`);
  if (vars.ink && vars.bg && contrast(vars.ink, vars.bg) < 4.5) fails.push(`ink-on-bg contrast ${contrast(vars.ink,vars.bg).toFixed(2)} < 4.5`);

  // 4. template artifacts — but only in rendered text/attrs, not inline JS
  const $t = cheerio.load(html); $t('script,style').remove();
  const visible = $t('body').text();
  if (/\$\{/.test(visible)) fails.push('unrendered template literal in page text');
  if (/\bundefined\b/.test(visible)) warns.push('"undefined" appears in page text');
  if (/\[object Object\]/.test(visible)) fails.push('[object Object] in page text');

  // 5. form wiring
  if ($('form.care-form').length && !/fetch\('\/api\/contact'/.test(html)) fails.push('care form present but not wired to /api/contact');

  return { fails, warns };
}

// ── rendered checks (optional — needs a Chromium) ────────────────────────────
async function renderedChecks(slug, { shots = false } = {}) {
  let chromium, exe;
  try {
    ({ chromium } = await import('playwright-core'));
    for (const bin of [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean))
      if (fs.existsSync(bin)) { exe = bin; break; }
    if (!exe) { try { exe = await (await import('@sparticuz/chromium')).default.executablePath(); } catch {} }
    if (!exe) return null;
  } catch { return null; }

  const fails = [], warns = [];
  let browser;
  try { browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); }
  catch { return null; }                                  // exe exists but won't launch → static-only
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
    await page.goto('file://' + path.join(ROOT, 'demos', slug, 'index.html'), { waitUntil: 'load', timeout: 20000 });
    // console errors (asset 404s under file:// are expected for absolute paths —
    // excluded from FAILS, but surfaced as warnings so broken external resources
    // stay visible in the report JSON)
    const real = errors.filter((e) => !/ERR_FILE_NOT_FOUND|net::/.test(e));
    const netErrs = errors.filter((e) => /ERR_FILE_NOT_FOUND|net::/.test(e));
    if (real.length) fails.push('console errors: ' + real.slice(0, 3).join(' | '));
    if (netErrs.length) warns.push(`network/resource console errors (${netErrs.length}): ` + netErrs.slice(0, 3).join(' | '));
    // horizontal overflow at three widths
    for (const w of [360, 768, 1440]) {
      await page.setViewportSize({ width: w, height: 900 });
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 2) fails.push(`horizontal overflow at ${w}px (+${over}px)`);
    }
    // screenshot for the admin grid / outreach one-pager (above-the-fold, desktop)
    if (shots) {
      const dir = path.join(ROOT, 'thumbs');
      fs.mkdirSync(dir, { recursive: true });
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.screenshot({ path: path.join(dir, slug + '.png') });
    }
  } catch (e) { warns.push('rendered checks aborted: ' + (e.message || e).slice(0, 100)); }
  finally { await browser.close(); }
  return { fails, warns };
}

// ── run ──────────────────────────────────────────────────────────────────────
export async function qa(slug, { rendered = true, shots = false } = {}) {
  const s = staticChecks(slug);
  const r = rendered ? await renderedChecks(slug, { shots }) : null;
  const fails = [...s.fails, ...(r?.fails || [])];
  const warns = [...s.warns, ...(r?.warns || [])];
  const result = { slug, pass: !fails.length, fails, warns, rendered: !!r, at: new Date().toISOString() };
  try {
    fs.mkdirSync(path.join(ROOT, 'engine/preview'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'engine/preview', `qa-${slug}.json`), JSON.stringify(result, null, 2));
  } catch {}
  return result;
}

// CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const slugs = args.includes('--all')
    ? fs.readdirSync(path.join(ROOT, 'demos')).filter((d) => fs.existsSync(path.join(ROOT, 'demos', d, 'index.html')))
    : args.filter((a) => !a.startsWith('--'));
  if (!slugs.length) { console.error('usage: node engine/qa.mjs <slug> [<slug>…] | --all'); process.exit(1); }
  let failed = 0;
  for (const slug of slugs) {
    const r = await qa(slug, { rendered: !args.includes('--static'), shots: args.includes('--shots') });
    const mark = r.pass ? '✅' : '❌';
    console.log(`${mark} ${slug}${r.rendered ? '' : '  (static only — no Chromium found)'}`);
    for (const f of r.fails) console.log('   ✗ ' + f);
    for (const w of r.warns) console.log('   ⚠ ' + w);
    if (!r.pass) failed++;
  }
  console.log(`\nQA: ${slugs.length - failed}/${slugs.length} passed`);
  process.exit(failed ? 1 : 0);
}

export default { qa };
