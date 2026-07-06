// ─────────────────────────────────────────────────────────────────────────────
// Outreach kit — a per-prospect one-pager you can print, email, or read from
// on a call. Pulls everything the engines already know: score + tier, the gaps
// vs peers, the verifiable external facts, CRM state, and the demo link.
//
//   node engine/outreach.mjs <domain>          # one prospect
//   node engine/outreach.mjs --tier HOT        # every HOT prospect
//   node engine/outreach.mjs --all
//
// Output: outreach/<slug>.html (self-contained, print-friendly).
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = process.env.SITE_ORIGIN || 'https://sightline-studio.vercel.app';
const slugify = (d) => d.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

function page(r) {
  const slug = slugify(r.domain);
  const demo = fs.existsSync(path.join(ROOT, 'demos', slug, 'index.html')) ? `${ORIGIN}/demos/${slug}/` : null;
  const gaps = (r.dims || []).filter((d) => !d.f);
  const money = (n) => '$' + n.toLocaleString();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Outreach — ${esc(r.name)}</title><meta name="robots" content="noindex">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:760px;margin:0 auto;padding:32px 24px;color:#1a1d23;line-height:1.5}
  h1{font-size:1.5rem;margin:0}.sub{color:#68717d;font-size:.9rem;margin:4px 0 20px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:18px 0}
  .kpi{border:1px solid #e2e5ea;border-radius:10px;padding:12px 14px}
  .kpi b{font-size:1.5rem;display:block}.kpi span{font-size:.7rem;color:#68717d;text-transform:uppercase;letter-spacing:.05em}
  h2{font-size:.82rem;text-transform:uppercase;letter-spacing:.08em;color:#68717d;margin:26px 0 8px}
  .opener{background:#f4f6f8;border-left:4px solid #2e7d5b;border-radius:8px;padding:14px 16px;font-style:italic}
  .fact{background:#fdf3ec;border-left:4px solid #d97742;border-radius:8px;padding:12px 15px;margin-top:8px}
  ul{margin:6px 0;padding-left:20px}li{margin:4px 0}
  .gap b{color:#b3543f}.gap span{color:#68717d;font-size:.9rem}
  a.demo{display:inline-block;background:#2e7d5b;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:9px;margin-top:8px}
  .meta{font-size:.85rem;color:#68717d}
  @media print{a.demo{border:2px solid #2e7d5b;color:#2e7d5b;background:none}}
</style></head><body>
  <h1>${esc(r.name)}</h1>
  <div class="sub">${r.domain} · ${esc(r.tradition)} ${r.type} · tier <b>${r.tier}</b>${r.status && r.status !== 'new' ? ` · status: ${r.status}` : ''}${r.notes ? ` · 📝 ${esc(r.notes)}` : ''}</div>
  <div class="grid">
    <div class="kpi"><b>${r.dead ? '✕' : r.score}</b><span>${r.dead ? 'site is dead' : 'readiness /100'}</span></div>
    ${r.benchmark?.avg != null ? `<div class="kpi"><b>${r.benchmark.avg}</b><span>peer average (${r.benchmark.catN})</span></div>` : ''}
    ${r.signals?.perf != null ? `<div class="kpi"><b>${r.signals.perf}</b><span>Google mobile speed</span></div>` : ''}
    <div class="kpi"><b>${money(r.mrr)}/mo</b><span>proposed plan</span></div>
    <div class="kpi"><b>${money(r.expected)}</b><span>est. annual value</span></div>
  </div>
  ${r.externalFact ? `<div class="fact"><b>Verifiable fact:</b> ${esc(r.externalFact)}</div>` : ''}
  ${r.reengage ? `<div class="fact"><b>Re-engage:</b> ${esc(r.reengage)}</div>` : ''}
  <h2>Cold-call opener</h2>
  <div class="opener">${esc(r.opener)}</div>
  ${gaps.length ? `<h2>What their site is missing (${gaps.length})</h2><ul>${gaps.map((g) => `<li class="gap"><b>${esc(g.l)}</b> — <span>${esc(g.w)}</span></li>`).join('')}</ul>` : ''}
  ${r.competitorGaps?.length ? `<h2>Peers have it, they don't</h2><ul>${r.competitorGaps.map((g) => `<li class="gap"><b>${g.peerPct}%</b> of peers have <b>${esc(g.label)}</b></li>`).join('')}</ul>` : ''}
  <h2>The rebuild</h2>
  ${demo ? `<p class="meta">Already built and live — send this link or share your screen:</p><a class="demo" href="${demo}">${demo}</a>`
         : `<p class="meta">No demo generated yet — run: <code>node engine/pipeline.mjs ${r.domain} --pages</code></p>`}
  <h2>After the call</h2>
  <p class="meta"><code>node engine/crm.mjs set ${r.domain} contacted "…"</code> · <code>demo-sent</code> · <code>won</code> · <code>lost</code></p>
</body></html>`;
}

// ── run ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : null; };
const rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'engine/preview/prospects.json'), 'utf8'));

const domainArg = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--tier'));
const tier = flag('tier');
const targets = domainArg ? rows.filter((r) => r.domain === domainArg)
  : tier ? rows.filter((r) => r.tier === tier.toUpperCase())
  : args.includes('--all') ? rows : [];
if (!targets.length) { console.error('usage: node engine/outreach.mjs <domain> | --tier HOT | --all'); process.exit(1); }

const dir = path.join(ROOT, 'outreach');
fs.mkdirSync(dir, { recursive: true });
for (const r of targets) {
  const f = path.join(dir, slugify(r.domain) + '.html');
  fs.writeFileSync(f, page(r));
  console.log('✓ outreach/' + path.basename(f) + `  (${r.tier} · ${r.score}/100${r.externalFact ? ' · has external fact' : ''})`);
}
console.log(`\n${targets.length} one-pager(s) → outreach/`);
