// ─────────────────────────────────────────────────────────────────────────────
// Display-text helpers. The rule (CLAUDE.md): never hard-slice() text a visitor
// will read. A hard slice once shipped "…closely aligned wi" in a hero and
// "…defend you, or compen" in an FAQ answer.
// ─────────────────────────────────────────────────────────────────────────────

// Clamp at a word boundary (prefer a sentence end) and mark the cut with '…'.
export function clampWords(v, max) {
  if (typeof v !== 'string') return '';
  const t = v.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (sentence >= max * 0.6) return cut.slice(0, sentence + 1);
  const space = cut.lastIndexOf(' ');
  return cut.slice(0, space > max * 0.5 ? space : max).replace(/[,;:\-–—\s]+$/, '') + '…';
}
