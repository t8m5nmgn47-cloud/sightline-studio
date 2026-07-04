import fs from 'node:fs'; import path from 'node:path';
import * as cheerio from '/Users/kristianemery/sightline-studio/node_modules/cheerio/dist/browser/index.js';
import { normalize, assemble } from './site-engine.mjs';
import { extractSignals } from '../api/_intake.js';
import { scoreCongregation, corpusFromPages } from './congregation.mjs';

const ROOT='/Users/kristianemery/sightline-studio';
const html=fs.readFileSync(path.join(ROOT,'assets/harvest/pages/clchr-lutheran.html'),'utf8');
const sig=extractSignals(html,'https://www.clchr.org');
// save logo
let logoPath='/assets/stock/church-2.webp';
const lu=(sig.logo_candidates||[])[0]?.url;
if(lu){ try{ const buf=Buffer.from(await(await fetch(lu)).arrayBuffer()); const ext=(lu.split('.').pop()||'png').split('?')[0].slice(0,4);
  fs.mkdirSync(path.join(ROOT,'assets/captured/clchr-org'),{recursive:true});
  fs.writeFileSync(path.join(ROOT,'assets/captured/clchr-org/logo.'+ext),buf); logoPath='/assets/captured/clchr-org/logo.'+ext; }catch{} }

const profile=normalize(sig,{
  slug:'clchr-org', logo:logoPath, heroImage:'/assets/stock/church-2.webp',
  name:'Christ Lutheran Church', location:'Highlands Ranch, Colorado · ELCA',
  announce:'Sunday worship at 8:30 & 11:00 AM · Adult Faith Formation & Sunday School at 9:45.',
  serviceTimes:['Sunday Worship · 8:30 & 11:00 AM','Sunday School & Formation · 9:45 AM','Wednesday Evening Prayer · 6:30 PM'],
  hero:{ kick:'● Highlands Ranch, Colorado',
    headline:'“For it is by grace you have been saved, through faith.”',
    sub:'— Ephesians 2:8. A Lutheran congregation where grace is for everyone. You are welcome exactly as you are.',
    ctas:[{label:'Visiting? Start here →',href:'#visit'},{label:'Watch a service',href:'#watch',ghost:true}] },
  sections:{
    services:{ items:[{h:'A warm welcome',p:'Greeters will help you find your way — and a seat with no pressure.'},
      {h:'Word & Sacrament',p:'Scripture, song, and Holy Communion — the rhythm of Lutheran worship.'},
      {h:'Children belong',p:'Nursery care and Sunday School for every age.'},
      {h:'Coffee & fellowship',p:'Stay after to meet the congregation.'}] },
    sermons:{ title:'Worship with us online.', latest:{title:'This Sunday’s sermon',speaker:'Pastor'} },
    music:{ title:'A tradition of sung faith.', lead:'Choir, handbells, and organ — music is at the heart of how we worship together.', cta:'Our music ministry' },
    groups:{}, serve:{},
    care:{ title:'Our Caring Connection.', lead:'Prayer, visitation, meals, and support when life is hard — a member of our care team is ready to walk with you.' },
    giving:{ kicker:'Stewardship', title:'Give in gratitude.', lead:'Secure online giving supports the ministry and mission of our congregation.', cta:'Give online' },
    cta:{ title:'However long it’s been, you’re welcome here.', lead:'Join us for worship this Sunday.' },
  },
});
const site=assemble(profile,{archetype:'editorial',theme:'heritage',mood:'drift',useCapturedPalette:true,tradition:'mainline'});
const dir=path.join(ROOT,'engine/preview/H_mainline-lutheran'); fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'index.html'),site);
console.log('wrote H_mainline-lutheran',(site.length/1024|0)+'KB');

// PROOF: score real mainline captures both ways
for(const [slug,name] of [['clchr-lutheran','Christ Lutheran'],['smokyhill-umc','Smoky Hill UMC'],['menlo-pres','Menlo (Presbyterian)']]){
  const h=fs.readFileSync(path.join(ROOT,'assets/harvest/pages/'+slug+'.html'),'utf8');
  const c=corpusFromPages({home:h},cheerio,{https:true,mobile:/viewport/.test(h)});
  const contemp=scoreCongregation(c).score, main=scoreCongregation(c,{tradition:'mainline'}).score;
  console.log(`${name.padEnd(24)} contemporary:${contemp}  mainline:${main}`);
}
