# CLAUDE.md — sightline-studio working rules

Read this before touching anything. These rules were paid for with two days of pain;
the full story is in `POSTMORTEM-2026-07-09.md`. Rules are short on purpose — long
documents in this repo have been read and ignored before (see ENGINE-REVIEW.md §2a,
which named the #1 root cause and sat unfixed through an entire engine overhaul).

## The five laws

1. **LOOK before you say "done."** Screenshot the actual page (Chrome/Playwright) and
   view it. Structure passing QA means nothing about how it looks. Every "fixed" claim
   requires pixels.
2. **One writer on main.** If another session/agent may be working this repo, STOP and
   confirm. Parallel engine edits here have already produced chimera code (functions
   called but never defined). `git pull` first, always.
3. **Production only via `node engine/release.mjs`.** Never hand-push generated sites.
   The release aborts on gate failure and that is correct behavior — fix the cause,
   never bypass the gate.
4. **Gates at the entrance.** Validate assets when they enter a pool (is this image a
   photograph? does this logo belong to this business?), not at each slot that uses
   them. New checks should be general, not scar-tissue for one incident.
5. **Every defect is a class.** One good example proves nothing; one bad example means
   siblings exist. Fix the rule, then verify on several instances.

## Known landmines (current as of 2026-07-09)

- **Cached capture is single-page** — the #1 quality root cause. Until the v7 capture
  rework lands, cached builds see only the homepage: starved photos, thin content.
  Do not "fix" downstream symptoms of this again; fix or respect the capture layer.
- `engine/preview/recipes.json` — per-site recipe locks written by heal.mjs;
  **pipeline.mjs honors them silently**. Stale locks override recipe logic.
- Art critic judges above-the-fold only (known gap). Do not treat a critic pass as
  whole-page approval yet.
- Playwright: the option is `viewport`, NOT `viewportSize` (silently ignored).
- Never derive file extensions from URLs — sniff magic bytes (`sniffExt` in capture.mjs).
- Never hard-`slice()` display text — trim at word boundaries (`trimWords`).
- Long background jobs on the Mac need `caffeinate -i` and `disown`, and status checks
  must `pgrep` the real process — a dead-looking chain once spawned a duplicate regen.
- Keys in `.sightline.env` (gitignored): ANTHROPIC_API_KEY (both AI passes), PEXELS_KEY.
  Model overrides: AI_MODEL, EXTRACT_MODEL, CRITIC_MODEL.
- `content-overrides.json` is hand-verified truth — it must beat all extraction.
- Public gallery = root `/slug/` folders synced by `engine/promote.mjs` from `demos/`;
  homepage thumbs live in `/thumbs/`. Regens do NOT update the gallery by themselves.

## The toolbox (all in engine/)

`release.mjs` one-button gated deploy · `pipeline.mjs` one prospect → demo ·
`regen.mjs` serial rebuild (release does it parallel) · `qa.mjs` structural gate ·
`art-critic.mjs` AI visual judge · `heal.mjs` recipe bake-off for flagged sites ·
`promote.mjs` demos→live gallery+thumbs · `variants.mjs` 6-style chooser (sales) ·
`photo-engine.mjs` stock tiers + vision gates · `fetch-stock.mjs` Pexels/Unsplash ·
`outreach.mjs` one-pagers · `showcase.mjs` name anonymization · `crm.mjs` status.

## Quality bar

The reference for "good" is the hand-built compfm-com and the 8/10 builds
(Acacia split, araoent editorial). If a build wouldn't sit comfortably next to those,
it does not ship. The customer's standard, not the engine's excuse.
