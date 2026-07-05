// ─────────────────────────────────────────────────────────────────────────────
// Enrich prospects.json in place — no harvest data needed. Everything is
// recomputed from what each row already stores (dims, score, type, tradition).
//
// Per prospect it adds/refreshes:
//   • benchmark & competitorGaps — peer stats within its category
//   • reviews peer stats — how their Google rating/count compares (when
//     reviews were captured by engine/reviews.mjs)
//   • assets — the built demo (/<slug>/ or /demos/<slug>/), funnel, teardown
//   • opener — the cold-call line
//   • email — the exact, personalized message we send, demo link inside
//
// Run after building demos or capturing prospects:  node engine/enrich-prospects.mjs
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FILE = path.join(ROOT, 'engine/preview/prospects.json');
const SITE = 'https://sightline-studio.vercel.app';
const catLabel = { business: 'businesses', church: 'churches' };

const slugify = d => d.replace(/^www\./,'').replace(/[^a-z0-9]+/gi,'-').toLowerCase();

function resolveAssets(domain){
  const slug = slugify(domain);
  const has = p => fs.existsSync(path.join(ROOT, p, 'index.html'));
  return {
    slug,
    demo:     has(slug)             ? '/'+slug+'/'             : has('demos/'+slug) ? '/demos/'+slug+'/' : null,
    funnel:   has('p/'+slug)        ? '/p/'+slug+'/'           : null,
    teardown: has('teardowns/'+slug)? '/teardowns/'+slug+'/'   : null,
  };
}

export function enrich(rows){
  // ── peer stats per category (score dims + reviews) ─────────────────────────
  const cats = {};
  for (const r of rows){
    const k = r.type+'/'+r.tradition;
    const c = (cats[k] ??= { scores:[], found:{}, n:0, ratings:[], counts:[] });
    c.n++; c.scores.push(r.score);
    (r.dims||[]).forEach(d=>{ c.found[d.l] = (c.found[d.l]||0) + (d.f?1:0); });
    if (r.reviews?.count != null){ c.counts.push(r.reviews.count); if(r.reviews.rating!=null) c.ratings.push(r.reviews.rating); }
  }
  const median = a => { if(!a.length) return null; const s=[...a].sort((x,y)=>x-y); return s[Math.floor(s.length/2)]; };

  for (const r of rows){
    const c = cats[r.type+'/'+r.tradition];
    const avg = Math.round(c.scores.reduce((s,x)=>s+x,0)/c.scores.length);
    const max = Math.max(...c.scores);
    const compGaps = (r.dims||[]).filter(d=>!d.f && (c.found[d.l]/c.n) >= 0.5)
      .map(d=>({ label:d.l, why:d.w, peerPct: Math.round(c.found[d.l]/c.n*100) }))
      .sort((a,b)=>b.peerPct-a.peerPct);
    r.benchmark = { catN:c.n, catLabel:`${r.tradition} ${catLabel[r.type]}`, avg, max, delta:r.score-avg };
    r.competitorGaps = compGaps.slice(0,4);
    r.talkingPoints = (compGaps.length?compGaps:(r.dims||[]).filter(d=>!d.f).map(d=>({label:d.l,why:d.w,peerPct:0}))).slice(0,3);

    // review benchmark (only when reviews were captured for this category)
    const medCount = median(c.counts), medRating = median(c.ratings);
    if (r.reviews?.count != null && medCount != null){
      r.reviews.peerMedianCount = medCount;
      r.reviews.peerMedianRating = medRating;
      r.reviews.weak = r.reviews.count < Math.max(10, medCount*0.4) || (r.reviews.rating!=null && r.reviews.rating < 4);
    }

    // ── the cold-call opener ────────────────────────────────────────────────
    const top = compGaps[0];
    const isBiz = r.type === 'business';
    r.opener = r.dead
      ? `Hi — I was looking up ${r.name} online and your website's actually down / a placeholder. Your ${r.tradition} ${isBiz?'competitors':'neighbors'} all have a real one, so you're invisible to anyone searching right now. I already rebuilt a version for you — can I send it over?`
      : (r.reviews?.weak && isBiz)
        ? `Hi — I looked up ${r.name} and you're at ${r.reviews.rating??'—'}★ with ${r.reviews.count} Google reviews, while the local median is ${r.reviews.peerMedianCount}. That gap decides who gets the call. I rebuilt your site with a review engine built in — two minutes to show you?`
        : top
          ? `Hi — I pulled up ${r.name} and noticed you don't have ${top.label.toLowerCase()}, but ${top.peerPct}% of ${r.tradition} ${catLabel[r.type]} do — it's probably costing you ${isBiz?'bookings':'visitors'} every week. I built a version of your site that fixes it. Two minutes to show you?`
          : `Hi — I looked at ${r.name}'s site (scored it ${r.score}/100 vs a ${avg} average for ${r.tradition} ${catLabel[r.type]}). I rebuilt a sharper version — can I send it over?`;

    // ── the built goods + the exact email we send ───────────────────────────
    r.assets = resolveAssets(r.domain);
    const link = r.assets.funnel ? SITE + r.assets.funnel : r.assets.demo ? SITE + r.assets.demo : null;
    if (!link){ r.email = null; continue; }
    const hook = r.dead
      ? `Your current site at ${r.domain} is down — a placeholder is standing where your front door should be, so anyone searching for you right now finds nothing.`
      : (r.reviews?.weak && isBiz)
        ? `I looked up ${r.name} on Google: ${r.reviews.rating!=null?r.reviews.rating+'★ from ':''}${r.reviews.count} reviews, while similar ${catLabel[r.type]} around you sit at a median of ${r.reviews.peerMedianCount}. Reviews decide who gets the call — and your website does nothing to grow them.`
        : top
          ? `I pulled up ${r.domain} and noticed it's missing ${top.label.toLowerCase()} — ${top.peerPct}% of ${r.tradition} ${catLabel[r.type]} have it, and it's likely costing you ${isBiz?'customers':'first-time visitors'} every week.`
          : `I scored ${r.domain} against ${c.n} other ${r.tradition} ${catLabel[r.type]}: ${r.score}/100 vs a ${avg} average.`;
    r.email = {
      subject: r.dead
        ? `${r.name} — your website is down (I built you a new one)`
        : `I rebuilt ${r.name}'s website — it's ready to look at`,
      body:
`Hi — Kris here from Sightline Studio, here in Colorado.

${hook}

So instead of sending a pitch deck, I just built it. Here's ${r.name}'s new site, live right now:

${link}

That's a real, working site — your name, your ${isBiz?'services':'ministries'}, your photos, built for phones and built to be found on Google.${r.assets.teardown?` The same link shows how you stack up against ${isBiz?'your local competitors':'nearby churches'}, measured on public signals.`:''}${(r.reviews?.weak && isBiz)?`

It also ships with our review engine — the steady ask that turns happy customers into the Google reviews you're missing.`:''}

If you like it, it's yours: ${isBiz?'we host it, watch it, and market it from $59.99/mo with $0 down':'we host it, keep it fresh, and handle the tech for one simple monthly price'} — and you own the site. If not, no hard feelings; the preview was free.

Worth two minutes? Just reply to this email.

— Kris
Sightline Studio · look sharp, stay safe, get found`,
    };
  }
  return rows;
}

// CLI entry
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])){
  const rows = enrich(JSON.parse(fs.readFileSync(FILE, 'utf8')));
  fs.writeFileSync(FILE, JSON.stringify(rows, null, 2));
  const demos = rows.filter(r=>r.assets.demo||r.assets.funnel).length;
  const revs = rows.filter(r=>r.reviews).length;
  console.log(`✓ enriched ${rows.length} prospects — ${demos} with a built site linked, ${rows.filter(r=>r.email).length} send-ready emails${revs?`, ${revs} with review intel`:''}`);
}
