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
const hex = ([r,g,b]) => '#' + [r,g,b].map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
// `color-mix(in srgb, A p%, B)` — the engine's own tint/shade primitive.
const mix = (a, b, p) => hex(rgb(a).map((v,i)=>v*(p/100) + rgb(b)[i]*(1-p/100)));
// a translucent text colour composited over the ground it is declared on: the
// colour a reader's eye actually receives, which is what AA is about.
const over = (fg, alpha, bg) => hex(rgb(fg).map((v,i)=>v*alpha + rgb(bg)[i]*(1-alpha)));

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
    if (!$('#about').length) warns.push('no about/story section (business page)');
    if ($('section').length < 6) warns.push(`thin page: only ${$('section').length} sections`);
    // template-scent: the retired generic defaults should never ship again
    const scent = ['How we can help.', 'What we do.', 'Care, tailored to you.'].filter(t => html.includes('<h2>'+t+'</h2>'));
    if (scent.length) warns.push('template-scent headline: "' + scent[0] + '" (regenerate with current engine)');
  }

  // 3. contrast from the generated CSS custom properties
  const vars = Object.fromEntries([...html.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
  if (vars.brand && contrast(vars.brand, '#ffffff') < 3) fails.push(`white-on-brand contrast ${contrast(vars.brand,'#ffffff').toFixed(2)} < 3.0 (${vars.brand})`);
  if (vars.ink && vars.bg && contrast(vars.ink, vars.bg) < 4.5) fails.push(`ink-on-bg contrast ${contrast(vars.ink,vars.bg).toFixed(2)} < 4.5`);

  // 3b. TONE BANDS (design-v8 semantic rhythm). Each tone paints its own ground
  // and declares its own text colours. These checks resolve BOTH sides from the
  // page's real CSS custom properties and the tone rules as written — the
  // ground the band actually paints, against the colours actually set on it.
  // Class order is not guaranteed (the stamper prepends, other passes append),
  // so match the class as a word anywhere in a class attribute.
  const usesTone = (t) => new RegExp(`class="[^"]*\\btone-${t}\\b`).test(html);
  // every declaration block that targets .sec.tone-<t>, concatenated
  const rulesFor = (t) =>
    [...html.matchAll(new RegExp(`\\.sec\\.tone-${t}\\b[^{}]*\\{([^}]*)\\}`, 'g'))].map(m => m[1]).join(';');
  // The alpha of every white the band declares as TEXT — `color:`, not
  // `background:` or `border-color:`, which also take translucent whites and
  // are not read. The white the band really puts down, not the one we assume.
  const whiteAlphas = (t) => {
    const a = [...rulesFor(t).matchAll(/(?:^|[;{])\s*color:\s*rgba\(255,\s*255,\s*255,\s*([\d.]+)\)/g)].map(m => +m[1]);
    return [...new Set([1, ...a.filter(x => x > 0 && x <= 1)])].sort((x, y) => x - y);
  };
  // EVERY `color:` a tone declares, resolved to a hex the eye receives, over the
  // ground that tone paints. The white-alpha reader above only sees translucent
  // whites; a tone also sets derived colours — `color:color-mix(in srgb,
  // var(--accent) 42%,#ffffff)` on .tone-dark's kickers, for one — and those
  // were never measured by anything on this page. Resolve the small grammar the
  // engine actually emits (hex · var(--x) · rgb/rgba · color-mix of the two)
  // and skip what we cannot resolve rather than guessing at it.
  const resolveColor = (raw, ground) => {
    const v = String(raw).trim();
    let m;
    if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v)) return v.length === 4
      ? '#' + [...v.slice(1)].map(c => c + c).join('') : v;
    if ((m = v.match(/^var\(--([\w-]+)\)$/))) return vars[m[1]] || null;
    if ((m = v.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/))) {
      const base = hex([+m[1], +m[2], +m[3]]);
      const a = m[4] === undefined ? 1 : +m[4];
      return a >= 1 ? base : (ground ? over(base, a, ground) : null);
    }
    if ((m = v.match(/^color-mix\(in srgb,\s*(.+?)\s+([\d.]+)%,\s*(.+)\)$/))) {
      const a = resolveColor(m[1], ground), b = resolveColor(m[3], ground);
      return (a && b) ? mix(a, b, +m[2]) : null;
    }
    return null;
  };
  // Heading selectors get the 3.0 large-text floor; everything else 4.5.
  const isHeadingRule = (sel) => /(^|[\s,>])\.sec\.tone-[\w-]+\s+h[1-4]\b/.test(sel)
    || /(^|[\s,>])h[1-4]\b/.test(sel);
  // Every [selector, declarations] pair in the page's CSS, parsed ONCE.
  // Scoped to the <style> blocks on purpose: run over the whole document and
  // this walks megabytes of inlined base64 image data, where a brace-free run
  // that long makes `[^{}]+` backtrack catastrophically — the gate hangs
  // instead of failing, which is strictly worse than not checking. Two rules
  // learned here: anchor on a literal, and never scan the data URIs.
  const styleText = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
  const cssRules = [...styleText.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => [m[1], m[2]]);
  // [selector, declarations] for every rule targeting this tone
  const blocksFor = (t) => cssRules.filter(([sel]) => sel.includes(`.sec.tone-${t}`));
  // The general tone-vs-ground assertion, shared by every tone below: each tone
  // states its own ground and its own text colours, and this measures the pair
  // the tone itself declares rather than restating either side here.
  const checkToneText = (t, ground, label) => {
    for (const [sel, decls] of blocksFor(t)) {
      // A rule that paints its OWN background — the white button, the translucent
      // card — puts its text on that surface, not on the band. Measure against
      // whatever the rule itself lays down, and skip the block entirely when
      // that surface can't be resolved (a gradient, an image) rather than
      // measuring against a ground the text demonstrably does not sit on.
      let bg = ground, bgLabel = label;
      const b = decls.match(/(?:^|;)\s*background(?:-color)?:\s*([^;]+)/);
      if (b) {
        const local = resolveColor(b[1], ground);
        if (!local) continue;
        bg = local; bgLabel = `its own background ${b[1].trim()}`;
      }
      for (const d of decls.matchAll(/(?:^|;)\s*color:\s*([^;]+)/g)) {
        const fg = resolveColor(d[1], bg);
        if (!fg) continue;                       // unresolvable → not guessed at
        const floor = isHeadingRule(sel) ? 3.0 : 4.5;
        const c = contrast(fg, bg);
        if (c < floor) fails.push(
          `tone-${t}: declared text ${d[1].trim()} → ${fg} on ${bgLabel} (${bg}) contrast ${c.toFixed(2)} < ${floor.toFixed(1)}`);
      }
    }
  };

  if (usesTone('dark') && vars.ink) {
    // GROUND: var(--ink). TEXT: #ffffff for headings, plus every translucent
    // white the .tone-dark rules declare (.84 for body, .78 inside cards…).
    // The old check only ever looked at pure white, which is the easiest case
    // on the page and the one that never fails.
    for (const a of whiteAlphas('dark')) {
      const c = contrast(over('#ffffff', a, vars.ink), vars.ink);
      if (c < 4.5) fails.push(`tone-dark: white@${a} on --ink contrast ${c.toFixed(2)} < 4.5 (${vars.ink})`);
    }
    // and it must never fall back to --mut/--accent, both of which are derived
    // against the LIGHT ground and can be invisible on ink
    const darkRules = rulesFor('dark');
    for (const bad of ['var(--mut)', 'color:var(--accent)'])
      if (darkRules.includes(bad)) fails.push(`tone-dark declares ${bad} — light-ground colour on a dark band`);
    // …and every OTHER colour the band declares, including the derived ones the
    // white-alpha reader above is blind to (the accent mixed toward white).
    checkToneText('dark', vars.ink, '--ink');
  }
  if (usesTone('brand') && vars.brand) {
    // GROUND: the .tone-brand gradient — --brand mixed toward near-black, whose
    // LIGHT end is the worst case for white type. Read the mix out of the CSS
    // rather than restating it here, so retuning the gradient retunes the
    // check with it. This is a different colour from --brand itself, which is
    // why the palette check above is not simply repeated.
    const bg = rulesFor('brand')
      .match(/background:linear-gradient\([^;]*?color-mix\(in srgb,\s*var\(--brand\)\s*([\d.]+)%,\s*(#[0-9a-fA-F]{6})\)/);
    const ground = bg ? mix(vars.brand, bg[2], +bg[1]) : mix(vars.brand, '#14161b', 48);
    for (const a of whiteAlphas('brand')) {
      const c = contrast(over('#ffffff', a, ground), ground);
      if (c < 4.5) fails.push(`tone-brand: white@${a} on the band gradient contrast ${c.toFixed(2)} < 4.5 (${ground})`);
    }
    checkToneText('brand', ground, 'the band gradient');
  }
  if (usesTone('tint') && vars.ink && vars.bg) {
    // GROUND: color-mix(in srgb, --ink 4%, --bg) — DARKER than the page ground,
    // so a colour that clears AA on paper can miss it here. Check the body pair
    // and, crucially, the muted pair: --mut on tint measured 3.89 before the
    // .tone-tint override existed, and no check on this page could see it.
    const ground = mix(vars.ink, vars.bg, 4);
    const ci = contrast(vars.ink, ground);
    if (ci < 4.5) fails.push(`tone-tint: --ink on tint contrast ${ci.toFixed(2)} < 4.5 (${ground})`);
    if (vars.mut) {
      // the muted colour AS THE TINT BAND DECLARES IT: read the override's own
      // color-mix out of the CSS rather than assuming a ratio here, so this
      // check keeps measuring the truth if that ratio is ever retuned.
      const m = rulesFor('tint').match(/color:color-mix\(in srgb,\s*var\(--mut\)\s*([\d.]+)%,\s*var\(--ink\)\)/);
      const muted = m ? mix(vars.mut, vars.ink, +m[1]) : vars.mut;
      const cm = contrast(muted, ground);
      if (cm < 4.5) fails.push(`tone-tint: muted text on tint contrast ${cm.toFixed(2)} < 4.5 (${muted} on ${ground})`);
      // --mut is derived against the PAPER ground and reused on it directly by
      // every label the tint override doesn't name. Measure that pair too, so
      // the paper side of the same colour can't rot unnoticed.
      const cp = contrast(vars.mut, vars.bg);
      if (cp < 4.5) fails.push(`--mut on paper contrast ${cp.toFixed(2)} < 4.5 (${vars.mut} on ${vars.bg})`);
    }
    checkToneText('tint', ground, 'the tint ground');
  }
  // PHOTO — per section, not per page. A section that paints its own ground
  // with an inline background-image must scrim it, or white type lands on
  // whatever the photograph happens to be. The old guard asked whether the
  // PAGE contained a scrim anywhere, which any page with a feature band
  // satisfies for free — so it could never fire. Check each match.
  for (const m of html.matchAll(/<section\b[^>]*\bstyle="([^"]*background-image:[^"]*)"[^>]*>/g)) {
    const style = m[1];
    const cls = (m[0].match(/class="([^"]*)"/) || [, ''])[1];
    // A scrim is a gradient layered ON TOP of the photo — in `background-image`
    // shorthand that means it appears BEFORE the url(). Positional rather than
    // a single regex, because the gradients here nest rgba(...) inside
    // gradient(...) and a flat pattern can't bracket-match that.
    const bg = style.slice(style.indexOf('background-image:'));
    const u = bg.indexOf('url(');
    const g = bg.search(/(?:linear|radial)-gradient\(\s*(?:rgba?\(|to |\d)/);
    if (u > -1 && !(g > -1 && g < u))
      fails.push(`photo section paints a background-image with no scrim over it: .${cls.trim().split(/\s+/).filter(c=>c!=='sec'&&!c.startsWith('tone-'))[0] || 'section'}`);
    // A photo section is photo GROUND, and the inline background-image beats any
    // tone class on it. So the class stamped there must be tone-photo: a section
    // wearing tone-tint while painting a photograph is a band that ships heavy
    // and gets audited light, which is precisely how a cadence "fix" that only
    // changed classes passed this gate while the page still stacked two photos.
    if (/\btone-/.test(cls) && !/\btone-photo\b/.test(cls))
      fails.push(`photo-ground section stamped ${(cls.match(/\btone-[\w-]+/)||[])[0]} instead of tone-photo (class="${cls.trim()}")`);
  }

  // 3c. GROUND CADENCE — the composition assertion, read off the built page in
  // page order rather than off the cadence's own bookkeeping. Two heavy grounds
  // touching is a wall of image/ink with the argument buried between them.
  // Ground is taken from what the section PAINTS: an inline background-image is
  // photo ground whatever its class says, then the tone class, then the legacy
  // band classes that untoned (church) pages still use — those pages get no
  // cadence pass at all, which is exactly where an unnoticed pair shipped.
  {
    const HEAVY_GROUND = new Set(['dark', 'brand', 'photo']);
    const bands = [];
    for (const m of html.matchAll(/<(section|header)\b([^>]*)>/g)) {
      const attrs = m[2], cls = (attrs.match(/class="([^"]*)"/) || [, ''])[1];
      // the subpage pagehero is a full-width brand gradient: heavy chrome, and
      // a dark band slammed directly beneath it reads as one tall black box
      if (m[1] === 'header') { if (/\bpagehero\b/.test(cls)) bands.push(['pagehero', 'brand']); continue; }
      // .upgrade is SIGHTLINE's demo-only sales band, appended after the
      // prospect's page has ended and never present on a delivered site. It is
      // chrome in the cadence for that reason (see TONE_CHROME), and it has to
      // be chrome here too — a check and the pass it audits disagreeing about
      // what counts as a band is how the last tone bug hid.
      if (/\bupgrade\b/.test(cls)) continue;
      let ground = /background-image:[^"]*url\(/.test(attrs) ? 'photo'
        : (cls.match(/\btone-(\w+)/) || [, null])[1];
      if (!ground) ground = /\bcta-photo\b/.test(cls) ? 'photo'
        : /\bband\b/.test(cls) ? 'brand' : 'light';
      bands.push([cls.trim().split(/\s+/).filter(c => c !== 'sec')[0] || 'section', ground]);
    }
    for (let i = 1; i < bands.length; i++)
      if (HEAVY_GROUND.has(bands[i - 1][1]) && HEAVY_GROUND.has(bands[i][1]))
        fails.push(`two heavy grounds adjacent: .${bands[i-1][0]} (${bands[i-1][1]}) then .${bands[i][0]} (${bands[i][1]})`);
  }

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
