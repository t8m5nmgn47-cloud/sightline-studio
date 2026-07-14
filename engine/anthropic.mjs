// ─────────────────────────────────────────────────────────────────────────────
// Shared Anthropic API caller — retries, backoff, truncation detection.
//
// Root-cause fix (2026-07-14): every AI caller in the engine used to make ONE
// raw fetch and silently return null on any 429/5xx/timeout. Because the
// creative gate structurally depends on llm-extract (serviceDetails) and
// site-strategy (FAQ), one transient API error turned a healthy site into a
// "thin content" gate block — indistinguishable from a real content problem.
// This module retries transient failures with backoff (honoring Retry-After),
// detects max_tokens truncation before it becomes a JSON.parse failure, and
// records persistent INFRA failures in `infraFailures` so pipeline.mjs can
// exit 4 (infra) instead of 3 (content) when the gate blocks.
//
// Rule kept: callers still treat null/{ok:false} as "fall back gracefully".
// No gate threshold changes here — we only stop lying about failure causes.
// ─────────────────────────────────────────────────────────────────────────────

export const infraFailures = [];   // strings; pipeline.mjs reads this at gate time

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// recordInfra:false is for fail-open callers (vision gates) whose failure
// cannot starve the creative gate — they must not trigger an exit-4 verdict.
export async function callAnthropic(body, { key, timeoutMs = 60000, label = 'anthropic', maxAttempts = 3, recordInfra = true } = {}) {
  if (!key) return { ok: false, reason: 'no key' };
  let lastReason = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: ac.signal,
        headers: { 'x-api-key': String(key).trim(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        // Truncated output becomes unparseable JSON downstream — retry larger
        // instead of letting the parse failure masquerade as "no content".
        if (data.stop_reason === 'max_tokens' && attempt < maxAttempts) {
          console.error(`${label}: output truncated at max_tokens=${body.max_tokens} — retrying with a larger budget`);
          body = { ...body, max_tokens: Math.min((body.max_tokens || 2000) * 2, 8192) };
          continue;
        }
        return { ok: true, data };
      }
      lastReason = `API ${res.status}`;
      const retryable = res.status === 429 || res.status === 408 || res.status >= 500;
      if (!retryable || attempt === maxAttempts) break;
      const retryAfter = Number(res.headers.get('retry-after')) || 0;
      const wait = Math.max(retryAfter * 1000, 2500 * attempt * attempt);   // 2.5s, 10s, …
      console.error(`${label}: ${lastReason} — retrying in ${Math.round(wait / 1000)}s (attempt ${attempt}/${maxAttempts})`);
      await sleep(wait);
    } catch (e) {
      lastReason = e.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : (e.message || String(e));
      if (attempt === maxAttempts) break;
      const wait = 2500 * attempt * attempt;
      console.error(`${label}: ${lastReason} — retrying in ${Math.round(wait / 1000)}s (attempt ${attempt}/${maxAttempts})`);
      await sleep(wait);
    } finally { clearTimeout(timer); }
  }
  if (recordInfra) infraFailures.push(`${label}: ${lastReason}`);
  console.error(`${label}: gave up after ${maxAttempts} attempts (${lastReason}) — INFRA failure, not a content verdict`);
  return { ok: false, reason: lastReason };
}

export default { callAnthropic, infraFailures };
