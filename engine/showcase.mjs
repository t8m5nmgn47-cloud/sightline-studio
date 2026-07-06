// ─────────────────────────────────────────────────────────────────────────────
// Showcase mode — keeps real client names OFF public marketing pages until the
// client has signed consent to be featured.
//
// Rewrites the card titles on the homepage ("our work") and /gallery so each
// reads as a generic, non-identifying label built from its trade + town
// (e.g. "Lone Tree Law Firm") instead of the real business name. The real name
// is preserved in a data-real="" attribute, so:
//   • it's never lost,
//   • re-running is safe (idempotent),
//   • adding a slug to showcase-consent.json restores that client's real name.
//
// The prospect's own preview pages (/slug/, /p/slug/) still show their real
// name — those are sent privately to them, not public portfolio.
//
//   node engine/showcase.mjs            apply (generic for all un-consented)
//   node engine/showcase.mjs --status   list what's generic vs real
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FILES = ['index.html', 'gallery/index.html'];
const CONSENT = path.join(ROOT, 'engine/showcase-consent.json');
const consented = new Set((JSON.parse(fs.readFileSync(CONSENT,'utf8')).consented) || []);
const statusOnly = process.argv.includes('--status');

// trade word (from the "Vert · Town" line) → a generic, honest business noun
const NOUN = [
  [/legal|law/i,'Law Firm'], [/dental|dentist/i,'Dental Practice'], [/optometr|eye/i,'Eye Care'],
  [/medical|medicine|clinic|family med/i,'Medical Practice'], [/med ?spa|aesthetic/i,'Med Spa'],
  [/title|escrow/i,'Title & Escrow'], [/mortgage|lending|loan/i,'Mortgage Co.'],
  [/account|cpa|tax|bookkeep/i,'CPA Firm'], [/insurance/i,'Insurance Agency'],
  [/landscap|lawn/i,'Landscaping Co.'], [/hvac|heating|cooling|plumb|roof|electric|contractor|remodel|construction|trades/i,'Home Services'],
  [/montessori|childcare|preschool|daycare|learning|school/i,'Learning Center'],
  [/church|ministry|worship|congregation|faith|parish/i,'Community Church'],
];
const genericFrom = (vert) => {
  const [tradeRaw, townRaw] = String(vert).split('·').map(s=>s.trim());
  const town = townRaw || '';
  const noun = (NOUN.find(([re])=>re.test(tradeRaw))||[null,'Local Business'])[1];
  return (town ? town + ' ' : '') + noun;
};

const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const unesc = s => s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"');

let changed = 0; const report = [];
for (const rel of FILES){
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) continue;
  let html = fs.readFileSync(fp,'utf8');

  // process each showcase anchor card independently
  html = html.replace(/<a\s+class="(?:w?card)[^"]*"[^>]*href="\/([a-z0-9-]+)\/"[\s\S]*?<\/a>/g, (block, slug) => {
    // the trade·town line: class wv (homepage) or card-vert (gallery)
    const vm = block.match(/class="(?:wv|card-vert)"[^>]*>([^<]+)</);
    const vert = vm ? vm[1].replace(/&amp;/g,'&').trim() : '';
    // the title h3 (may already carry data-real from a prior run)
    return block.replace(/<h3([^>]*)>([\s\S]*?)<\/h3>/, (h3, attrs, inner) => {
      const realAttr = (attrs.match(/data-real="([^"]*)"/)||[])[1];
      const realName = unesc((realAttr != null ? realAttr : inner).trim());
      const wantReal = consented.has(slug);
      const shown = wantReal ? realName : genericFrom(vert);
      report.push({ file: rel, slug, vert, real: realName, shown, mode: wantReal?'REAL (consented)':'generic' });
      if (statusOnly) return h3;   // don't modify
      changed++;
      // always keep data-real so nothing is lost and reruns stay idempotent
      return `<h3 data-real="${esc(realName)}">${esc(shown)}</h3>`;
    });
  });

  if (!statusOnly) fs.writeFileSync(fp, html);
}

if (statusOnly){
  console.log(`Showcase status — ${report.length} public cards:\n`);
  for (const r of report) console.log(`  [${r.mode==='generic'?'generic':'REAL   '}] ${r.slug.padEnd(28)} shows "${r.shown}"${r.mode==='generic'?`  (real: ${r.real})`:''}`);
  console.log(`\n${report.filter(r=>r.mode!=='generic').length} shown by real name (consented) · ${report.filter(r=>r.mode==='generic').length} generic.`);
} else {
  console.log(`✓ showcase applied — ${report.filter(r=>r.mode==='generic').length} cards generic, ${report.filter(r=>r.mode!=='generic').length} real (consented). ${changed} titles written.`);
  console.log('  Grant consent: add the slug to engine/showcase-consent.json, then rerun this. Commit the HTML to publish.');
}
