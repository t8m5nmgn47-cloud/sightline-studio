// ─────────────────────────────────────────────────────────────────────────────
// Rescore — live re-verification of the prospect pond. Fetches every
// prospect's site AS IT IS TODAY (headless-Chrome fallback for JS sites),
// re-scores and re-tiers it, and reports every change. Stale captures rot;
// this keeps the pond honest so you never cold-call someone about a "dead"
// site they rebuilt last month.
//
//   node engine/rescore.mjs                 (everyone)
//   node engine/rescore.mjs --tier DEAD,HOT (just those tiers)
//   node engine/rescore.mjs --domain breakthroughchurchsd.com
//
// Preserved across rescores: contact info, demo/funnel links, platform origin.
// Unreachable sites keep their old data but get flagged stale (no email goes
// out for them until they verify).
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreDomain } from './score-prospect.mjs';
import { enrich } from './enrich-prospects.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FILE = path.join(ROOT, 'engine/preview/prospects.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const args = process.argv.slice(2);
const flagv = k => { const i = args.indexOf('--'+k); return i>-1 ? args[i+1] : null; };
const tierFilter = flagv('tier') ? flagv('tier').split(',') : null;
const domainFilter = flagv('domain');

const rows = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const targets = rows.filter(r =>
  domainFilter ? r.domain === domainFilter :
  tierFilter ? tierFilter.includes(r.tier) : true);
console.log(`◦ re-verifying ${targets.length} prospects against their live sites…`);

const changes = [];
let verified = 0, stale = 0;
const { pool } = await import('./score-prospect.mjs');
await pool(targets, 6, async (r) => {
  const fresh = await scoreDomain({ domain: r.domain, hintName: r.name, phone: r.phone }, { churchHint: r.type === 'church' });
  if (!fresh){
    r.stale = true; stale++;
    console.log(`  ${r.domain.padEnd(36)}unreachable — flagged stale (no outreach)`);
    return;
  }
  const before = `${r.tier} ${r.score}`;
  const changedTier = fresh.tier !== r.tier;
  // adopt today's truth; keep identity & pipeline fields we've earned
  Object.assign(r, fresh, {
    platform: r.platform, contact: r.contact, capturedAt: r.capturedAt,
    stale: false, verifiedAt: new Date().toISOString().slice(0,10),
  });
  verified++;
  if (changedTier) changes.push(`${r.name}: ${before} → ${r.tier} ${r.score}`);
  console.log(`  ${r.domain.padEnd(36)}${r.dead?'✕ DEAD':r.score+'/100'} [${r.tier}]${changedTier?'  ← was '+before:''}${fresh.rendered?'  (JS site, browser-rendered)':''}`);
});

enrich(rows);
const order = { DEAD:0, HOT:1, WARM:2, MILD:3, SERVED:4 };
rows.sort((a,b)=> (order[a.tier]-order[b.tier]) || (a.score-b.score));
fs.writeFileSync(FILE, JSON.stringify(rows, null, 2));

console.log(`\n✓ ${verified} re-verified · ${stale} unreachable (flagged, no outreach)`);
if (changes.length){ console.log(`  tier changes (${changes.length}):`); changes.forEach(c=>console.log('   · '+c)); }
else console.log('  no tier changes — the pond was accurate.');
console.log('  Commit prospects.json to publish.');
