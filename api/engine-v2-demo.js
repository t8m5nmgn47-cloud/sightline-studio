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

export default function handler(req, res) {
  const html = renderFieldNotesV2(profile).replace('</head>', `${heroLighting}</head>`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
  res.status(200).send(html);
}
