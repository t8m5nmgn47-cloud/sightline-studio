import fs from 'node:fs';
import { renderFieldNotesV2 } from '../engine/v2/render-field-notes-v2.mjs';

const profileUrl = new URL('../engine/v2/examples/northline-electric.json', import.meta.url);
const profile = JSON.parse(fs.readFileSync(profileUrl, 'utf8'));

export default function handler(req, res) {
  const html = renderFieldNotesV2(profile);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
  res.status(200).send(html);
}
