import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { creativeGate } from './creative-gate.mjs';
import { isPlaceholderName, looksPlaceholderPage, nameMatchesDomain } from './identity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['engine/pipeline.mjs', 'engine/site-strategy.mjs', 'engine/creative-gate.mjs', 'engine/identity.mjs'];
let failed = false;

for (const file of files) {
  const r = spawnSync(process.execPath, ['--check', path.join(ROOT, file)], { encoding:'utf8' });
  if (r.status !== 0) {
    failed = true;
    console.error(`✗ syntax: ${file}`);
    console.error(r.stderr || r.stdout);
  } else console.log(`✓ syntax: ${file}`);
}

const weak = creativeGate({
  business:true,
  profile:{ hero:{headline:'Welcome',sub:'Great service.'}, sections:{services:{items:[]}}, gallery:[], stock:[] },
  recipe:{ structure:'proof' },
  capture:{ pages:[{url:'https://example.com'}], jsShell:false, copy:{} },
});
if (weak.pass) {
  failed = true;
  console.error('✗ policy: weak fixture should be blocked');
} else console.log(`✓ policy: weak fixture blocked (${weak.fails.length} failures)`);

const strong = creativeGate({
  business:true,
  strategy:{ archetype:'split' },
  profile:{
    hero:{headline:'Clear Answers for Complicated Business Decisions',sub:'Practical counsel for owners navigating transactions, contracts, and the decisions that shape what comes next.'},
    heroImage:'/assets/hero.webp',
    gallery:['/a.webp','/b.webp','/c.webp'], stock:[],
    sections:{
      services:{items:[
        {h:'Transaction Counsel',p:'Plan, negotiate, and close business transactions with practical legal guidance.'},
        {h:'Contract Strategy',p:'Turn commercial terms into agreements that protect the deal and the relationship.'},
        {h:'Outside General Counsel',p:'Get ongoing legal support for the decisions that do not fit into a single matter.'},
      ]},
      about:{body:'The firm works with business owners on transactions, contracts, and ongoing legal decisions. The approach is practical, direct, and built around the commercial outcome behind the legal question.'},
      faq:{items:[
        {q:'What types of businesses do you work with?',a:'The source material identifies privately held businesses and owners as the primary clients.'},
        {q:'Can you help with a transaction from start to finish?',a:'The practice covers planning, negotiation, documentation, and closing support for business transactions.'},
        {q:'Do you offer ongoing counsel?',a:'Yes. The listed services include ongoing outside general counsel support for business decisions and contracts.'},
      ]},
    },
  },
  recipe:{ structure:'story' },
  capture:{
    pages:[{url:'https://x.com'},{url:'https://x.com/about'},{url:'https://x.com/services'}],
    jsShell:false,
    copy:{serviceDetails:[
      {h:'Transaction Counsel',p:'Plan, negotiate, and close business transactions with practical legal guidance.'},
      {h:'Contract Strategy',p:'Turn commercial terms into agreements that protect the deal and the relationship.'},
      {h:'Outside General Counsel',p:'Get ongoing legal support for the decisions that do not fit into a single matter.'},
    ]},
  },
});
if (!strong.pass) {
  failed = true;
  console.error('✗ policy: strong fixture should pass');
  strong.fails.forEach(x=>console.error('  - '+x));
} else console.log(`✓ policy: strong fixture passed (${strong.score}/100)`);

// G0 identity fixtures — placeholder names/pages must never pass as the business
// (castlerockcpa shipped as "Default Web Site Page", hrcoc as "Mysite").
const check = (ok, label) => { if (ok) console.log('✓ identity: ' + label); else { failed = true; console.error('✗ identity: ' + label); } };
for (const n of ['Default Web Site Page', 'Mysite', 'My Site', 'HOME', 'My WordPress Blog', 'Just another WordPress site', 'Untitled Page', 'Site Title', 'IIS Windows Server', 'Welcome to nginx!', 'Coming Soon', ''])
  check(isPlaceholderName(n), `"${n}" is a placeholder name`);
for (const n of ['Castle Rock CPA', 'Highlands Ranch Church of Christ', 'South Denver ENT', 'Mission Hills Church', 'Acacia Dental Group', 'Home Depot Pro', 'Welcome Home Realty'])
  check(!isPlaceholderName(n), `"${n}" is a real name`);
check(looksPlaceholderPage('Default Web Site Page', 'SORRY! If you are the owner of this website, please contact your hosting provider'), 'cPanel default page is a placeholder page');
check(looksPlaceholderPage('Welcome to nginx!', ''), 'nginx welcome page is a placeholder page');
check(looksPlaceholderPage('example.com', 'This domain is for sale. Buy this domain today.'), 'parked domain is a placeholder page');
check(!looksPlaceholderPage('Castle Rock CPA | Tax & Accounting', 'We are coming soon to a new office in Castle Rock. Call us today.'), 'real page mentioning "coming soon" is not a placeholder');
check(nameMatchesDomain('Highlands Ranch Church of Christ', 'hrcoc.org'), 'initialism hrcoc matches Highlands Ranch Church of Christ');
check(!nameMatchesDomain('Carson Wealth', 'wamboltwealth.com'), 'industry word alone still is not identity (G2)');
check(nameMatchesDomain('Castle Rock CPA', 'castlerockcpa.com'), 'Castle Rock CPA matches castlerockcpa.com');

// Captioned link tiles are graphics, not photography (capture.imageSignals).
{
  const { imageSignals } = await import('./capture.mjs');
  let sharp = null; try { sharp = (await import('sharp')).default; } catch {}
  if (sharp) {
    const W = 400, H = 300, px = Buffer.alloc(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      if (y < 225) { px[i] = 60 + (x * 7 + y * 3) % 160; px[i + 1] = 90 + (x * 3 + y * 11) % 120; px[i + 2] = 140 + (x + y * 5) % 100; }
      else { const ink = y > 250 && y < 275 && (x % 14) < 8 && x > 40 && x < 360; px[i] = px[i + 1] = px[i + 2] = ink ? 250 : 44; }
    }
    const tile = await sharp(px, { raw: { width: W, height: H, channels: 3 } }).jpeg().toBuffer();
    const plain = await sharp(px.subarray(0, W * 225 * 3), { raw: { width: W, height: 225, channels: 3 } }).jpeg().toBuffer();
    const a = await imageSignals(tile), b = await imageSignals(plain);
    if (a.captioned && a.graphic) console.log('✓ capture: photo with a baked-in caption strip is a graphic');
    else { failed = true; console.error('✗ capture: captioned tile not flagged ' + JSON.stringify(a)); }
    if (!b.captioned) console.log('✓ capture: the same photo without the strip is not captioned');
    else { failed = true; console.error('✗ capture: plain photo flagged as captioned'); }
  }
}

if (failed) process.exit(1);
console.log('\nEngine v7 self-test passed.');
