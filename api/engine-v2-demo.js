import fs from 'node:fs';
import { renderResidentialEditorial } from '../engine/v2/render-residential-editorial.mjs';
import { renderDentalTrust } from '../engine/v2/render-dental-trust.mjs';

const northlineUrl = new URL('../engine/v2/examples/northline-electric.json', import.meta.url);
const dentalUrl = new URL('../engine/v2/examples/ember-dental.json', import.meta.url);
const northlineProfile = JSON.parse(fs.readFileSync(northlineUrl, 'utf8'));
const dentalProfile = JSON.parse(fs.readFileSync(dentalUrl, 'utf8'));

export default function handler(req, res) {
  const isDental = String(req.query?.demo || '').toLowerCase() === 'dental';
  const html = isDental
    ? renderDentalTrust(dentalProfile)
    : renderResidentialEditorial(northlineProfile);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
  res.status(200).send(html);
}
