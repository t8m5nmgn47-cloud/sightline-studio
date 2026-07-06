// ─────────────────────────────────────────────────────────────────────────────
// Sightline Site Maker — local UI for the generate→preview→publish pipeline.
//   node engine/studio-local.mjs      (or double-click "Sightline Site Maker.command")
// Opens http://localhost:4747 — type a prospect's domain, click Generate,
// preview the demo, then click Publish to push it live. Localhost-only.
// ─────────────────────────────────────────────────────────────────────────────
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 4747;

const MIME = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.mjs':'text/javascript',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml',
  '.mp4':'video/mp4', '.woff2':'font/woff2', '.json':'application/json', '.ico':'image/x-icon' };

// CORS: the hosted admin (intake page) calls this local server directly from
// the browser, so preflights + responses must allow that origin.
const ALLOWED_ORIGINS = /^https:\/\/sightline-studio(-[a-z0-9-]+)?\.vercel\.app$|^http:\/\/localhost(:\d+)?$/;
const cors = (req) => {
  const o = req.headers.origin || '';
  return ALLOWED_ORIGINS.test(o) ? { 'access-control-allow-origin': o, 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, GET, OPTIONS' } : {};
};
const json = (res, code, obj, extra = {}) => { res.writeHead(code, {'content-type':'application/json', ...extra}); res.end(JSON.stringify(obj)); };

// Reviewed intake profile → engine/content-overrides.json (highest-priority
// content source: beats capture, AI, and pack defaults). This is what makes
// the human review on the intake page actually count in the built site.
function saveOverride(slug, profile) {
  if (!profile || typeof profile !== 'object') return false;
  const file = path.join(ROOT, 'engine/content-overrides.json');
  let all = {}; try { all = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const ov = {};
  if (profile.motto) ov.headline = String(profile.motto).slice(0, 140);
  if (profile.tagline) ov.subhead = String(profile.tagline).slice(0, 300);
  const svcs = (profile.services || []).map(s => (s && s.name ? String(s.name) : '')).filter(Boolean);
  if (svcs.length >= 3) ov.services = svcs.slice(0, 8);
  if (profile.category) ov.specialty = String(profile.category).slice(0, 120);
  if (profile.notes) ov.about = String(profile.notes).slice(0, 600);
  if (!Object.keys(ov).length) return false;
  all[slug] = { ...(all[slug] || {}), ...ov };
  fs.writeFileSync(file, JSON.stringify(all, null, 2) + '\n');
  return true;
}

function runPipeline(domain, kindFlag, res, extra = {}) {
  const args = ['engine/pipeline.mjs', domain, '--pages'];
  if (kindFlag) args.push(...kindFlag.split(' '));
  const child = spawn(process.execPath, args, { cwd: ROOT });
  let out = '', err = '';
  child.stdout.on('data', d => out += d);
  child.stderr.on('data', d => err += d);
  child.on('close', code => {
    const m = out.match(/published:\s*demos\/([^/\s]+)\/index\.html/);
    if (code === 0 && m) json(res, 200, { ok:true, slug:m[1], log:out.trim() }, extra);
    else json(res, 500, { ok:false, log:(out+'\n'+err).trim() || ('exited with code '+code) }, extra);
  });
}

function git(args) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd: ROOT }, (e, stdout, stderr) =>
      resolve({ ok: !e, out: (stdout||'') + (stderr||'') }));
  });
}

async function publish(slug, res, extra = {}) {
  if (!/^[a-z0-9-]+$/.test(slug)) return json(res, 400, { ok:false, log:'bad slug' }, extra);
  const steps = [];
  let r = await git(['add', '-f', `demos/${slug}`, 'engine/content-overrides.json']); steps.push(r.out);
  if (!r.ok) return json(res, 500, { ok:false, log:steps.join('\n') }, extra);
  r = await git(['-c','user.name=Sightline Site Maker','-c','user.email=kris.emery@brains-and-motion.com',
                 'commit','-m',`Publish demo: ${slug}`]); steps.push(r.out);
  if (!r.ok && !/nothing to commit/.test(r.out)) return json(res, 500, { ok:false, log:steps.join('\n') }, extra);
  r = await git(['push','origin','main']); steps.push(r.out);
  if (!r.ok) return json(res, 500, { ok:false, log:steps.join('\n') }, extra);
  json(res, 200, { ok:true, url:`https://sightline-studio.vercel.app/demos/${slug}/`, log:steps.join('\n') }, extra);
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sightline Site Maker</title>
<style>
:root{--navy:#0B2447;--teal:#10B6A8;--bg:#f4f7fb;--ink:#182433}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 -apple-system,Inter,sans-serif;background:var(--bg);color:var(--ink)}
header{background:var(--navy);color:#fff;padding:14px 22px;display:flex;align-items:center;gap:10px}
header b{font-size:17px}header span{opacity:.7;font-size:13px}
main{max-width:1100px;margin:22px auto;padding:0 18px}
.card{background:#fff;border:1px solid #e3e8ef;border-radius:14px;padding:18px;margin-bottom:16px;box-shadow:0 1px 3px rgba(11,36,71,.06)}
label{font-weight:600;font-size:13px;display:block;margin-bottom:4px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
input,select{padding:10px 12px;border:1px solid #cfd8e3;border-radius:9px;font-size:15px;min-width:240px}
button{padding:11px 20px;border:0;border-radius:9px;font-size:15px;font-weight:600;cursor:pointer}
.go{background:var(--teal);color:#fff}.pub{background:var(--navy);color:#fff}
button:disabled{opacity:.5;cursor:default}
pre{background:#0e1726;color:#c9e3ff;border-radius:9px;padding:12px;font-size:12.5px;white-space:pre-wrap;max-height:180px;overflow:auto}
iframe{width:100%;height:640px;border:1px solid #e3e8ef;border-radius:12px;background:#fff}
.ok{color:#0a7d5c;font-weight:600}.bad{color:#b3261e;font-weight:600}
.hint{font-size:13px;color:#5b6b7d;margin-top:6px}
a{color:var(--navy)}
</style></head><body>
<header><b>Sightline Site Maker</b><span>generate → preview → publish</span></header>
<main>
<div class="card">
  <div class="row">
    <div><label>Prospect's website</label><input id="domain" placeholder="e.g. sunnysidedental.com" autofocus></div>
    <div><label>Type (optional — auto-detects)</label>
      <select id="kind"><option value="">Auto-detect</option>
        <option value="--vertical dental">Dental</option><option value="--vertical medical">Medical</option>
        <option value="--vertical law">Law</option><option value="--vertical medspa">Med spa</option>
        <option value="--vertical business">General business</option>
        <option value="--tradition catholic">Church — Catholic</option>
        <option value="--tradition mainline">Church — Mainline</option>
        <option value="--tradition contemporary">Church — Contemporary</option></select></div>
    <button class="go" id="run">Generate site</button>
  </div>
  <p class="hint">Takes ~10–30 seconds. We fetch their current site, detect the business, and build a full demo.</p>
  <pre id="log" hidden></pre>
</div>
<div class="card" id="result" hidden>
  <div class="row" style="justify-content:space-between">
    <div><b id="rtitle"></b> <span class="hint" id="rpath"></span></div>
    <div class="row">
      <button class="go" id="reopen">Open full size</button>
      <button class="pub" id="pub">Publish to live site</button>
    </div>
  </div>
  <p id="pubmsg"></p>
  <iframe id="pv" title="Demo preview"></iframe>
</div>
</main>
<script>
const $=id=>document.getElementById(id);let SLUG=null;
$("run").onclick=async()=>{
  const domain=$("domain").value.trim(); if(!domain){$("domain").focus();return;}
  $("run").disabled=true;$("run").textContent="Generating…";$("log").hidden=false;$("log").textContent="Working on "+domain+" …";
  try{
    const r=await fetch("/api/run",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({domain,kind:$("kind").value})});
    const d=await r.json();$("log").textContent=d.log;
    if(d.ok){SLUG=d.slug;$("result").hidden=false;$("rtitle").textContent="Demo ready: "+d.slug;
      $("rpath").textContent="(demos/"+d.slug+"/ — on this computer only, not live yet)";
      $("pv").src="/demos/"+d.slug+"/";$("pubmsg").textContent="";window.scrollTo({top:400,behavior:"smooth"});}
  }catch(e){$("log").textContent="Something went wrong: "+e;}
  $("run").disabled=false;$("run").textContent="Generate site";
};
$("reopen").onclick=()=>window.open("/demos/"+SLUG+"/","_blank");
$("pub").onclick=async()=>{
  if(!SLUG)return;
  if(!confirm("Publish this demo to the live site? It will be visible at sightline-studio.vercel.app/demos/"+SLUG+"/"))return;
  $("pub").disabled=true;$("pub").textContent="Publishing…";
  const r=await fetch("/api/publish",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({slug:SLUG})});
  const d=await r.json();
  $("pubmsg").innerHTML=d.ok?('<span class="ok">Published!</span> Live in ~2 min at <a target="_blank" href="'+d.url+'">'+d.url+'</a>')
    :('<span class="bad">Publish failed.</span> <details><summary>details</summary><pre>'+d.log.replace(/</g,"&lt;")+'</pre></details>');
  $("pub").disabled=false;$("pub").textContent="Publish to live site";
};
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const C = cors(req);
  if (req.method === 'OPTIONS') { res.writeHead(204, C); return res.end(); }
  if (url.pathname === '/api/ping') return json(res, 200, { ok:true, app:'sightline-site-maker' }, C);
  if (url.pathname === '/' ) { res.writeHead(200, {'content-type':'text/html'}); return res.end(PAGE); }
  if (req.method === 'POST' && (url.pathname === '/api/run' || url.pathname === '/api/publish')) {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      let b = {}; try { b = JSON.parse(body || '{}'); } catch {}
      if (url.pathname === '/api/run') {
        const domain = String(b.domain||'').trim().replace(/^https?:\/\//,'').split('/')[0];
        if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return json(res, 400, {ok:false, log:'Please enter a website like sunnysidedental.com'}, C);
        const kind = ['--vertical dental','--vertical medical','--vertical law','--vertical medspa','--vertical business',
          '--tradition catholic','--tradition mainline','--tradition contemporary'].includes(b.kind) ? b.kind : '';
        // reviewed intake profile (optional) → highest-priority content override
        const slug = domain.replace(/^www\./,'').replace(/\./g,'-').toLowerCase();
        try { if (b.profile) saveOverride(slug, b.profile); } catch (e) { console.warn('override save failed:', e.message); }
        return runPipeline(domain, kind, res, C);
      }
      return publish(String(b.slug||''), res, C);
    });
    return;
  }
  // static file serving from the project root (for previews + assets)
  const safe = path.normalize(url.pathname).replace(/^(\.\.[\/\\])+/, '');
  let file = path.join(ROOT, safe);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (e, data) => {
    if (e) { res.writeHead(404, {'content-type':'text/plain'}); return res.end('Not found'); }
    res.writeHead(200, {'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'});
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  Sightline Site Maker running → ${url}\n  (leave this window open; close it to stop)\n`);
  execFile('open', [url], () => {});
});
