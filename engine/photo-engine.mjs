// ─────────────────────────────────────────────────────────────────────────────
// Photo engine — art direction for generated sites.
//
// Tiering (honesty-first):
//   1. The prospect's own captured photos (capture.mjs grades dims + dedupes).
//   2. Curated per-vertical stock from assets/stock/ — used ONLY for ambience
//      slots (hero background, feature split, about band). Never in the
//      gallery grid, which stays captured-only so a demo never passes stock
//      off as "their photos".
//   3. The designed brand-gradient poster (site-engine .hero.no-img) if even
//      stock is missing.
//
// Expanding the library: drop more <prefix>-N.webp files into assets/stock/
// (landscape, ≥1600px wide, WebP ~200KB) and they're picked up automatically.
// Credit sources in assets/stock/CREDITS.md.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Repo root resolved from THIS module (matches llm-extract.mjs) — resolving
// .sightline.env from process.cwd() made the vision gates silently no-op
// whenever the engine ran from another directory.
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

// pack key → stock file prefix(es). Keys cover BOTH kinds of pack: verticals
// (business) and traditions (congregations). Trades picks a sub-trade by name.
const STOCK_PREFIX = {
  dental: ['dental'],
  medical: ['medical'],
  optometry: ['optometry'],
  medspa: ['medspa'],
  law: ['law'],
  accounting: ['finance'],
  mortgage: ['finance'],
  insurance: ['insurance-title'],
  title: ['insurance-title'],
  childcare: ['childcare'],
  trades: ['hvac-home-services'],          // overridden by sub-trade detection
  // congregation traditions — one honest sanctuary/gathering library serves all
  church: ['church'],
  catholic: ['church'],
  mainline: ['church'],
  contemporary: ['church'],
  // retail/business: too heterogeneous for honest stock — gradient poster instead
};

const TRADE_SUBS = [
  [/landscap|lawn|garden|hardscap|irrigat/i, 'landscaping'],
  [/build|construct|remodel|renovat|bath|kitchen|roof|concrete|fenc/i, 'construction-builder'],
  [/hvac|heat|cool|air|plumb|electric|garage/i, 'hvac-home-services'],
];

// Ordered stock paths (site-relative) for a vertical; [] when no honest match.
export function stockFor(vertical, name = '', ROOT = process.cwd()) {
  let prefixes = STOCK_PREFIX[vertical] || [];
  if (vertical === 'trades') {
    const sub = TRADE_SUBS.find(([re]) => re.test(name));
    prefixes = sub ? [sub[1]] : ['hvac-home-services'];
  }
  if (!prefixes.length) return [];
  const dir = path.join(ROOT, 'assets/stock');
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return []; }
  const out = [];
  for (const pre of prefixes)
    out.push(...files.filter(f => f.startsWith(pre + '-')).sort()
                     .map(f => '/assets/stock/' + f));
  return out;
}



// ── vision hero gate ──────────────────────────────────────────────────────────
// Byte heuristics can't see that a "photo" is really a promo banner with
// "20% OFF" baked into the pixels. One cheap Haiku vision call can. Returns
// true (usable), false (rejected), or null (no key / error → caller keeps it).
export async function heroLooksClean(absPath) {
  let key = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY;
  if (!key) {
    try { key = (fs.readFileSync(path.join(REPO_ROOT, '.sightline.env'), 'utf8')
      .match(/ANTHROPIC(?:_API)?_KEY\s*=\s*(\S+)/) || [])[1]; } catch {}
  }
  if (!key) return null;
  try {
    const sharp = (await import('sharp')).default;
    const buf = await sharp(absPath).resize({ width: 768 }).jpeg({ quality: 75 }).toBuffer();
    const { callAnthropic } = await import('./anthropic.mjs');
    const r = await callAnthropic({ model: 'claude-haiku-4-5', max_tokens: 100, temperature: 0, messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: buf.toString('base64') } },
        { type: 'text', text: 'Is this image suitable as a full-bleed website hero BACKGROUND photo? Answer ONLY minified JSON {"ok":true|false,"why":"..."}. ok=false if it contains baked-in text/headlines/prices/logos/watermarks, is a promo banner/flyer/collage/screenshot, is an extreme face close-up, or is too blurry/low-quality. ok=true for clean photographic scenes (interiors, exteriors, people at a natural distance, landscapes).' },
      ]}] },
      { key, timeoutMs: 30000, label: 'vision-hero', maxAttempts: 2, recordInfra: false });
    if (!r.ok) return null;
    const m = (r.data.content?.[0]?.text || '').match(/\{.*\}/s);
    return m ? !!JSON.parse(m[0]).ok : null;
  } catch { return null; }
}


// ── vision logo gate ─────────────────────────────────────────────────────────
// A captured "logo" is sometimes a vendor badge or partner mark (a title
// company shipping a "BRIDGE" software logo). If the logo's visible text
// clearly belongs to a DIFFERENT brand than the business name, drop it —
// the styled wordmark is better than someone else's mark.
export async function logoMatchesBusiness(absPath, businessName) {
  let key = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY;
  if (!key) {
    try { key = (fs.readFileSync(path.join(REPO_ROOT, '.sightline.env'), 'utf8')
      .match(/ANTHROPIC(?:_API)?_KEY\s*=\s*(\S+)/) || [])[1]; } catch {}
  }
  if (!key) return null;
  try {
    const sharp = (await import('sharp')).default;
    const buf = await sharp(absPath).resize({ width: 400, withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer();
    const { callAnthropic } = await import('./anthropic.mjs');
    const r = await callAnthropic({ model: 'claude-haiku-4-5', max_tokens: 100, temperature: 0, messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: buf.toString('base64') } },
        { type: 'text', text: `This should be the logo of a business named "${businessName}". Answer ONLY minified JSON {"ok":true|false,"seen":"text visible in image"}. ok=false ONLY if the image clearly shows a DIFFERENT company/product name. ok=true if it shows this business's name/initials/monogram, or is a purely graphical mark with no conflicting text.` },
      ]}] },
      { key, timeoutMs: 30000, label: 'vision-logo', maxAttempts: 2, recordInfra: false });
    if (!r.ok) return null;
    const m = (r.data.content?.[0]?.text || '').match(/\{.*\}/s);
    return m ? !!JSON.parse(m[0]).ok : null;
  } catch { return null; }
}

export default { stockFor, heroLooksClean, logoMatchesBusiness };
