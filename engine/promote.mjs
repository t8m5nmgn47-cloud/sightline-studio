// ─────────────────────────────────────────────────────────────────────────────
// Promote — sync freshly regenerated demos into the LIVE gallery.
//
// The homepage "Websites" cards link to root-level /<slug>/ folders, which are
// promoted COPIES of demos/<slug>/. Regens update demos/; this script closes
// the loop so the public gallery is never stale again.
//
//   node engine/promote.mjs              # update every existing gallery folder
//   node engine/promote.mjs <slug>…      # just these
//   node engine/promote.mjs --add <slug> # promote a NEW site into the gallery
//   node engine/promote.mjs --thumbs     # also refresh /thumbs/<slug>.jpg cards
//
// Only slugs ALREADY in the gallery are touched by default (the gallery is
// curated — regen shouldn't silently publish new prospects). Homepage card
// images live at /thumbs/<slug>.jpg; --thumbs re-renders them with Chrome.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const addIdx = args.indexOf('--add');
const addSlugs = addIdx > -1 ? args.slice(addIdx + 1).filter(a => !a.startsWith('--')) : [];
const named = args.filter((a, i) => !a.startsWith('--') && (addIdx === -1 || i < addIdx));
const doThumbs = args.includes('--thumbs');

// existing gallery = root folders that have an index.html AND a demos twin
const galleryOf = () => fs.readdirSync(ROOT).filter(d =>
  !d.startsWith('.') && !['demos','assets','engine','thumbs','node_modules','api','sql','supabase','outreach','styles','teardowns','bi'].includes(d) &&
  fs.existsSync(path.join(ROOT, d, 'index.html')) &&
  fs.existsSync(path.join(ROOT, 'demos', d, 'index.html')));

const targets = named.length ? named : [...galleryOf(), ...addSlugs];
let done = 0, skipped = 0;
for (const slug of new Set(targets)) {
  const src = path.join(ROOT, 'demos', slug);
  if (!fs.existsSync(path.join(src, 'index.html'))) { console.log(`⚠ ${slug}: no demos build — skipped`); skipped++; continue; }
  const dst = path.join(ROOT, slug);
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    if (!/\.(html|xml)$/.test(f)) continue;
    fs.copyFileSync(path.join(src, f), path.join(dst, f));
  }
  console.log(`✓ ${slug} promoted (${fs.readdirSync(src).filter(f=>f.endsWith('.html')).length} pages)`);
  done++;
}
console.log(`\nPROMOTE: ${done} updated${skipped ? `, ${skipped} skipped` : ''}. Homepage gallery now serves the current engine builds.`);

// optional: refresh the homepage card thumbnails (needs Chrome)
if (doThumbs && done) {
  try {
    const { chromium } = await import('playwright-core');
    let exe = null;
    for (const bin of [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean))
      if (fs.existsSync(bin)) { exe = bin; break; }
    if (!exe) throw new Error('no Chrome');
    const sharp = (await import('sharp')).default;
    const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
    const pg = await b.newPage({ viewport: { width: 1200, height: 1500 } });   // 4:5 like the cards
    fs.mkdirSync(path.join(ROOT, 'thumbs'), { recursive: true });
    for (const slug of new Set(targets)) {
      if (!fs.existsSync(path.join(ROOT, slug, 'index.html'))) continue;
      await pg.goto('file://' + path.join(ROOT, slug, 'index.html'), { waitUntil: 'load', timeout: 20000 });
      await pg.waitForTimeout(900);
      const png = await pg.screenshot();
      await sharp(png).resize({ width: 640 }).jpeg({ quality: 78 }).toFile(path.join(ROOT, 'thumbs', slug + '.jpg'));
      console.log(`  📷 thumbs/${slug}.jpg`);
    }
    await b.close();
  } catch (e) { console.log('thumbs skipped: ' + (e.message || e)); }
}
