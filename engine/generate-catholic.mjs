import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { normalize, assemble } from './site-engine.mjs';
import { extractSignals } from '../api/_intake.js';
import { scoreCongregation, corpusFromPages } from './congregation.mjs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CAP=path.join(ROOT,'assets/captured/paxchristi-org');
const sig=JSON.parse(fs.readFileSync(path.join(CAP,'signals.json'),'utf8'));

// download the real logo
const logoUrl=(sig.logo_candidates||[])[0]?.url;
let logoPath='/assets/stock/church-3.webp';
if(logoUrl){ try{ const buf=Buffer.from(await (await fetch(logoUrl)).arrayBuffer());
  const ext=(logoUrl.split('.').pop()||'png').split('?')[0].slice(0,4);
  fs.writeFileSync(path.join(CAP,'logo.'+ext),buf); logoPath='/assets/captured/paxchristi-org/logo.'+ext;
  console.log('logo saved',buf.length,'b'); }catch(e){ console.log('logo dl failed'); } }

const profile=normalize(sig,{
  slug:'paxchristi-org', logo:logoPath, heroImage:'/assets/stock/church-3.webp',
  name:'Pax Christi Catholic Church', location:'Lone Tree, Colorado · Archdiocese of Denver',
  announce:'Confessions Saturday 3:30 PM · Eucharistic Adoration Wednesdays after the 8:30 AM Mass.',
  serviceTimes:['Saturday Vigil · 4:30 PM','Sunday · 7:30, 9:00 & 11:00 AM','Sunday Español · 1:00 PM','Daily Mass · Mon–Fri 8:30 AM'],
  hero:{ kick:'● Lone Tree, Colorado',
    headline:'“Peace I leave with you; my peace I give you.”',
    sub:'— John 14:27. A Catholic community where all are welcome to worship, grow in faith, and serve one another.',
    ctas:[{label:'Join us for Mass →',href:'#times'},{label:'Livestreamed Mass',href:'#watch',ghost:true}] },
  sections:{
    mass:{ confession:'Saturdays 3:30–4:15 PM', adoration:'Wednesdays 9 AM – 5 PM' },
    sacraments:{ items:['Baptism','First Holy Communion','Reconciliation','Confirmation','Holy Matrimony','Anointing of the Sick'],
      cta:'New to the faith? Begin OCIA →' },
    services:{ kicker:'New to the parish?', title:'What to expect at Mass.',
      lead:'However long it’s been, you are welcome here. Come as you are.',
      items:[{h:'Arrive & be welcomed',p:'Greeters at every door will help you find your way.'},
        {h:'The Liturgy',p:'Word and Eucharist — the rhythm of Catholic worship for 2,000 years.'},
        {h:'Little ones welcome',p:'A cry room and children’s Liturgy of the Word are available.'},
        {h:'Stay for coffee',p:'Meet the community in the narthex after Mass.'}]},
    serve:{ title:'Serving our parish & community.', lead:'From Knights of Columbus to St. Vincent de Paul — find your place to give back.', cta:'Explore ministries' },
    sermons:{ title:'Can’t make it? Worship with us online.', latest:{title:'This Sunday’s homily',speaker:'Fr. Pastor'} },
    care:{ title:'In every season, you don’t walk alone.', lead:'Need prayer, the Anointing of the Sick, or help planning a funeral? Reach out — a member of our pastoral team will respond.' },
    giving:{ kicker:'Stewardship', title:'Support the mission of our parish.', lead:'Secure online offertory — one-time or recurring.', cta:'Give to Pax Christi' },
    cta:{ title:'There is a place for you at this table.', lead:'Join us for Mass this weekend.' },
  },
});

const html=assemble(profile,{archetype:'cathedral',theme:'heritage',mood:'godrays',useCapturedPalette:false,tradition:'catholic'});
const dir=path.join(ROOT,'engine/preview/G_catholic-paxchristi'); fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'index.html'),html);
console.log('wrote G_catholic-paxchristi',(html.length/1024|0)+'KB');

// PROVE the tradition-aware scoring: score the REAL paxchristi capture both ways
const realHtml=fs.readFileSync(path.join(CAP,'pages/home.html'),'utf8');
const corpus=corpusFromPages({home:realHtml},cheerio,{https:true,mobile:/viewport/.test(realHtml)});
const asContemp=scoreCongregation(corpus);
const asCatholic=scoreCongregation(corpus,{tradition:'catholic'});
console.log(`\nPax Christi REAL site scored as CONTEMPORARY: ${asContemp.score}/100 (${asContemp.grade}) — unfair`);
console.log(`Pax Christi REAL site scored as CATHOLIC:     ${asCatholic.score}/100 (${asCatholic.grade}) — fair`);
console.log('  catholic dims:', asCatholic.dims.filter(d=>d.found).map(d=>d.label).join(', '));
