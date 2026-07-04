import fs from 'node:fs';
import path from 'node:path';
import { normalize, assemble } from './site-engine.mjs';

const ROOT = '/Users/kristianemery/sightline-studio';
const CAP = path.join(ROOT,'assets/captured/missionhills-org');
const sig = JSON.parse(fs.readFileSync(path.join(CAP,'signals.json'),'utf8'));
const content = JSON.parse(fs.readFileSync(path.join(CAP,'content.json'),'utf8')); // real extracted detail

// Overrides: the parts we author or have curated (hero verse + section content).
// Everything else — name, palette, logo, real nav tabs — comes from the capture.
const profile = normalize(sig, {
  slug:'missionhills-org',
  logo:'/assets/captured/missionhills-org/logo.png',
  heroImage:'/assets/captured/missionhills-org/hero-crop.jpg',
  location:'Littleton · Castle Rock · North Littleton · Español',
  announce:'This weekend: Saturday 4 PM · Sunday 8, 9:15 & 11 AM — kids programming at every service.',
  serviceTimes: content.serviceTimes,     // REAL captured times
  hero:{
    kick:'● South Denver Metro',
    headline:'“Come to me, all you who are weary and burdened, and I will give you rest.”',
    sub:'— Matthew 11:28. Come as you are, and be made new.',
    ctas:[{label:'Plan Your Visit →',href:'#visit'},{label:'Watch Online',href:'#watch',ghost:true}],
  },
  sections:{
    services:{ kicker:'New here?', title:"Here's exactly what your first Sunday looks like.",
      lead:'No pressure, no spotlight. Walk in, grab a coffee, and stay as long as you like.',
      items:[
        {h:'Easy parking',p:'Free lot with reserved first-time spots near the main doors.'},
        {h:'Walk right in',p:'A friendly host greets you and points you to coffee and a seat.'},
        {h:'Kids are covered',p:'Safe, secure check-in for newborn through 5th grade.'},
        {h:'About an hour',p:'Music, a down-to-earth message, and you’re free to head out.'},
      ]},
    events:{ kicker:'Coming up', title:"What's happening",
      items: content.events.map(e => ({ when:e.loc||'', h:e.title, p:'' })) },  // REAL captured events
    team: content.staff.length ? { kicker:'Our team', title:'People you\'ll meet',
      items: content.staff } : undefined,                                        // REAL captured staff
    giving:{ kicker:'Give', title:'Generosity, made simple.',
      lead:'Secure online giving in under a minute — one-time or recurring.', cta:'Give online' },
    nextsteps:{}, groups:{}, serve:{}, care:{},   // congregation-first journey sections (good defaults)
    sermons:{ latest:{title:'This weekend’s message', speaker:'Pastor Craig Smith'} },  // Watch — 7/7 universal

    cta:{ title:'We saved you a seat.', lead:'Come as you are — this Sunday.' },
  },
});

// Three deliberately different recipes to prove the engine varies structure + look.
const recipes = [
  { name:'A_cathedral-captured', archetype:'cathedral', theme:'evergreen', mood:'godrays', useCapturedPalette:true },
  { name:'B_editorial-heritage', archetype:'editorial', theme:'heritage', mood:'drift',    useCapturedPalette:false },
  { name:'C_modern-community',   archetype:'modern',    theme:'community', mood:'candle',   useCapturedPalette:false },
  { name:'D_split-sanctuary',    archetype:'split',     theme:'sanctuary', mood:'none',     useCapturedPalette:false },
  { name:'E_minimal-quiet',      archetype:'minimal',   theme:'quiet',     mood:'none',     useCapturedPalette:false },
  { name:'F_journey-captured',   archetype:'journey',   theme:'evergreen', mood:'godrays',  useCapturedPalette:true },
];

// export the normalized profile so the browser studio can render recipes live
fs.mkdirSync(path.join(ROOT,'engine/preview'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'engine/preview/missionhills-profile.json'), JSON.stringify(profile,null,2));

for(const r of recipes){
  const html = assemble(profile, r);
  const dir = path.join(ROOT,'engine/preview', r.name);
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'index.html'), html);
  console.log('wrote', r.name, `(${(html.length/1024).toFixed(0)}KB)`);
}
