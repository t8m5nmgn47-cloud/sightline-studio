import fs from 'node:fs';
import { renderDentalTrust } from '../engine/v2/render-dental-trust.mjs';

const profileUrl = new URL('../engine/v2/examples/ember-dental.json', import.meta.url);
const profile = JSON.parse(fs.readFileSync(profileUrl, 'utf8'));

export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(renderDentalTrust(profile));
}
