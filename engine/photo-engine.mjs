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

// vertical → stock file prefix(es). Trades picks a sub-trade by name keywords.
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

export default { stockFor };
