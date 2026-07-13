// ─────────────────────────────────────────────────────────────────────────────
// Variant chooser — the same site, six visual directions, and a picker page
// that turns the prospect's taste into a lead event.
//
//   node engine/variants.mjs <domain>            # 6 styled builds + chooser
//   node engine/variants.mjs <domain> --pages    # multi-page variants
//
// Output:
//   demos/<slug>--editorial/   clean magazine frame (light, type-led)
//   demos/<slug>--bold/        deep brand poster (dark, cinematic)
//   demos/<slug>--statement/   offer-forward poster, oversized price hero
//   demos/<slug>--luxe/        fashion-house restraint (didone type, razor edges)
//   demos/<slug>--showcase/    gallery-led heritage frame
//   demos/<slug>--flagship/    the signature cinematic look
//   demos/<slug>--choose/      "pick your favorite" page; each choice POSTs
//                              to /api/contact tagged {source, style} — the
//                              prospect selling themselves is a logged lead.
// Same conversion spine in all six: hero → services → why-us → proof →
// friction killers → action. Only the structure order and the dress change.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const domain = args.find(a => !a.startsWith('--'));
if (!domain){ console.error('usage: node engine/variants.mjs <domain> [--pages]'); process.exit(1); }
const slug = domain.replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/.*$/,'').replace(/[^a-z0-9]+/gi,'-').toLowerCase();

// Six variants = six STRUCTURES × six styles, not one skeleton in three coats.
// Structure changes the order of the argument; style changes the dress.
const STYLES = [
  { key:'editorial', label:'The Editorial', structure:null,       archetype:'editorial', theme:'evergreen',
    desc:'Classic trust-led flow — magazine typography on a light ground, brand as a crisp accent.' },
  { key:'bold',      label:'The Bold',      structure:'proof',    archetype:'modern',    theme:'modern', themePalette:true,
    desc:'Proof-first — reviews hit right after the hero on a deep cinematic canvas.' },
  { key:'statement', label:'The Statement', structure:'offer',    archetype:'statement', theme:'modern',
    desc:'Offer-first at full volume — oversized price hero, marquee, chunky brand blocks. Built to convert.' },
  { key:'luxe',      label:'The Luxe',      structure:'story',    archetype:'editorial', theme:'luxe',
    desc:'Quiet money — fashion-house typography, razor edges, restraint that reads expensive.' },
  { key:'showcase',  label:'The Showcase',  structure:'showcase', archetype:'cathedral', theme:'heritage',
    desc:'Work-first — a gallery leads so the results sell before a word is read.' },
  { key:'flagship',  label:'The Flagship',  structure:'flagship', archetype:'flagship',  theme:'modern', themePalette:true,
    desc:'The signature look — cinematic hero, scrolling marquee, layered depth. The showstopper.' },
];

const extra = args.includes('--pages') ? ['--pages'] : [];
const built = [];
for (const st of STYLES){
  try {
    execFileSync('node', [path.join(ROOT,'engine/pipeline.mjs'), domain,
      '--archetype', st.archetype, '--theme', st.theme, '--suffix', st.key, '--no-render-qa', ...(st.structure?['--structure',st.structure]:[]), ...(st.themePalette?['--theme-palette']:[]), ...extra],
      { encoding:'utf8', timeout: 240000, stdio: ['ignore','pipe','pipe'] });
    built.push(st);
    console.log(`✅ ${st.key} → demos/${slug}--${st.key}/`);
  } catch (e) {
    console.log(`❌ ${st.key} — ${String((e.stdout||'')+(e.stderr||'')).trim().split('\n').pop()?.slice(0,90)}`);
  }
}
if (!built.length){ console.error('no variants built'); process.exit(1); }

// screenshot each variant (Chrome required) → embedded data-URI thumbnails so
// the chooser is fully self-contained (file preview, email, deploy — anywhere).
// Falls back to a live iframe when no Chrome is around.
const shots = {};
try {
  const { chromium } = await import('playwright-core');
  let exe = null;
  for (const bin of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome','/usr/bin/chromium'])
    if (fs.existsSync(bin)) { exe = bin; break; }
  if (exe){
    const b = await chromium.launch({ executablePath: exe, args:['--no-sandbox'] });
    const pg = await b.newPage({ viewport:{ width:1280, height:720 } });
    let sharp = null; try { sharp = (await import('sharp')).default; } catch {}
    for (const st of built){
      await pg.goto('file://'+path.join(ROOT,'demos',`${slug}--${st.key}`,'index.html'), { waitUntil:'load', timeout:20000 });
      await pg.waitForTimeout(st.key==='flagship' ? 2000 : 700);   // flagship's word-reveal needs to finish
      const png = await pg.screenshot();
      const buf = sharp ? await sharp(png).resize({ width: 720 }).jpeg({ quality: 78 }).toBuffer() : png;
      shots[st.key] = `data:image/${sharp?'jpeg':'png'};base64,` + buf.toString('base64');
    }
    await b.close();
    console.log(`✓ ${Object.keys(shots).length} thumbnails embedded`);
  } else console.log('! no Chrome — chooser will use live iframes (previews may be blank in sandboxed viewers)');
} catch { console.log('! screenshot pass skipped — falling back to live iframes'); }

// business name from the first build's <title>
let bizName = slug;
try { bizName = (fs.readFileSync(path.join(ROOT,'demos',`${slug}--${built[0].key}`,'index.html'),'utf8')
  .match(/<title>([^<—]+)/)||[])[1]?.trim() || slug; } catch {}

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const cards = built.map((st,i)=>`
  <article class="card" style="--i:${i}">
    <div class="frame">${shots[st.key]
      ? `<img src="${shots[st.key]}" alt="${esc(st.label)} preview">`
      : `<iframe src="../${slug}--${st.key}/index.html" loading="lazy" title="${esc(st.label)}" tabindex="-1"></iframe>`}</div>
    <h2>${esc(st.label)}</h2>
    <p>${esc(st.desc)}</p>
    <div class="row">
      <a class="btn ghost" href="../${slug}--${st.key}/index.html" target="_blank" rel="noopener">View full site →</a>
      <button class="btn pick" data-style="${st.key}">I like this one</button>
    </div>
  </article>`).join('');

const chooser = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(bizName)} — choose your style</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@500;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;background:#101216;color:#f2f2f4;line-height:1.5}
.wrap{max-width:1240px;margin:0 auto;padding:clamp(28px,5vw,64px) 24px}
h1{font-family:Sora,sans-serif;font-size:clamp(1.8rem,4.5vw,3.2rem);line-height:1.1;margin:0}
.sub{color:#a8adb8;max-width:56ch;margin:14px 0 0;font-size:1.05rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:26px;margin-top:44px}
.card{background:#181b21;border:1px solid #262a33;border-radius:18px;padding:18px;display:flex;flex-direction:column;gap:10px;
  animation:up .5s calc(var(--i)*.12s) both}
@keyframes up{from{opacity:0;transform:translateY(14px)}to{opacity:1}}
.frame{aspect-ratio:16/9;overflow:hidden;border-radius:12px;background:#0c0d10;position:relative}
.frame iframe{width:400%;height:400%;transform:scale(.25);transform-origin:0 0;border:0;pointer-events:none}
.frame img{width:100%;height:auto;display:block}
h2{font-family:Sora,sans-serif;font-size:1.25rem;margin:8px 0 0}
.card p{color:#a8adb8;margin:0;font-size:.95rem;flex:1}
.row{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px}
.btn{font:inherit;font-weight:600;border-radius:10px;padding:11px 18px;cursor:pointer;text-decoration:none;text-align:center;border:1px solid transparent}
.btn.ghost{background:transparent;border-color:#3a3f4b;color:#e8eaee}.btn.ghost:hover{border-color:#6a7180}
.btn.pick{background:#e8eaee;color:#101216}.btn.pick:hover{background:#fff}
.btn.pick.done{background:#3ecf8e;color:#08130d}
.foot{color:#6a7180;font-size:.85rem;margin-top:54px}
</style></head><body>
<div class="wrap">
  <h1>${esc(bizName)} — six directions for your new site.</h1>
  <p class="sub">Same content, six personalities — different layouts, different moods. Open each one full-screen, live with it for a minute, and tell us which feels like you. We'll take it from there.</p>
  <div class="grid">${cards}</div>
  <p class="foot">Built by Sightline Studio · these are working previews — everything is adjustable.</p>
</div>
<script>
document.querySelectorAll('.pick').forEach(function(b){
  b.addEventListener('click', function(){
    var style = b.dataset.style;
    fetch('/api/contact', { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ source:'${slug}', kind:'style-choice', style: style, message:'Prospect chose the '+style+' style on the variant chooser.' })
    }).catch(function(){});
    document.querySelectorAll('.pick').forEach(function(x){ x.classList.remove('done'); x.textContent='I like this one'; });
    b.classList.add('done'); b.textContent='✓ Noted — great choice';
  });
});
</script></body></html>`;

const outDir = path.join(ROOT,'demos',`${slug}--choose`);
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'index.html'), chooser);
console.log(`\n✓ chooser: demos/${slug}--choose/index.html  (${built.length} styles: ${built.map(s=>s.key).join(', ')})`);
