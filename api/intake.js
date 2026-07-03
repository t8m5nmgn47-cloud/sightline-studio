// POST /api/intake — Prospect Intake Engine.
// Admin-only (protected by the Basic-Auth middleware, same as /admin/*).
// Body: { domain: "example.com", render?: boolean }
// Returns: { ok, tier, signals, profile }  — profile is null when no LLM key.

import { readBody, clean, methodGuard } from "./_lib.js";
import { fetchHtml, renderHtml, extractSignals, normalizeWithClaude, llmAvailable } from "./_intake.js";

const DOMAIN_RE = /^([a-z0-9-]+\.)+[a-z]{2,}$/i;

export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;

  const body = readBody(req);
  const domain = clean(body.domain, 253).replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  const forceRender = body.render === true;

  if (!domain || !DOMAIN_RE.test(domain)) {
    return res.status(400).json({ ok: false, error: "Enter a valid domain, e.g. example.com" });
  }

  // Fast tier.
  let fetched = await fetchHtml(domain);
  if (!fetched.ok) {
    return res.status(502).json({ ok: false, error: `Could not reach ${domain}: ${fetched.error}` });
  }

  let signals = extractSignals(fetched.html, fetched.finalUrl);
  let tier = fetched.tier;

  // Escalate to headless Chromium when the fast tier looks like a JS shell,
  // or when the caller explicitly asks. Failure-tolerant: keep fast-tier
  // signals if the render can't run (e.g. Chromium deps unavailable).
  if (signals.js_shell || forceRender) {
    const rendered = await renderHtml(domain);
    if (rendered.ok) {
      signals = extractSignals(rendered.html, rendered.finalUrl);
      tier = rendered.tier;
    }
  }

  // LLM normalisation (enhancer). Never fatal — return the deterministic draft
  // regardless, so the review UI always has something to work with.
  let profile = null;
  let llm = { available: llmAvailable() };
  if (llm.available) {
    const r = await normalizeWithClaude(signals);
    if (r.ok) profile = r.profile;
    else llm.error = r.error || r.reason;
  }

  // Trim the heavy visible_text out of the response — the client doesn't need it.
  const { visible_text, ...slim } = signals;

  return res.status(200).json({ ok: true, tier, llm, signals: slim, profile });
}
