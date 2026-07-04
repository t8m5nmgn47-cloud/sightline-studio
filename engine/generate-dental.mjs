import fs from 'node:fs'; import path from 'node:path';
import * as cheerio from '/Users/kristianemery/sightline-studio/node_modules/cheerio/dist/browser/index.js';
import { normalize, assemble } from './site-engine.mjs';
import { extractSignals } from '../api/_intake.js';

const ROOT='/Users/kristianemery/sightline-studio';
const html=fs.readFileSync(path.join(ROOT,'assets/harvest/business/cherryhillsdentist.com.html'),'utf8');
const sig=extractSignals(html,'https://www.cherryhillsdentist.com');
const phone=(html.match(/\(?\d{3}\)?[\s.-]?\d{3}[.-]\d{4}/)||[])[0]||'(303) 555-0142';

const profile=normalize(sig,{
  slug:'cherryhillsdentist', name:'Cherry Hills Dentistry', location:'Cherry Hills · Denver, CO',
  phone, heroImage:null,
  announce:`Accepting new patients · Same-week appointments · ${phone}`,
  hero:{ kick:'● Cherry Hills, Colorado',
    headline:'Dentistry you’ll actually look forward to.',
    sub:'Gentle, modern care for the whole family — from cleanings to cosmetic. Same-week appointments, most insurance accepted.',
    ctas:[{label:'Book appointment →',href:'#book'},{label:'📞 '+phone,href:'tel:'+phone.replace(/[^0-9]/g,''),ghost:true}] },
  sections:{
    book:{ title:'Ready when you are.', sub:'Book online in under a minute — new patients welcome.' },
    services:{ kicker:'Our care', title:'Comprehensive dentistry, all in one place.',
      items:[{h:'Cleanings & checkups',p:'Gentle preventive care that keeps problems small.'},
        {h:'Cosmetic & whitening',p:'Veneers, bonding, and whitening for a smile you love.'},
        {h:'Implants & restorative',p:'Crowns, bridges, and implants that look and feel natural.'},
        {h:'Same-day emergencies',p:'In pain? We keep room in the schedule for you today.'}] },
    reviews:{ kicker:'What patients say', title:'The most-loved dentist in Cherry Hills.', rating:'4.9', count:'400+',
      items:[{q:'Best dental experience I’ve ever had — zero pain and they explained everything.',name:'Sarah M.'},
        {q:'They got me in same-day for a broken tooth. Kind, fast, and no upsell.',name:'David R.'},
        {q:'My kids actually ask to go to the dentist now. That says it all.',name:'Priya K.'}] },
    offer:{ kicker:'New patients', title:'$89 new-patient exam, X-rays & cleaning.', lead:'A $300 value — no insurance required. Book this week.', cta:'Claim the $89 offer →' },
    team:{ kicker:'Meet the team', title:'Your Cherry Hills dentists', items:[{name:'Dr. A. Copeland',role:'DDS · Cosmetic & Implant Dentistry'},{name:'Dr. J. Nguyen',role:'DDS · Family Dentistry'}] },
    results:{ kicker:'Smile gallery', title:'Real smiles, real results.',
      items:[{h:'Veneers',p:'Full smile makeovers in as little as two visits.'},{h:'Invisalign',p:'Straighter teeth, no metal — most cases under 12 months.'},{h:'Implants',p:'Permanent, natural-looking tooth replacement.'}] },
    money:{ kicker:'Affordable care', title:'Insurance & financing, made easy.', lead:'We accept most major PPO plans and offer 0%-interest financing so cost is never the reason you wait.', logos:['Delta Dental','Cigna','Aetna','MetLife','CareCredit'] },
    hours:{ items:['Mon–Thu · 8:00 AM – 5:00 PM','Fri · 8:00 AM – 2:00 PM','Sat · By appointment'] },
    cta:{ title:'Your best smile starts here.', lead:'Book your first visit — new patients welcome this week.' },
  },
});
const site=assemble(profile,{archetype:'minimal', theme:'modern', mood:'none', useCapturedPalette:true, vertical:"dental"});
const dir=path.join(ROOT,'engine/preview/BIZ_dental-cherryhills'); fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'index.html'),site);
console.log('wrote BIZ_dental-cherryhills',(site.length/1024|0)+'KB','brand:',profile.palette.brand,'phone:',phone);
