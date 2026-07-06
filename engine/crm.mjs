// ─────────────────────────────────────────────────────────────────────────────
// Prospect CRM — set status/notes that survive every prospector re-run.
//
//   node engine/crm.mjs list [status]                 # pipeline view
//   node engine/crm.mjs set <domain> <status> [note]  # new|contacted|demo-sent|won|lost
//   node engine/crm.mjs note <domain> <note…>
//
// State lives in engine/preview/prospect-state.json (local file, no services).
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE = path.join(ROOT, 'engine/preview/prospect-state.json');
const STATUSES = ['new', 'contacted', 'demo-sent', 'won', 'lost'];

const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 1));

const [cmd, domain, ...rest] = process.argv.slice(2);

if (cmd === 'set') {
  const status = rest[0];
  if (!state[domain]) state[domain] = { status: 'new', notes: '', history: [] };
  if (!STATUSES.includes(status)) { console.error('status must be one of: ' + STATUSES.join(', ')); process.exit(1); }
  state[domain].status = status;
  state[domain].statusAt = new Date().toISOString().slice(0, 10);
  if (rest.length > 1) state[domain].notes = rest.slice(1).join(' ');
  save();
  console.log(`✓ ${domain} → ${status}${state[domain].notes ? '  ("' + state[domain].notes + '")' : ''}`);
} else if (cmd === 'note') {
  if (!state[domain]) state[domain] = { status: 'new', notes: '', history: [] };
  state[domain].notes = rest.join(' ');
  save();
  console.log(`✓ note saved for ${domain}`);
} else if (cmd === 'list') {
  const filter = domain;                                  // optional status filter
  const rows = Object.entries(state)
    .filter(([, s]) => !filter || s.status === filter)
    .sort((a, b) => STATUSES.indexOf(a[1].status) - STATUSES.indexOf(b[1].status));
  if (!rows.length) { console.log('no prospects' + (filter ? ` with status "${filter}"` : '') + ' — run engine/prospector.mjs first'); process.exit(0); }
  const counts = {};
  for (const [d, s] of rows) {
    counts[s.status] = (counts[s.status] || 0) + 1;
    const score = s.history?.length ? s.history[s.history.length - 1].score : '–';
    console.log(`  [${s.status.padEnd(9)}] ${String(score).padStart(3)}  ${d.padEnd(32)}${s.statusAt ? ' since ' + s.statusAt : ''}${s.notes ? '  — ' + s.notes : ''}`);
  }
  console.log('\n  ' + Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' · '));
} else {
  console.log('usage:\n  node engine/crm.mjs list [status]\n  node engine/crm.mjs set <domain> <new|contacted|demo-sent|won|lost> [note]\n  node engine/crm.mjs note <domain> <note…>');
}
