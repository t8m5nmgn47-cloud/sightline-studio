# Handoff — Engine Convergence branch ready (July 13, 2026)

*Cloud Cowork session (Kris + Claude). Work lives on branch `engine-converge` — **5 commits, already fetched into this local repo**. Nothing touched main; nothing pushed; nothing released.*

## What's on `engine-converge` (branched from origin/main @ cf1cd3b)

1. `cee6aa6` **Engine hygiene** — dead duplicate renderers removed (S.about/S.gallery/S.faq + orphaned CSS); no more invented hours/mass times; esc() on ALL captured content incl. `</script>` hardening in concierge + JSON-LD; **mobile hamburger nav** (links no longer vanish ≤720px); accent contrast clamp ≥3.0.
2. `57f1cff` **Capture/ops** — srcset biggest-pick fix; photo pool 24→36; vision-gate cwd fix (was silently disabled off-root); `CHROME_BIN` env everywhere; release: pid-namespaced tmp, **no more `git pull -X ours`**, rendered QA at release.
3. `918954f` **Public site** — Monitoring→Business Intelligence on 13 pages (add-on tile deliberately left); `/data` + `/outreach` behind admin Basic Auth in middleware.
4. `3a0622b` **Variety system (Phase A1)** — `engine/variety.mjs` seeded structure/font/shape spread (precedence: flags > strategy > variety > fallback); captured brand font always wins; 3 copy variants per church section; `engine/variety-check.mjs` distinctness gate wired into release (step 5/8); recipes.json declared informational (CLAUDE.md landmine corrected — nothing ever read it).
5. `31d39f9` **Critic v2** — full-page desktop + 390px mobile in one vision call; rubric covers all sections (logo-as-photo class) + mobile usability; release reads critic-report.json (dies loudly if missing — no more emoji-count with total=1); API errors fail CLOSED.

All verified in the cloud: selftest ✓, variety-check ✓, syntax ✓, plus **rendered screenshots** (hamburger open/close on 2 archetypes, escaping proven with hostile fixtures, variety divergence on same-hue dentals). What could NOT be verified without keys: one real critic-v2 vision pass — sanity-check on ONE site before the next release.

## State of THIS Mac checkout (found during delivery — needs Kris)

- **Behind origin by 6 commits** (the Tax Junkie/handoff set). `git pull` will fast-forward main to cf1cd3b.
- **243 dirty files**, mostly `assets/captured/*/photos/*` — looks like a local regen re-downloaded photos. Review → likely `git checkout -- assets/` or commit intentionally. Resolve BEFORE merging anything.

## Suggested order (on this Mac)

```
git status                      # review the 243 dirty files, then clean or commit them
git checkout main && git pull   # ff to cf1cd3b
git merge engine-converge       # should be clean; branch is based on cf1cd3b
node engine/selftest.mjs && node engine/variety-check.mjs
node engine/art-critic.mjs <one-slug>          # real-key sanity check of critic v2
node engine/regen.mjs --pages                  # caffeinate -i, per landmine notes
node engine/release.mjs --dry, then real       # laws #1 and #3 as always
```

Docs from this session in repo root: `ENGINE-ANALYSIS-2026-07-12.md` (25 findings) and `MIGRATION-PLAN-ENGINE-CONVERGE.md` (the plan; Phases 0, A1 and critic-v2 prerequisite are DONE on this branch — Phase A2 art-direction mining and A3 retirement of business-designs/church-designs are NOT yet done and remain next).
