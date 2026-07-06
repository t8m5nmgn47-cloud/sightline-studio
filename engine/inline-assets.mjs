// ─────────────────────────────────────────────────────────────────────────────
// Self-contained demos — inline every local image as a base64 data URI so the
// page renders identically opened as a file, in a preview pane, attached to an
// email, or deployed. A demo that depends on a folder structure is a demo
// that shows up broken exactly when a prospect looks at it.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';

const MIME = { webp:'image/webp', jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', svg:'image/svg+xml', ico:'image/x-icon' };
const MAX_ONE = 2 * 1024 * 1024;      // skip single files over 2 MB
const MAX_TOTAL = 12 * 1024 * 1024;   // stop inlining past 12 MB of images
const COMPRESS_OVER = 120 * 1024;     // photos above this get recompressed when sharp is installed

// optional: sharp (npm install sharp) → photos resized to ≤1600px wide and
// re-encoded as WebP q78 before inlining. Cuts typical demo weight ~70%.
let _sharp;
async function getSharp() {
  if (_sharp !== undefined) return _sharp;
  try { _sharp = (await import('sharp')).default; } catch { _sharp = null; }
  return _sharp;
}

// html: page markup; baseDir: directory the page will be written to (refs are
// resolved against it); ROOT for /-absolute refs.
export async function inlineAssets(html, baseDir, ROOT) {
  let total = 0;
  const cache = new Map();
  const sharp = await getSharp();
  const toDataUri = async (ref) => {
    const clean = ref.split('?')[0];
    if (cache.has(clean)) return cache.get(clean);
    const ext = (clean.split('.').pop() || '').toLowerCase();
    let mime = MIME[ext];
    if (!mime) return null;
    const file = clean.startsWith('/') ? path.join(ROOT, clean) : path.resolve(baseDir, clean);
    try {
      let buf = fs.readFileSync(file);
      // recompress big raster photos (never SVG/ICO/logos-by-extension)
      if (sharp && buf.length > COMPRESS_OVER && /^(webp|jpe?g|png)$/.test(ext) && !/logo/i.test(clean)) {
        try {
          const out = await sharp(buf).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
          if (out.length < buf.length) { buf = out; mime = 'image/webp'; }
        } catch {}
      }
      if (buf.length > MAX_ONE || total + buf.length > MAX_TOTAL) return null;
      total += buf.length;
      const uri = `data:${mime};base64,${buf.toString('base64')}`;
      cache.set(clean, uri);
      return uri;
    } catch { return null; }
  };
  // async replace helper
  const replaceAsync = async (str, re, fn) => {
    const jobs = [];
    str.replace(re, (...args) => { jobs.push(fn(...args)); return ''; });
    const results = await Promise.all(jobs);
    let i = 0;
    return str.replace(re, () => results[i++]);
  };
  // src="..." / href="..." (icons) / url('...') — local refs only
  html = await replaceAsync(html, /(src|href)="([^"]+\.(?:webp|jpe?g|png|gif|svg|ico)(?:\?[^"]*)?)"/gi, async (m, attr, ref) => {
    if (/^(https?:|data:)/i.test(ref)) return m;
    const uri = await toDataUri(ref);
    return uri ? `${attr}="${uri}"` : m;
  });
  html = await replaceAsync(html, /url\(['"]?([^'")]+\.(?:webp|jpe?g|png|gif|svg))['"]?\)/gi, async (m, ref) => {
    if (/^(https?:|data:)/i.test(ref)) return m;
    const uri = await toDataUri(ref);
    return uri ? `url('${uri}')` : m;
  });
  return html;
}

export default { inlineAssets };
