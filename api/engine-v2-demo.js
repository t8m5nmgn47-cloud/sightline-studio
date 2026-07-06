import fs from 'node:fs';
import { renderFieldNotesV2 } from '../engine/v2/render-field-notes-v2.mjs';

const profileUrl = new URL('../engine/v2/examples/northline-electric.json', import.meta.url);
const profile = JSON.parse(fs.readFileSync(profileUrl, 'utf8'));

const heroLighting = `<style>
.hero-photo{filter:saturate(.88) contrast(1.03) brightness(1.05)!important;z-index:0}
.hero-shade{z-index:1}
.hero::before{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background:
  radial-gradient(ellipse at 78% 25%,rgba(255,232,190,.34) 0%,rgba(255,222,160,.16) 19%,transparent 43%),
  radial-gradient(ellipse at 66% 62%,rgba(255,205,128,.18) 0%,transparent 30%),
  linear-gradient(118deg,transparent 46%,rgba(255,224,170,.12) 64%,transparent 82%);mix-blend-mode:screen}
.hero::after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(90deg,rgba(8,12,10,.16) 0%,transparent 42%),radial-gradient(circle at 88% 78%,rgba(255,198,112,.14),transparent 22%)}
</style>`;

const sectionRefinements = `<style>
/* Operating principles: preserve the three-part composition on laptop widths. */
.proof{padding-top:clamp(72px,8vw,118px);padding-bottom:clamp(72px,8vw,118px)}
.proof-grid article{min-height:250px;display:flex;flex-direction:column;justify-content:flex-end;position:relative}
.proof-grid .num{position:absolute;top:26px;left:0}
.proof-grid article+article .num{left:36px}
.proof-grid h3{margin:0 0 16px;font-size:clamp(28px,2.6vw,42px)}
.proof-grid p{max-width:38ch}

/* Expertise: keep the relationship between condition, service and explanation visible. */
.service-list article{transition:background .25s ease,padding-left .25s ease,padding-right .25s ease}
.service-list article:hover{background:rgba(17,20,18,.035);padding-left:16px;padding-right:16px}
.service-list article>a{transition:transform .2s ease}
.service-list article:hover>a{transform:translate(3px,-3px)}

/* Process: compact editorial cards instead of oversized stacked paragraphs. */
.process-grid article{min-height:285px;display:flex;flex-direction:column}
.process-grid h3{margin-top:auto;margin-bottom:14px}
.process-grid p{margin-top:0;max-width:31ch}

@media (min-width:761px) and (max-width:1100px){
  .proof-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}
  .proof-grid article{min-height:260px;padding:28px 24px 0 0!important}
  .proof-grid article+article{border-left:1px solid rgba(255,255,255,.2)!important;padding-left:24px!important}
  .proof-grid article+article .num{left:24px}

  .service-list article{grid-template-columns:50px minmax(220px,.85fr) minmax(0,1.15fr) 28px!important;gap:24px!important;align-items:start}
  .service-list article>p{grid-column:auto!important}
  .service-list h3{font-size:clamp(24px,3vw,34px)}

  .process-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .process-grid article{min-height:260px;padding:28px 30px!important;border-left:0!important;border-bottom:1px solid var(--line)}
  .process-grid article:nth-child(even){border-left:1px solid var(--line)!important}
  .process-grid article:nth-last-child(-n+2){border-bottom:0}
}

@media (max-width:760px){
  .proof-grid{grid-template-columns:1fr!important}
  .proof-grid article{min-height:0;padding:28px 0!important;display:block}
  .proof-grid article+article{border-left:0!important;border-top:1px solid rgba(255,255,255,.2);padding-left:0!important}
  .proof-grid .num,.proof-grid article+article .num{position:static;display:block;margin-bottom:34px}

  .service-list article{grid-template-columns:34px 1fr 28px!important}
  .service-list article>p{grid-column:2/4!important}

  .process-grid{grid-template-columns:1fr!important}
  .process-grid article{min-height:0;padding:28px 0!important;border-left:0!important;border-bottom:1px solid var(--line)!important}
  .process-grid article:last-child{border-bottom:0!important}
  .process-grid h3{margin-top:42px}
}
</style>`;

export default function handler(req, res) {
  const html = renderFieldNotesV2(profile).replace('</head>', `${heroLighting}${sectionRefinements}</head>`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
  res.status(200).send(html);
}
