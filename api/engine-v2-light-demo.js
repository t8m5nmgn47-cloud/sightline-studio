import fs from 'node:fs';
import { renderFieldNotesV2 } from '../engine/v2/render-field-notes-v2.mjs';

const profileUrl = new URL('../engine/v2/examples/northline-electric.json', import.meta.url);
const profile = JSON.parse(fs.readFileSync(profileUrl, 'utf8'));

const lightVariant = `<style>
/* Brighter comparison variant: dark used as punctuation, not a surface default. */
.hero-photo{filter:saturate(.9) contrast(1.02) brightness(1.08)!important;z-index:0}
.hero-shade{z-index:1;background:linear-gradient(90deg,rgba(10,14,12,.62) 0%,rgba(10,14,12,.28) 44%,rgba(10,14,12,.02) 76%),linear-gradient(180deg,rgba(0,0,0,.12),transparent 38%,rgba(0,0,0,.2))!important}
.hero::before{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(ellipse at 78% 24%,rgba(255,235,198,.34),rgba(255,219,158,.13) 24%,transparent 46%),radial-gradient(ellipse at 67% 63%,rgba(255,203,126,.16),transparent 30%);mix-blend-mode:screen}

/* Principles become a warm architectural surface. */
.proof{background:#efe8dc!important;color:#111412!important;border-top:1px solid #d6cdbf;border-bottom:1px solid #d6cdbf;padding-top:clamp(72px,8vw,118px);padding-bottom:clamp(72px,8vw,118px)}
.proof .section-kicker,.proof-intro span,.proof-grid .num{color:#7b6d5e!important;opacity:1!important}
.proof-grid{border-top-color:#c9beae!important;grid-template-columns:repeat(3,minmax(0,1fr))!important}
.proof-grid article{min-height:250px;display:flex;flex-direction:column;justify-content:flex-end;position:relative;padding:30px 36px 0 0!important}
.proof-grid article+article{border-left:1px solid #c9beae!important;padding-left:36px!important}
.proof-grid .num{position:absolute;top:26px;left:0}
.proof-grid article+article .num{left:36px}
.proof-grid h3{color:#111412!important;margin:0 0 16px;font-size:clamp(28px,2.6vw,42px)}
.proof-grid p{color:#59605c!important;max-width:38ch}

/* Expertise stays bright and receives a subtle sage field. */
.services{background:#f6f2ea!important}
.service-list article{transition:background .25s ease,padding-left .25s ease,padding-right .25s ease}
.service-list article:hover{background:rgba(154,170,146,.13);padding-left:16px;padding-right:16px}

/* Process becomes pale sage rather than another neutral slab. */
.process{background:#dfe5db!important}
.process-grid{border-top-color:#b7c2b1!important}
.process-grid article+article{border-left-color:#b7c2b1!important}
.process-grid article{min-height:285px;display:flex;flex-direction:column}
.process-grid h3{margin-top:auto;margin-bottom:14px}
.process-grid p{margin-top:0;max-width:31ch;color:#4d5750!important}

/* FAQ returns to warm stone. Keep deep forest for the final CTA/footer only. */
.faq{background:#eee8de!important;color:#111412!important}
.faq-list{border-top-color:#c7bdaf!important}
details{border-bottom-color:#c7bdaf!important}
details p{color:#59605c!important}
.contact{background:#1a241f!important;color:#fff!important}
.contact-inner>p{color:rgba(255,255,255,.72)!important}
.contact .section-kicker{color:#b7c3b2!important}
.contact .btn.dark{background:#fff!important;color:#1a241f!important;border-color:#fff!important}
.contact-phone{color:#fff!important;border-bottom-color:rgba(255,255,255,.45)!important}

@media (min-width:761px) and (max-width:1100px){
  .proof-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}
  .proof-grid article{min-height:250px;padding:28px 22px 0 0!important}
  .proof-grid article+article{border-left:1px solid #c9beae!important;padding-left:22px!important}
  .proof-grid article+article .num{left:22px}
  .service-list article{grid-template-columns:50px minmax(220px,.85fr) minmax(0,1.15fr) 28px!important;gap:24px!important}
  .service-list article>p{grid-column:auto!important}
  .process-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .process-grid article{min-height:250px;padding:28px 30px!important;border-left:0!important;border-bottom:1px solid #b7c2b1}
  .process-grid article:nth-child(even){border-left:1px solid #b7c2b1!important}
  .process-grid article:nth-last-child(-n+2){border-bottom:0}
}

@media (max-width:760px){
  .proof-grid{grid-template-columns:1fr!important}
  .proof-grid article{min-height:0;padding:28px 0!important;display:block}
  .proof-grid article+article{border-left:0!important;border-top:1px solid #c9beae!important;padding-left:0!important}
  .proof-grid .num,.proof-grid article+article .num{position:static;display:block;margin-bottom:34px}
  .service-list article{grid-template-columns:34px 1fr 28px!important}
  .service-list article>p{grid-column:2/4!important}
  .process-grid{grid-template-columns:1fr!important}
  .process-grid article{min-height:0;padding:28px 0!important;border-left:0!important;border-bottom:1px solid #b7c2b1!important}
  .process-grid article:last-child{border-bottom:0!important}
}
</style>`;

export default function handler(req, res) {
  const html = renderFieldNotesV2(profile).replace('</head>', `${lightVariant}</head>`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
  res.status(200).send(html);
}
