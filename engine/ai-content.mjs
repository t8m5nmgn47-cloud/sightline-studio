// ─────────────────────────────────────────────────────────────────────────────
// AI content — reads a prospect's OWN public site and writes THEIR real services,
// a tailored headline, and about copy in their voice. This is what turns a
// template into a site that makes the owner feel seen.
//
// Uses the prospect's public page text only. Nothing is invented: the model is
// told to extract what the business actually says about itself, and to leave a
// field blank rather than guess. Falls back silently when no key is set, so the
// engine keeps working exactly as before.
//
// KEY (optional): add to .sightline.env (gitignored, stays on your Mac):
//   ANTHROPIC_KEY=sk-ant-...
//   AI_MODEL=claude-haiku-4-5-20251001   (optional override)
// ~a fraction of a cent per prospect with Haiku.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callAnthropic } from './anthropic.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

export function aiKey(){
  const k = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY;
  if (k) return k.trim();
  const f = path.join(ROOT, '.sightline.env');
  if (fs.existsSync(f)){ const m = fs.readFileSync(f,'utf8').match(/ANTHROPIC(?:_API)?_KEY\s*=\s*(\S+)/); if (m) return m[1]; }
  return null;
}
function aiModel(){
  if (process.env.AI_MODEL) return process.env.AI_MODEL.trim();
  const f = path.join(ROOT, '.sightline.env');
  if (fs.existsSync(f)){ const m = fs.readFileSync(f,'utf8').match(/AI_MODEL\s*=\s*(\S+)/); if (m) return m[1]; }
  return 'claude-haiku-4-5-20251001';
}

// Strip a captured page down to the readable words the model needs.
function pageText(cap){
  const parts = [];
  if (cap.sig?.title) parts.push('TITLE: ' + cap.sig.title);
  if (cap.sig?.description) parts.push('META: ' + cap.sig.description);
  const vt = cap.sig?.visible_text || '';
  if (vt) parts.push(vt);
  return parts.join('\n').replace(/\s+/g, ' ').trim().slice(0, 7000);
}

// Ask Claude to extract the business's real content. Returns null on any failure
// so the caller falls back to heuristics/defaults.
export async function aiContent(cap, { name, vertical, type = 'business' } = {}){
  const KEY = aiKey();
  if (!KEY) return null;
  const text = pageText(cap);
  if (text.length < 120) return null;   // too little to work with

  const kind = type === 'church' ? 'church/ministry' : (vertical || 'local business');
  const prompt =
`You are helping rebuild the website for "${name}", a ${kind}. Below is the readable text captured from THEIR OWN current website. Extract only what the business genuinely says about itself — never invent services, claims, numbers, or credentials. If something isn't clearly supported by the text, leave it out.

Return ONLY valid JSON, no prose, in exactly this shape:
{
  "services": ["4 to 6 of their ACTUAL services/offerings, in their own terms, each 2-5 words, Title Case"],
  "headline": "a confident 6-11 word hero headline true to what they actually do (no clichés like 'welcome to')",
  "subhead": "one plain sentence (max 22 words) describing who they help and how, grounded in the text",
  "about": "2-3 sentences of about copy in their voice, only facts present in the text",
  "specialty": "the single thing they're most known for, 2-6 words, or empty string if unclear"
}

THEIR WEBSITE TEXT:
"""${text}"""`;

  const r = await callAnthropic(
    { model: aiModel(), max_tokens: 700, temperature: 0, messages: [{ role: 'user', content: prompt }] },
    { key: KEY, timeoutMs: 45000, label: 'ai-content' },
  );
  if (!r.ok){ if (/401/.test(r.reason || '')) console.error('  ⚠ AI content: key rejected (check ANTHROPIC_KEY)'); return null; }
  try {
    const raw = r.data?.content?.[0]?.text || '';
    const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    const out = JSON.parse(json);
    // sanity-filter services
    if (Array.isArray(out.services)) out.services = out.services
      .map(s => String(s).replace(/\s+/g,' ').trim())
      .filter(s => s.length >= 3 && s.length <= 40).slice(0, 6);
    return out;
  } catch (e){ return null; }
}

export default { aiContent, aiKey };
