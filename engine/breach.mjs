// ─────────────────────────────────────────────────────────────────────────────
// Breach-exposure intelligence — the fourth signal layer.
//
// Checks each prospect against the Have I Been Pwned database, staying strictly
// on the "public information only" side of the line:
//   • DOMAIN check (free, no key): was the business's own website/service ever
//     part of a known breach? Uses HIBP's public breach catalogue.
//   • ROLE-EMAIL check (needs a key): does the business's OWN PUBLISHED address
//     (info@ / office@ — the one they print on their own site) show up in known
//     breaches? These are company addresses the business chose to make public,
//     never a person's private inbox.
//
// It never touches owner/staff personal emails, never logs in, never guesses
// addresses — only the domain and the address the business itself published.
//
// KEY (optional, unlocks the role-email check):
//   Add to .sightline.env (gitignored, stays on your Mac):
//     HIBP_KEY=your-haveibeenpwned-api-key
//   (haveibeenpwned.com/API/Key — ~$4/mo, thousands of lookups.)
//
//   node engine/breach.mjs                 check everyone
//   node engine/breach.mjs --only-missing
//   node engine/breach.mjs --max 20
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enrich } from './enrich-prospects.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FILE = path.join(ROOT, 'engine/preview/prospects.json');
const HIBP = 'https://haveibeenpwned.com/api/v3';
const UA = 'SightlineStudio-ExposureCheck/1.0';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadKey(){
  if (process.env.HIBP_KEY) return process.env.HIBP_KEY.trim();
  const f = path.join(ROOT, '.sightline.env');
  if (fs.existsSync(f)){ const m = fs.readFileSync(f,'utf8').match(/HIBP_KEY\s*=\s*(\S+)/); if (m) return m[1]; }
  return null;
}
const KEY = loadKey();

const args = process.argv.slice(2);
const onlyMissing = args.includes('--only-missing');
const MAX = +(args[args.indexOf('--max')+1] || 60);

// ── free: the public breach catalogue (all known breaches + their domains) ───
async function loadBreachCatalogue(){
  const res = await fetch(`${HIBP}/breaches`, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error('HIBP breaches list failed: ' + res.status);
  const all = await res.json();
  const byDomain = new Map();
  for (const b of all){
    if (!b.Domain) continue;
    byDomain.set(b.Domain.toLowerCase(), b);
  }
  return byDomain;
}

// ── keyed: is this published address in any breach? ──────────────────────────
async function accountBreaches(email){
  const res = await fetch(`${HIBP}/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`, {
    headers: { 'user-agent': UA, 'hibp-api-key': KEY },
  });
  if (res.status === 404) return [];               // clean — not in any breach
  if (res.status === 429){ await sleep(2500); return accountBreaches(email); } // rate limited: back off
  if (!res.ok) return null;                        // unknown error — don't claim anything
  return await res.json();
}

const rows = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const targets = rows.filter(r => onlyMissing ? !r.breach : true).slice(0, MAX);

console.log('◦ loading the public breach catalogue…');
let catalogue;
try { catalogue = await loadBreachCatalogue(); }
catch (e){ console.error('✗ could not reach HIBP:', e.message); process.exit(1); }
console.log(`◦ ${catalogue.size} breached domains known · checking ${targets.length} prospects${KEY ? ' (domain + published email)' : ' (domain only — add HIBP_KEY for the email check)'}…`);

let flagged = 0;
for (const r of targets){
  const line = `  ${r.domain.padEnd(34)}`;
  const exposures = [];

  // 1) free domain check
  const dom = catalogue.get(r.domain);
  if (dom) exposures.push({ name: dom.Name, title: dom.Title, year: (dom.BreachDate||'').slice(0,4), via: 'domain', dataClasses: dom.DataClasses || [] });

  // 2) keyed published-email check (their own info@/office@ etc.)
  const email = r.contact?.email;
  if (KEY && email){
    const list = await accountBreaches(email);
    if (Array.isArray(list)){
      for (const b of list) exposures.push({ name: b.Name, title: b.Title, year: (b.BreachDate||'').slice(0,4), via: 'published email', dataClasses: b.DataClasses || [] });
    }
    await sleep(1600); // HIBP cheapest tier: ~1 req / 1.5s
  }

  if (exposures.length){
    // de-dupe by breach name, newest-worst first
    const uniq = [...new Map(exposures.map(e=>[e.name, e])).values()].sort((a,b)=> (b.year||'').localeCompare(a.year||''));
    const hasCreds = uniq.some(e => (e.dataClasses||[]).some(d => /password/i.test(d)));
    r.breach = {
      count: uniq.length,
      hasPasswords: hasCreds,
      checkedEmail: KEY ? (email || null) : null,
      exposures: uniq.slice(0, 6).map(e => ({ title: e.title, year: e.year, via: e.via, leaked: (e.dataClasses||[]).slice(0,4) })),
      at: new Date().toISOString().slice(0,10),
    };
    flagged++;
    console.log(line + `⚠ ${uniq.length} breach${uniq.length>1?'es':''}${hasCreds?' (incl. passwords)':''}`);
  } else {
    r.breach = { count: 0, checkedEmail: KEY ? (email || null) : null, at: new Date().toISOString().slice(0,10) };
    console.log(line + (KEY && email ? 'clean' : 'domain clean'));
  }
}

enrich(rows);
fs.writeFileSync(FILE, JSON.stringify(rows, null, 2));
console.log(`\n✓ breach check done — ${flagged}/${targets.length} prospects have exposure. Commit prospects.json to publish.`);
if (!KEY) console.log('  Tip: add HIBP_KEY to .sightline.env to also check each business\'s published email — that\'s where the real exposure usually is.');
