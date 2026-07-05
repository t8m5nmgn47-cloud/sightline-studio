// ─────────────────────────────────────────────────────────────────────────────
// Nimble bridge — connects the Prospector to your Nimble CRM account.
//
//   node engine/nimble.mjs test              check the API key works
//   node engine/nimble.mjs push [--tier HOT] send prospects into Nimble as
//                                            company records (tag: sightline-prospect)
//                                            so Nimble can enrich them with real
//                                            people, emails & socials
//   node engine/nimble.mjs pull              read enriched contact info back and
//                                            attach it to prospects.json — giving
//                                            every outreach email a real recipient
//
// KEY SETUP (do this once, keep the key out of chat/git):
//   1. Open TextEdit → new file → paste exactly one line:
//        NIMBLE_KEY=your-key-here
//   2. Save it as ".sightline.env" in your sightline-studio folder.
//   (.sightline.env is gitignored — it never leaves your Mac.)
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enrich } from './enrich-prospects.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FILE = path.join(ROOT, 'engine/preview/prospects.json');
const API = 'https://api.nimble.com/api/v1';

// read the key: env var wins, then .sightline.env
function loadKey(){
  if (process.env.NIMBLE_KEY) return process.env.NIMBLE_KEY.trim();
  const f = path.join(ROOT, '.sightline.env');
  if (fs.existsSync(f)){
    const m = fs.readFileSync(f,'utf8').match(/NIMBLE_KEY\s*=\s*(\S+)/);
    if (m) return m[1];
  }
  return null;
}
const KEY = loadKey();
if (!KEY){
  console.log(`No Nimble key found.

Setup (once):
  1. TextEdit → new file with one line:   NIMBLE_KEY=your-key-here
  2. Save as ".sightline.env" inside your sightline-studio folder.
Then run:   node engine/nimble.mjs test`);
  process.exit(0);
}

const H = { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' };
async function api(pathname, opts = {}){
  const res = await fetch(API + pathname, { headers: H, ...opts });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, json, text: text.slice(0, 300) };
}

const cmd = process.argv[2];
const flagv = k => { const i = process.argv.indexOf('--'+k); return i>-1 ? process.argv[i+1] : null; };
const rows = JSON.parse(fs.readFileSync(FILE, 'utf8'));

// ── test ─────────────────────────────────────────────────────────────────────
if (cmd === 'test'){
  const r = await api('/myself/');
  if (r.ok) console.log('✓ Nimble key works — signed in as', r.json?.email || r.json?.username || 'your account');
  else console.log(`✗ Nimble rejected the key (HTTP ${r.status}): ${r.text}\n  Double-check .sightline.env — and that API access is enabled on your Nimble plan.`);
  process.exit(0);
}

// ── push: prospects → Nimble company records ─────────────────────────────────
if (cmd === 'push'){
  const tier = (flagv('tier') || 'HOT,WARM,DEAD').split(',');
  const targets = rows.filter(r => tier.includes(r.tier));
  console.log(`◦ pushing ${targets.length} prospects (${tier.join('/')}) into Nimble…`);
  let ok = 0, fail = 0;
  for (const r of targets){
    const body = JSON.stringify({
      record_type: 'company',
      fields: {
        'company name': [{ value: r.name, modifier: '' }],
        'URL':          [{ value: 'https://' + r.domain, modifier: 'work' }],
        ...(r.phone ? { 'phone': [{ value: r.phone, modifier: 'work' }] } : {}),
        'description':  [{ value: `Sightline prospect · ${r.tier} · score ${r.score}/100 · ${r.tradition} · est $${r.mrr}/mo — ${r.pitch}`, modifier: '' }],
      },
      tags: 'sightline-prospect,' + r.tier.toLowerCase(),
    });
    const res = await api('/contact/', { method: 'POST', body });
    if (res.ok){ ok++; process.stdout.write(`  ✓ ${r.name}\n`); }
    else { fail++; process.stdout.write(`  ✗ ${r.name} (HTTP ${res.status}) ${res.text}\n`); if (fail === 1) console.log('    ↳ if the field names are rejected, run "node engine/nimble.mjs fields" and tell Claude what it prints.'); }
    if (fail >= 3 && ok === 0) { console.log('  stopping — the API shape needs adjusting. Run: node engine/nimble.mjs fields'); break; }
    await new Promise(r => setTimeout(r, 350));
  }
  console.log(`\n✓ ${ok} pushed, ${fail} failed. In Nimble: filter by tag "sightline-prospect", then use Nimble's enrichment to find the owner & email for each.`);
  process.exit(0);
}

// ── fields: discover this account's actual field names (debug helper) ────────
if (cmd === 'fields'){
  const r = await api('/contacts/fields/');
  console.log(r.ok ? JSON.stringify(r.json, null, 2).slice(0, 3000) : `HTTP ${r.status}: ${r.text}`);
  process.exit(0);
}

// ── pull: enriched contacts → prospects.json ─────────────────────────────────
if (cmd === 'pull'){
  console.log('◦ pulling sightline-prospect contacts from Nimble…');
  const q = encodeURIComponent(JSON.stringify({ and: [{ tags: { is: 'sightline-prospect' } }] }));
  const r = await api(`/contacts/?query=${q}&per_page=100&fields=company name,URL,email,phone,first name,last name`);
  if (!r.ok){ console.log(`✗ HTTP ${r.status}: ${r.text}`); process.exit(1); }
  const contacts = r.json?.resources || [];
  console.log(`◦ Nimble returned ${contacts.length} matching records`);
  const byDomain = new Map();
  for (const c of contacts){
    const f = c.fields || {};
    const url = (f['URL'] || f['url'] || [])[0]?.value || '';
    const dom = url.replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/.*$/,'');
    if (!dom) continue;
    byDomain.set(dom, {
      person: [((f['first name']||[])[0]?.value), ((f['last name']||[])[0]?.value)].filter(Boolean).join(' ') || null,
      email:  (f['email'] || [])[0]?.value || null,
      phone:  (f['phone'] || [])[0]?.value || null,
      nimbleId: c.id,
    });
  }
  let matched = 0;
  for (const row of rows){
    const c = byDomain.get(row.domain);
    if (c && (c.email || c.phone || c.person)){ row.contact = { ...c, source: 'nimble', at: new Date().toISOString().slice(0,10) }; matched++; }
  }
  enrich(rows);
  fs.writeFileSync(FILE, JSON.stringify(rows, null, 2));
  console.log(`✓ contact info attached to ${matched} prospects — outreach emails now have real recipients. Commit prospects.json to publish.`);
  process.exit(0);
}

console.log('usage: node engine/nimble.mjs test | push [--tier HOT,WARM] | pull | fields');
