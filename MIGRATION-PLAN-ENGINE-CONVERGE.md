# Engine Convergence Plan (Option A) — port the taste, retire the parallel renderer
*July 12, 2026 · companion to `engine-analysis-2026-07-12.md` · planned against `main` @ `cf1cd3b` · PLAN ONLY — no changes made yet.*

**Goal:** one engine. `site-engine.mjs` keeps its plumbing (SEO, multi-page, grounding, gates); the design-module system's three unique assets — the variety layer, the design-spread recommender, and the hand-crafted art direction — move into it. Then `business-designs/`/`church-designs/` are formally retired.

**Estimated calendar: ~2 weeks** on the Mac, one writer on main (law #2). Work happens on a branch (`engine-converge`); `main` stays releasable throughout; merge lands via a full `release.mjs` run.

---

## Prerequisites (from the analysis report — land these first)

These aren't optional niceties; the plan's verification step depends on them:

1. **Duplicate renderer cleanup** — `S.about`/`S.gallery`/`S.faq` are each defined twice in site-engine.mjs (L488/590, 520/607, 531/618); the editorial/flagship-flavored versions never run. Phase A2 ports editorial-style treatments, so this must be resolved first or the new archetypes render the wrong sections. (~2 hrs incl. orphaned-CSS removal at L1142–1185.)
2. **Critic v2 (full-page + one 390px mobile shot)** — the whole plan is verified by critic scores; an above-the-fold-only judge can't see reordered mid-page sections, which is exactly what the variety layer changes. Calibrate on compfm / Acacia split / araoent editorial before it holds abort power (the postmortem's own condition). (~1 day.)
3. **Baseline snapshot** — before any change: `git pull`, tag `pre-converge`, run the v2 critic across the current 57-site roster, archive `critic-report.json` as the regression baseline. Every later phase is judged against this file. (~1 hr + run time.)

Recommended riders (cheap, same trip, from report Phase 0): remove the invented default hours (site-engine L548) and mass times (L343); escape captured text in section renderers; fix `biggestFromSrcset` (capture.mjs L258–260).

---

## Phase A1 — Port the variety system (2–3 days)

### A1.1 Structure variety → recipe level, not HTML post-processing
`variety.mjs` reorders rendered `<section>` blocks by id. Site-engine already has a cleaner seam: `STRUCTURES` (L766–773) and `fallbackStructure` (pipeline.mjs L87–93). Port the *decision logic*, not the HTML surgery:

- Move `seedOf()` (FNV-1a on slug/name) and `pick()` from `business-designs/variety.mjs` into a new shared `engine/variety.mjs` with zero design-module imports.
- Map the 5 curated narrative orders (`classic`, `proof-first`, `people-first`, `value-first`, `story-first`) onto site-engine STRUCTURES (they're near-isomorphic to the existing proof/story/offer/showcase/flagship orders; add any missing order as a new STRUCTURE).
- **Precedence rule (critical):** `--structure` flag > site-strategy's evidence-based choice > seeded variety pick > static fallback. Variety only fills the gap when strategy returned `'classic'`/null — evidence beats randomness, randomness beats sameness. This is the postmortem's "evidence-driven layout selection, healing as fallback" hierarchy with variety slotted between.

### A1.2 Font-pack + shape axes
- Each theme gains 2 mood-matched alternate font pairings (port the pairings from `applyFontPack`, business-designs/variety.mjs L63–124). Selection seeded by `pick(seed,'font',3)`; site-engine already swaps `__DISPLAY__`, so this is a data change plus one seeded lookup. **Captured brand-font echo still wins** — variety fonts apply only when no prospect font was captured.
- Shape: seeded `--rad` jitter per theme (port L127–132 logic; themes already carry `rad`).

### A1.3 Design-spread (same-vertical collision avoidance)
`recommendRecipe` (site-engine L1215–1241) is deterministic by palette hue — eight Denver dentists with navy sites all get heritage/editorial. Port the pool-spread idea from `recommendBusinessDesign` (business-designs.mjs L35–45): each hue bucket maps to a *pool* (primary ×2 + two alts ×1), indexed by seed. Same input palette, different neighbors → different archetypes.

### A1.4 Distinctness gate
Generalize `variety-check.mjs`: build N same-vertical fixture profiles through the *pipeline's* recipe selection (not the design modules), fingerprint on {archetype, structure, theme+font, rad}, fail if any two share all four axes or if diversity floor unmet. Add as a release.mjs gate step (after QA, before critic — it's cheap and static). This makes "no structural sameness" a *blocking* rule, not a hope — a warning that never blocks is a diary entry.

### A1.5 Subordinate the recipes.json locks
heal.mjs locks currently aren't read by any build path (analysis finding #5), and stale locks must not fight the new selection. Decide within this phase: either (a) pipeline reads locks at priority *below* strategy but *above* seeded variety, with a staleness field (locked-at engine version), or (b) delete the lock file and let heal re-run per release. Recommendation: (b) — simpler, and heal already re-runs inside release. Update CLAUDE.md's landmine note either way (it's currently wrong in both directions).

### A1.6 Church parity (the sameness hot-spot)
- Apply seeded variety to the tradition path (theme/font/rad axes; structure via the church archetypes).
- Add `vary()`-rotated copy variants (2–3 each) to the hardcoded church sections: `nextsteps` (L261–265), `care` (L303–304), `sermons` (L319–320), `groups`, `serve`, `music`. Business verticals already have this; churches are the last static vertical.

**Exit criteria A1:** variety-check gate passes on 6-dentist and 6-church fixture sets; rebuild of 10 sample sites shows critic scores ≥ baseline; strategy-chosen structures unchanged (precedence verified in logs).

---

## Phase A2 — Mine the art direction (3–5 days)

The templates' value is taste, not code. Port treatments, not files.

### A2.1 Shortlist (from template inventory)
1. **bold** — oversized split-price hero (`OFFER_SYMBOL`/`OFFER_PRICE_NUM` watermark), marquee energy → new archetype `statement` or a hero-variant flag on flagship.
2. **editorial (business)** — serif split layouts, `EST` heritage year band → restore/finish the *first* (currently dead) `S.about`/`S.faq` treatments as `about_editorial`/`faq_editorial` renderer variants selectable by archetype.
3. **luxe / heritage** — texture + restraint → new theme(s) with their palettes/type scales.
4. **hearth or stillness (church)** — one distinct church look → new church archetype.

Cap at ~4 ports. Each is: extract the CSS treatment into site-engine's stylesheet (scoped by archetype body class), add/extend a section renderer, extend `ARCHETYPES`/`THEMES`, add to `recommendRecipe` pools and `variants.mjs` STYLES.

### A2.2 Per-port verification (law #1)
For each ported treatment: build a real prospect through it, screenshot at 1440 and 390, view side-by-side with the source template's render (`build-church.mjs`/`_verify` fixtures can still generate reference renders during this phase — retirement comes *after*). "Ported" is claimed on pixels, not on code compiling.

### A2.3 Grounding audit of ported treatments
Templates assume sample content (the dental-copy leak class). Every ported renderer must obey site-engine rules: return `''` when content is absent, no baked-in claims, all interpolation escaped. Checklist item per port, verified with an empty-profile render.

**Exit criteria A2:** ≥4 new archetype/theme options live; each blind-scored ≥ its source template screenshot by the v2 critic; empty-profile renders emit no fabricated content; variants.mjs chooser shows the new styles.

---

## Phase A3 — Retire the parallel renderer (1 day)

Only after A1+A2 exit criteria hold:

- `git mv engine/business-designs engine/church-designs business-designs.mjs church-designs.mjs build-church.mjs → archive/design-modules/` with a README pointing at the `pre-converge` tag and this plan. (Archive, don't delete — the templates remain the art-direction reference.)
- Remove the old `_verify.mjs`/`variety-check.mjs` invocations; the generalized distinctness gate replaces them.
- Update CLAUDE.md: toolbox list, the recipes.json landmine (per A1.5 decision), and a one-line "one engine: site-engine.mjs; design modules archived <date>" note so no future session resurrects the fork.
- Grep for stragglers: any docs/scripts referencing `renderBusiness`/`renderChurch`.

---

## Phase A4 — Portfolio regen + release (1–2 days, on the Mac)

1. Merge `engine-converge` → main (pull first; one writer).
2. `caffeinate -i node engine/regen.mjs --pages` (disown; pgrep the real process — known landmine).
3. `node engine/release.mjs --dry` → review gate output → real release. Release now includes the distinctness gate; strongly consider dropping `--static` from its QA step in the same change (analysis finding #10) so this regen is the first fully-gated portfolio.
4. Compare final critic-report.json against the A0 baseline. **Acceptance: mean score ≥ baseline, flagged count ≤ baseline, zero sites sharing all four style axes within a vertical, and a human eyeball pass on ~10 sites including 2 churches** (law #1 — the critic assists, Kris decides).

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Variety reordering fights strategy's evidence-based layout | Hard precedence rule (A1.1); log which source chose the structure on every build |
| Stale recipes.json locks override new selection | Resolved explicitly in A1.5 before any regen |
| Ported treatments regress grounding (sample-copy class) | Empty-profile render check per port (A2.3) |
| Critic can't see what changed | Critic v2 prerequisite — full-page + mobile, calibrated first |
| Multi-day branch drifts from main | Branch work; rebase daily; main stays releasable; no other session writes the repo during A4 |
| Regen surfaces latent capture failures at scale | regen already isolates per-domain in child processes; triage fails list before release |
| "Done" declared from one good example | Every exit criterion specifies N sites, both business and church (law #5) |

## What this plan deliberately does NOT include
- No changes to capture (the v7 capture rework stays its own track).
- No new verticals or content packs.
- No touch of Tax Junkie, BI, or the marketing site.
- Report Phase 1 gate fixes beyond critic v2 (rendered QA at release, heal scorer, emoji parsing) can ride along but are tracked separately in the analysis report.
