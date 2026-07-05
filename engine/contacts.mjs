// ─────────────────────────────────────────────────────────────────────────────
// Contact backfill — free, no API keys. Visits each prospect's own website
// (homepage + contact page) and pulls the email, phone and social links they
// publish themselves. Attaches them to prospects.json so outreach emails have
// a real recipient.
//
//   node engine/contacts.mjs                  (all prospects missing contact info)
//   node engine/contacts.mjs --all            (refresh everyone)
//   node engine/contacts.mjs --max 20
//
// Sources that need accounts (Nimble enrichment, Google Places) layer on top —
// this gets the free 60-70% first.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'node:url';
import { extractFacts } from './capture.mjs';
import { enrich } from './enrich-prospects.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FILE = path.join(ROOT, 'engine/preview/prospects.json');
const UA = { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36' }, redirect: 'follow' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const args = process.argv.slice(2);
const all = args.includes('--all');
const MAX = +(args[args.indexOf('--max')+1] || 60);

async function page(url){
  try {
    const ac = new AbortController(); const t = setTimeout(()=>ac.abort(), 12000);
    const res = await fetch(url, { ...UA, signal: ac.signal });
    clearTimeout(t);
    return res.ok ? await res.text() : null;
  } catch { return null; }
}

// find a REAL published email. Only de-obfuscate explicit "[at]"/"(at)"
// patterns — never bare words (that turns "navigator" into an email).
const EMAIL_RE = /\b[A-Z0-9._%+-]{1,30}@[A-Z0-9.-]{2,60}\.[A-Z]{2,10}\b/gi;
const JUNK_EMAIL = /wixstatic|wixpress|sentry|example\.|schema\.org|w3\.org|@2x|\.(png|jpg|jpeg|gif|webp|svg|css|js)$|^(u00|x2|0x)|noreply|no-reply|mailer-daemon|@(sentry|githubusercontent|cloudfront)|^(user|your ?name|name|email|test|someone|john(\.doe)?|jane(\.doe)?)@|@(domain|example|email|test|yourdomain|website)\./i;
function textEmail(html, domain){
  const deob = html
    .replace(/\[\s*(at|@)\s*\]|\(\s*(at|@)\s*\)/gi, '@')
    .replace(/\[\s*dot\s*\]|\(\s*dot\s*\)/gi, '.');
  const cands = [...new Set((deob.match(EMAIL_RE) || []).map(e=>e.toLowerCase()))]
    .filter(e => !JUNK_EMAIL.test(e));
  if (!cands.length) return null;
  // prefer an address at their own domain, then classic inbox names
  const own = cands.find(e => e.endsWith('@'+domain) || e.endsWith('.'+domain));
  if (own) return own;
  const classic = cands.find(e => /^(info|office|hello|contact|admin|frontdesk|smile|team)@/.test(e));
  return classic || cands[0];
}

const rows = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const targets = rows.filter(r => all || !(r.contact?.email || r.contact?.phone)).slice(0, MAX);
console.log(`◦ hunting published contact info for ${targets.length} prospects…`);

let got = 0;
for (const r of targets){
  process.stdout.write(`  ${r.domain.padEnd(36)}`);
  const home = await page('https://' + r.domain);
  if (!home){ console.log('unreachable'); continue; }
  const $home = cheerio.load(home);
  const pages = [$home];
  // find their contact page and read it too — that's where the email usually is
  let contactHref = null;
  $home('a[href]').each((_, el) => {
    const h = (el.attribs||{}).href || '';
    if (!contactHref && /contact/i.test(h) && !/^(mailto|tel|#)/.test(h)) contactHref = h;
  });
  if (contactHref){
    try {
      const cu = new URL(contactHref, 'https://' + r.domain).href;
      const ch = await page(cu);
      if (ch) pages.push(cheerio.load(ch));
    } catch {}
  }
  const facts = extractFacts(pages);
  const mailto = facts.email && !JUNK_EMAIL.test(facts.email) ? facts.email.toLowerCase() : null;
  const email = mailto || textEmail(home, r.domain);
  const phone = facts.phone || r.phone || null;
  if (email || phone){
    r.contact = { ...(r.contact||{}), email: email || r.contact?.email || null, phone, socials: facts.socials,
      source: 'their website', at: new Date().toISOString().slice(0,10) };
    got++;
    console.log([email, phone].filter(Boolean).join(' · '));
  } else console.log('nothing published');
  await sleep(400);
}

enrich(rows);
fs.writeFileSync(FILE, JSON.stringify(rows, null, 2));
console.log(`\n✓ contact info found for ${got}/${targets.length} — commit prospects.json to publish.`);
