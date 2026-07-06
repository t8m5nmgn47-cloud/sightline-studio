// ─────────────────────────────────────────────────────────────────────────────
// Bulk regeneration — reruns the full pipeline over every cached prospect so
// the whole demo portfolio sits on the current engine floor (SEO layer, real
// photos, copy variation, live forms, QA gate).
//
//   node engine/regen.mjs                 # everything in the harvest dirs
//   node engine/regen.mjs --pages         # multi-page sites
//   node engine/regen.mjs --limit 10      # first 10 only
//   node engine/regen.mjs --only dental   # filter by domain substring
//
// Run this on a machine with Chrome installed (rendered capture + rendered QA)
// and ANTHROPIC_API_KEY set if you have one — both optional.
// Each domain runs in a child process so one bad capture can't kill the batch.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['assets/harvest/business', 'assets/harvest/fc', 'assets/harvest/nucleus', 'assets/harvest/competitors'];

const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : null; };
const limit = +flag('limit') || Infinity;
const only = flag('only');

// collect unique domains from the harvest caches
const domains = new Set();
for (const dir of DIRS) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) continue;
  for (const f of fs.readdirSync(full)) {
    if (!f.endsWith('.html')) continue;
    const d = f.replace(/\.html$/, '').replace(/^fc-/, '');
    if (!only || d.includes(only)) domains.add(d);
  }
}

const list = [...domains].slice(0, limit);
console.log(`REGEN: ${list.length} cached prospects${args.includes('--pages') ? ' (multi-page)' : ''}\n`);

const pass = [], fail = [];
let i = 0;
for (const domain of list) {
  i++;
  const extra = args.includes('--pages') ? ['--pages'] : [];
  try {
    execFileSync('node', [path.join(ROOT, 'engine/pipeline.mjs'), domain, ...extra],
      { encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'] });
    pass.push(domain);
    console.log(`  [${i}/${list.length}] ✅ ${domain}`);
  } catch (e) {
    fail.push(domain);
    const out = (e.stdout || '') + (e.stderr || '');
    const reason = (out.match(/✗ [^\n]+/) || [out.trim().split('\n').pop() || 'unknown'])[0];
    console.log(`  [${i}/${list.length}] ❌ ${domain} — ${String(reason).slice(0, 90)}`);
  }
}

console.log(`\nREGEN DONE: ${pass.length} passed · ${fail.length} failed`);
if (fail.length) {
  console.log('failed (inspect demos/<slug>/ and engine/preview/qa-<slug>.json):');
  for (const d of fail) console.log('  · ' + d);
}
process.exit(fail.length ? 1 : 0);
