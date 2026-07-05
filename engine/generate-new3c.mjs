import fs from 'node:fs'; import path from 'node:path';
import { normalize, assemble } from './site-engine.mjs';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url));

// New Covenant's real site is nearly empty, so we build from its brand + the good
// authored voice already in the demo, and let the engine add the whole journey.
const sig = {
  og_site_name:'New Covenant Community Church',
  color_signals:['#5c8c24','#3a5c16','#1b1f17','#f5f3ec','#e3e0d3'],
  nav_tabs:[{label:'Visit',href:'#visit'},{label:'Watch',href:'#watch'},
    {label:'What We Believe',href:'#visit'},{label:'Groups',href:'#groups'},{label:'Give',href:'#give'}],
  hero_phrases:[], finalUrl:'https://new3c.org',
};
const profile = normalize(sig, {
  slug:'new3c-org', heroImage:'/assets/stock/church-2.webp',
  name:'New Covenant Community Church', location:'Highlands Ranch, Colorado',
  announce:'Gathering Sundays at 10 AM · Southridge Recreation Center, Highlands Ranch.',
  serviceTimes:['Sunday Worship · 10:00 AM','Southridge Recreation Center, Highlands Ranch'],
  hero:{ kick:'● Highlands Ranch, CO',
    headline:'The gospel of Jesus, at the center of everything.',
    sub:'A gospel-centered, non-denominational Reformed church proclaiming God’s glory through a Spirit-empowered community. Come as you are — Sundays at 10 AM in Highlands Ranch.',
    ctas:[{label:'Plan Your Visit →',href:'#visit'},{label:'Watch Online',href:'#watch',ghost:true}] },
  sections:{
    services:{ kicker:'New to New Covenant?', title:'What your first Sunday looks like.',
      lead:'No pressure, no spotlight — come as you are and stay as long as you like.',
      items:[{h:'Easy to find',p:'We gather at Southridge Recreation Center — free parking, easy in and out.'},
        {h:'Come as you are',p:'Dress how you like. You’ll be welcomed, not sized up.'},
        {h:'Families worship together',p:'Kids are cared for, and families are welcome in the room.'},
        {h:'Gospel-centered teaching',p:'Clear, Christ-centered preaching straight from the Scriptures.'}] },
    nextsteps:{ title:'New here? Here’s your next step.',
      items:[{n:'01',h:'Plan a visit',p:'Let us know you’re coming and we’ll be watching for you.'},
        {n:'02',h:'Come as you are',p:'Join us Sunday at 10 — no need to prepare a thing.'},
        {n:'03',h:'What We Believe class',p:'A relaxed intro to who we are and the gospel we hold.'},
        {n:'04',h:'Get in a group',p:'Community groups are where New Covenant becomes family.'}] },
    groups:{ title:'Find your people.', lead:'A community group is where Sunday becomes a family through the week.',
      cats:['Community Groups','Men','Women','Families','Bible Study','Young Adults'] },
    serve:{ title:'There’s a place for you to serve.', lead:'Welcome, kids, worship, setup — serving is how you belong.' },
    sermons:{ title:'Can’t make it? Worship with us online.', latest:{title:'This Sunday’s sermon',speaker:'Pastor'} },
    events:{ kicker:'Rhythms', title:'Life together at New Covenant',
      items:[{when:'Sundays · 10 AM',h:'Sunday Worship Service',p:'Southridge Recreation Center.'},
        {when:'After service',h:'Fellowship',p:'Coffee and conversation — stay and meet the community.'},
        {when:'Monthly',h:'What We Believe Class',p:'For anyone new or curious.'}] },
    care:{ title:'However you come, you don’t come alone.', lead:'Need prayer or a hand? Send a note — a real person from our body will reach out.' },
    giving:{ kicker:'Give', title:'Generosity for the gospel.', lead:'Secure online giving — one-time or recurring.', cta:'Give online' },
    cta:{ title:'We saved you a seat.', lead:'Join us this Sunday at 10 AM.' },
  },
});
const html = assemble(profile, {archetype:'journey', theme:'evergreen', mood:'godrays', useCapturedPalette:true, tradition:'contemporary'});
const dir=path.join(ROOT,'engine/preview/new3c-engine'); fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'index.html'), html);
console.log('wrote new3c-engine',(html.length/1024|0)+'KB','brand:',profile.palette.brand);
