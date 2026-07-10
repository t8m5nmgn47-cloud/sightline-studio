import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { creativeGate } from './creative-gate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['engine/pipeline.mjs', 'engine/site-strategy.mjs', 'engine/creative-gate.mjs'];
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
  capture:{ pages:[{url:'https://x.com'},{url:'https://x.com/about'},{url:'https://x.com/services'}], jsShell:false, copy:{serviceDetails:[{h:'a',p:'b'},{h:'c',p:'d'},{h:'e',p:'f'}]} },
});
if (!strong.pass) {
  failed = true;
  console.error('✗ policy: strong fixture should pass');
  strong.fails.forEach(x=>console.error('  - '+x));
} else console.log(`✓ policy: strong fixture passed (${strong.score}/100)`);

if (failed) process.exit(1);
console.log('\nEngine v7 self-test passed.');
