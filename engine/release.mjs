// ─────────────────────────────────────────────────────────────────────────────
// RELEASE — the one button. Nothing reaches production except through this.
//
//   node engine/release.mjs                # full release: test → build → gate → deploy
//   node engine/release.mjs --dry          # everything except commit+push
//   node engine/release.mjs --skip-critic  # skip the AI visual pass (faster)
//   node engine/release.mjs --par 6        # parallel width (default 6)
//
// The pipeline, in order — each step is a HARD GATE unless noted:
//   1. SMOKE     build one known-good site; any engine crash aborts before
//                touching the portfolio (kills merge-chimera class bugs)
//   2. BUILD     parallel regen of every cached prospect (--pages)
//   3. RETRY     failed builds get one serial retry with visible errors
//   4. QA        full QA (static + rendered when Chrome exists) on every site —
//                any FAIL aborts the release
//   5. VARIETY   distinctness gate (variety-check.mjs) — same-vertical recipe
//                collapse aborts the release
//   6. CRITIC    AI visual scoring (full-page desktop + mobile) — counts come
//                from engine/preview/critic-report.json, never stdout parsing;
//                flags trigger heal; >15% still flagged after heal aborts
//   7. PROMOTE   sync live gallery + thumbnails + showcase anonymization
//   8. DEPLOY    commit + push (Vercel auto-deploys) — only if all green
//
// Design rule learned the hard way: partial deploys and untested engine edits
// caused every bad day. This script makes both impossible.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = k => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : null; };
const DRY = args.includes('--dry');
const PAR = +(flag('par') || 6);
const SKIP_CRITIC = args.includes('--skip-critic');
const SMOKE_DOMAIN = flag('smoke') || 'araoent.com';

const t0 = Date.now();
const step = (n, msg) => console.log(`\n━━ [${n}/8] ${msg} ${'━'.repeat(Math.max(0, 46 - msg.length))} ${((Date.now()-t0)/1000|0)}s`);
const die = (msg) => { console.error(`\n🛑 RELEASE ABORTED — ${msg}\nNothing was deployed. Production is untouched.`); process.exit(1); };
const run = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: opts.quiet ? ['ignore','pipe','pipe'] : 'inherit', ...opts });

// ── 1. SMOKE: the engine must build a site before it may build the portfolio ──
step(1, `SMOKE TEST (${SMOKE_DOMAIN})`);
try {
  execFileSync('node', [path.join(ROOT,'engine/pipeline.mjs'), SMOKE_DOMAIN, '--pages', '--no-render-qa'],
    { cwd: ROOT, encoding: 'utf8', timeout: 300000, stdio: ['ignore','pipe','pipe'] });
  console.log('✅ engine builds clean');
} catch (e) {
  console.error(String((e.stdout||'') + (e.stderr||'')).split('\n').slice(-12).join('\n'));
  die('engine smoke test failed — fix the engine before releasing');
}

// ── 2. BUILD: parallel regen of every cached prospect ────────────────────────
step(2, `PARALLEL BUILD (${PAR}-wide)`);
const DIRS = ['assets/harvest/business','assets/harvest/fc','assets/harvest/nucleus','assets/harvest/competitors'];
const domains = new Set();
for (const d of DIRS) {
  const full = path.join(ROOT, d);
  if (!fs.existsSync(full)) continue;
  for (const f of fs.readdirSync(full)) if (f.endsWith('.html')) domains.add(f.replace(/\.html$/,'').replace(/^fc-/,''));
}
const list = [...domains];
const slugify = d => d.replace(/[^a-z0-9]+/gi,'-').toLowerCase();
const slugs = list.map(slugify);
console.log(`${list.length} prospects`);
// pid-namespaced tmp files so two releases (or a stale crash) never share state
const DOMAINS_TMP = `/tmp/release-${process.pid}-domains.txt`;
const FAILS_TMP = `/tmp/release-${process.pid}-fails.txt`;
fs.rmSync(DOMAINS_TMP, { force: true });
fs.rmSync(FAILS_TMP, { force: true });
fs.writeFileSync(DOMAINS_TMP, list.join('\n'));
run(`cat ${DOMAINS_TMP} | xargs -P ${PAR} -I{} sh -c 'node engine/pipeline.mjs {} --pages --no-render-qa > /dev/null 2>&1 || echo {} >> ${FAILS_TMP}'`, { quiet: true });
let fails = fs.existsSync(FAILS_TMP) ? fs.readFileSync(FAILS_TMP,'utf8').trim().split('\n').filter(Boolean) : [];
console.log(`✅ ${list.length - fails.length}/${list.length} built${fails.length ? `  (${fails.length} to retry)` : ''}`);

// ── 3. RETRY: one serial retry with errors visible ───────────────────────────
step(3, 'RETRY FAILURES');
const stillFailing = [];
for (const d of fails) {
  try {
    execFileSync('node', [path.join(ROOT,'engine/pipeline.mjs'), d, '--pages', '--no-render-qa'],
      { cwd: ROOT, encoding: 'utf8', timeout: 300000, stdio: ['ignore','pipe','pipe'] });
    console.log(`✅ ${d} (retry)`);
  } catch (e) {
    console.error(`❌ ${d}: ${String((e.stdout||'')+(e.stderr||'')).trim().split('\n').pop()?.slice(0,110)}`);
    stillFailing.push(d);
  }
}
if (stillFailing.length) die(`${stillFailing.length} site(s) will not build: ${stillFailing.join(', ')}`);
if (!fails.length) console.log('nothing to retry');

// ── 4. QA: full gate (static + rendered when Chrome is available) ───────────
step(4, 'QA GATE');
try { run(`node engine/qa.mjs ${slugs.join(' ')}`, { quiet: true }); console.log('✅ all release sites pass QA'); }
catch (e) {
  console.error(String(e.stdout||'').split('\n').filter(l=>/❌|✗/.test(l)).slice(0,20).join('\n'));
  die('QA failures — the gate is the gate');
}

// ── 5. VARIETY: distinctness gate — same-vertical recipes must not collapse ──
step(5, 'VARIETY GATE');
try { run('node engine/variety-check.mjs', { quiet: true }); console.log('✅ variety gate passed — same-vertical fixtures stay distinct'); }
catch (e) {
  console.error(String((e.stdout || '') + (e.stderr || '')).split('\n').filter(Boolean).slice(-14).join('\n'));
  die('variety check failed — same-vertical recipes collapsed; fix the spread, never bypass the gate');
}

// ── 6. CRITIC: AI eyes on every site (full-page desktop + mobile) ────────────
// Counts come from the critic's machine-readable report, NOT from parsing
// emoji off stdout — a garbled pipe once turned "n sites" into "1 site" and
// corrupted the ≤15% threshold. Missing/unreadable report = hard abort.
const CRITIC_REPORT = path.join(ROOT, 'engine/preview/critic-report.json');
const runCritic = (label) => {
  fs.rmSync(CRITIC_REPORT, { force: true });             // never read a stale report
  try { run(`node engine/art-critic.mjs ${slugs.join(' ')}`, { quiet: true }); }
  catch {} // critic exits 1 when anything flags — the report is the verdict
  let rep;
  try {
    rep = JSON.parse(fs.readFileSync(CRITIC_REPORT, 'utf8'));
    if (!Array.isArray(rep) || !rep.length) throw new Error('report empty or not an array');
  } catch (e) {
    die(`critic ${label}: ${CRITIC_REPORT} missing or unreadable after the run (${e.message}) — refusing to guess flag counts`);
  }
  const flaggedEntries = rep.filter(r => r.flagged ?? (r.error != null || r.verdict === 'flag'));
  for (const r of flaggedEntries.slice(0, 12))
    console.log(`🚩 ${r.slug}  ${r.error ? '— ' + r.error : `${r.score}/10${(r.issues || []).length ? '  — ' + r.issues.slice(0, 2).join(' · ') : ''}`}`);
  if (!flaggedEntries.length) console.log('(no flags)');
  return { total: rep.length, flagged: flaggedEntries.length };
};
step(6, SKIP_CRITIC ? 'CRITIC (skipped)' : 'AI VISUAL CRITIC');
if (!SKIP_CRITIC) {
  const r1 = runCritic('first run');
  console.log(`critic: ${r1.total - r1.flagged}/${r1.total} at or above the bar`);
  if (r1.flagged) {
    console.log(`\n⚕ HEALING ${r1.flagged} flagged site(s) — competing recipes, critic picks each winner…`);
    try { run('node engine/heal.mjs'); } catch { console.log('heal exited nonzero — continuing to re-verdict'); }
    const r2 = runCritic('post-heal run');
    console.log(`critic after heal: ${r2.total - r2.flagged}/${r2.total} at or above the bar`);
    if (r2.flagged / r2.total > 0.15) die(`${r2.flagged} sites still flagged after healing — review critic-report.json`);
    if (r2.flagged) console.log(`⚠ ${r2.flagged} residual flags (≤15%) — releasing; they are listed in critic-report.json for manual review`);
  }
}

// ── 7. PROMOTE: live gallery + thumbnails + anonymization ────────────────────
step(7, 'PROMOTE GALLERY');
run('node engine/promote.mjs --thumbs', { quiet: true });
run('node engine/showcase.mjs', { quiet: true });
console.log('✅ gallery, thumbnails, showcase synced');

// ── 8. DEPLOY ─────────────────────────────────────────────────────────────────
step(8, DRY ? 'DEPLOY (dry run — skipped)' : 'DEPLOY');
if (!DRY) {
  run('git add -A', { quiet: true });
  try { run(`git commit -m "release: ${new Date().toISOString().slice(0,16)} — full portfolio via release.mjs (all gates green)"`, { quiet: true }); }
  catch { console.log('nothing new to commit'); }
  try { run('git push origin main', { quiet: true }); }
  catch {
    console.log('push rejected — pulling (no auto-resolution) and retrying once');
    // NEVER `-X ours` here: that silently discarded another machine's commits.
    try { run('git pull --no-rebase origin main --no-edit', { quiet: true }); }
    catch {
      die('push rejected and the merge pull hit conflicts — another machine\'s commits diverge from local. Reconcile main MANUALLY (inspect `git status`, resolve or `git merge --abort`), then re-run release. Do not auto-resolve preferring ours.');
    }
    try { run('git push origin main', { quiet: true }); }
    catch {
      die('re-push failed after a clean pull — remote moved again or is protected. Reconcile main manually and re-run release.');
    }
  }
  console.log('✅ PUSHED — Vercel is deploying');
}
console.log(`\n🏁 RELEASE ${DRY ? 'DRY-RUN ' : ''}COMPLETE in ${((Date.now()-t0)/60000).toFixed(1)} min — ${list.length} sites, every gate green.`);
