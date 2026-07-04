// Analyze harvested top-church homepages → a pattern database (what the best do),
// NOT a copy of any site. Extracts: readiness score, nav IA, feature set, imagery
// approach. Cross-site prevalence tells us what our engine should treat as default.
import * as cheerio from 'cheerio';
import fs from 'node:fs';
import { scoreCongregation, corpusFromPages } from './congregation.mjs';

const DIR = '/Users/kristianemery/sightline-studio/assets/harvest/pages';
const NAMES = { 'newlife-cs':'New Life Church (CO Springs)','woodmenvalley':'Woodmen Valley Chapel (CO Springs)',
  'lakewood':'Lakewood Church (Houston)','secondbaptist':'Second Baptist (Houston)','woodlands':'Woodlands Church (Houston)',
  'houstonsfirst':"Houston's First Baptist",'championforest':'Champion Forest Baptist (Houston)' };

// feature detectors over the whole-page corpus (text + hrefs + labels)
const FEATURES = {
  app:        /app store|google play|download (the |our )?app|apple app|get the app|church app|subsplash app/,
  livestream: /watch live|live ?stream|watch online|watch now|stream live/,
  chat:       /live chat|chat with|intercom|tawk|drift\b|messenger|chatbot|ask a question/,
  giving_platform: /pushpay|planning ?center|tithe\.?ly|givelify|subsplash|easytithe|paypal/,
  multicampus: /campuses|our locations|find a (campus|location)|all campuses/,
  podcast:    /podcast|spotify|apple podcasts?|listen on/,
  newsletter: /newsletter|subscribe|email updates|stay connected/,
  next_steps: /next steps?|get connected|start here|grow track|discover|membership class/,
  groups:     /group ?finder|find (a|your) group|small groups?|life groups?|community groups?/,
  serve:      /serve ?finder|volunteer|serve\b|dream team|join the team|get involved/,
  care:       /prayer|care ministry|counsel|support groups?/,
  events:     /events?\b|calendar|register/,
  families:   /kids|children|students?|youth|next ?gen|family/,
  give:       /\bgive\b|giving|donate|generosity/,
  plan_visit: /plan (a|your) visit|i'?m new|new here|what to expect|first time/,
  app_login:  /my ?account|sign in|member login|church center/,
};

const rows = [];
for (const f of fs.readdirSync(DIR)){
  const slug = f.replace('.html',''); const html = fs.readFileSync(`${DIR}/${f}`,'utf8');
  if (html.length < 2000) continue;                    // JS shell, no content
  const $ = cheerio.load(html);
  const corpus = corpusFromPages({home:html}, cheerio, {https:true, mobile:/viewport/.test(html)});
  const hay = (corpus.labels.join(' ')+' '+corpus.hrefs.join(' ')+' '+corpus.text).toLowerCase();
  // nav IA = top-level nav labels (short, uppercase-ish, action words)
  const nav = corpus.labels.filter(l=>l.length>=2 && l.length<=20 && /[a-z]/i.test(l) && !/^(accept|reject|customi|save|show more|necessary|functional|analytics|performance|advertis)/i.test(l)).slice(0,14);
  const features = Object.fromEntries(Object.entries(FEATURES).map(([k,re])=>[k, re.test(hay)]));
  // imagery: sizeable images + video embeds (are they people/photo-forward?)
  let bigImgs=0; $('img').each((_,e)=>{const w=+($(e).attr('width')||0);const s=$(e).attr('src')||$(e).attr('data-src')||$(e).attr('srcset')||'';if((w>=400||/hero|banner|slide|feature|people|worship|congreg/i.test(s))&&/\.(jpe?g|png|webp)/i.test(s))bigImgs++;});
  const video = $('video').length>0 || /youtube\.com\/embed|player\.vimeo|wistia|vidyard|brightcove/.test(html);
  const readiness = scoreCongregation(corpus).score;
  rows.push({ slug, name:NAMES[slug]||slug, readiness, navCount:nav.length, nav, features, bigImgs, video });
}
rows.sort((a,b)=>b.readiness-a.readiness);
fs.writeFileSync('/Users/kristianemery/sightline-studio/engine/preview/harvest.json', JSON.stringify(rows,null,2));

// ── cross-site pattern summary ───────────────────────────────────────────────
console.log('\n=== HARVEST: '+rows.length+' top churches ===');
for (const r of rows) console.log(`  ${String(r.readiness).padStart(3)}  ${r.name.padEnd(34)} imgs:${String(r.bigImgs).padStart(2)} video:${r.video?'Y':'·'} nav:${r.navCount}`);
console.log('\n=== FEATURE PREVALENCE (how many of '+rows.length+' have it → what to treat as default) ===');
const keys = Object.keys(FEATURES);
const prev = keys.map(k=>({k, n:rows.filter(r=>r.features[k]).length})).sort((a,b)=>b.n-a.n);
for (const {k,n} of prev){ const bar='█'.repeat(n)+'·'.repeat(rows.length-n); console.log(`  ${k.padEnd(16)} ${bar} ${n}/${rows.length}`); }
console.log('\n=== VIDEO in hero: '+rows.filter(r=>r.video).length+'/'+rows.length+'  ·  avg large images: '+Math.round(rows.reduce((s,r)=>s+r.bigImgs,0)/rows.length));
