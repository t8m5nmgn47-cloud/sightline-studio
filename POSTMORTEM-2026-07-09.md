# Postmortem — The Two-Day Engine War (July 8–9, 2026)

*Recorded at Kris's request after a joint audit (Kris + Claude session + ChatGPT audit).
This is the honest record. The enforcement rules distilled from it live in `CLAUDE.md`.*

---

## What we were trying to do

Make the site generator produce demo websites good enough to sell — "the compfm bar":
rich sections, real content, real imagery, a look a business owner would pay for.
The stakes, in Kris's words: **"I can't sell websites if we can't make websites."**

## The verdict, in numbers

- Engine default output, blind-scored by an AI design critic: mostly **5–6/10**; 41 of 57 sites flagged.
- The one site everyone loved (compfm-com) was **hand-written**, not engine-generated.
- Best engine outputs after fixes (Acacia split, araoent editorial): **8/10** — proving the ceiling is reachable.

---

## THE THREE ROOT CAUSES (found by external audit, confirmed in code)

These explain most of the two days. Each was *visible in the repo before the work started*.

### 1. Content starvation: cached runs are single-page
The pipeline prefers cached homepage HTML, and the cached path **skips the multi-page
crawl entirely**. Services, team, testimonials, gallery, and about pages were never
fetched. The generator was asked to build rich sites from one page of material.
**This was documented in ENGINE-REVIEW.md §2a before the session began. It was read.
It was never fixed.** Downstream symptoms mistaken for separate bugs: starved photo
pools (a LOGO drafted as a feature photo; promo banners as heroes), thin LLM
extractions, generic sections, missing staff/testimonials.
→ Fix direction: cache the **completed crawl** (all pages, rendered, photos) at the
capture layer — not one fetched homepage. `release.mjs` currently enumerates its build
list FROM the homepage-cache dirs, institutionalizing the bug.

### 2. Forced flagship: structural sameness
The merged engine forces every business to the `flagship` archetype. Multiple
archetypes and six section-orders (STRUCTURES) exist but production never uses them.
When composition is constant, all remaining variety is surface (palette/copy/photos) —
and surface variety is exactly what reads as "AI template smell." Humans detect
structural sameness faster than chromatic sameness.
→ Fix direction: evidence-driven layout selection (photos→showcase, reviews→proof-first,
no imagery→editorial), critic verifies, healing loop as fallback.

### 3. The forgiving gate: warnings that never block
Missing FAQ/about, thin section counts, and image poverty were **warnings**, not
failures. Rationale at the time: "don't punish the engine for its inputs." That is
engine-sympathy; a design product's gate must encode the CUSTOMER's standard. A
technically valid but visibly mediocre site passed every check.
→ Fix direction: a creative quality gate with abort power (now exists in release.mjs
step 5, calibration needed).

---

## WHAT WENT WRONG (process — the expensive part)

1. **Shipped without looking.** Hours of "verified" work checked structure (sections
   exist, QA passes) while the pixels were bad. Kris was the only one looking at
   screens until the art critic was built. *Looking is the job.*
2. **"Fixed" declared from one example.** The flagship default was accepted globally
   after ONE good screenshot. The green-wash fix was assumed complete after one site.
   Every defect is a class; one instance proves nothing.
3. **Scar-tissue gates instead of entrance gates.** Hero gate, logo gate, title gate —
   each a memory of one wound, each pointed at one slot. The logo-as-photo defect
   walked between three inspectors because images were judged per-USE, not at
   entry into the pool. *Check at the entrance, once, generally.*
4. **Two engines built in parallel on main.** The merge created chimeras: a function
   called but never defined (`describeService`), two `derivePalette` bodies interleaved,
   `fmtPhone` referenced before it existed. Hours lost. *One writer on main.*
5. **Whack-a-mole altitude.** The loop "user shows bad screenshot → find proximate
   cause → patch" never walks UP the data flow. The fresh auditor read orchestration
   first and found in one pass what two days of symptom-chasing missed.
6. **Background jobs died silently.** Mac sleep and session reaping killed long chains
   twice; a stale status check reported a live process dead, spawning a duplicate.
   `caffeinate -i` + single-process checks fixed it — late.
7. **Over-optimistic narration.** Progress language ("that's the purr") outran output
   quality and made every regression feel like betrayal. Calibrated reporting is a
   deliverable too.

### Small bugs worth remembering (each cost a cycle)
- Playwright `newPage({viewportSize})` is ignored — the option is `viewport`. Screenshots
  were 16:9 while layouts assumed 4:3.
- File extensions taken from URLs produced `logo.com` / `photos/2.com` (unrenderable).
  Sniff magic bytes; never trust the URL.
- Hard `slice(0,160)` shipped "closely aligned wi" mid-word on a live hero. Trim at
  word boundaries at the door, regardless of source.
- `og_site_name` can be SEO spam ("Englewood CO Dentist"). The real name may exist only
  in the logo and page text — LLM-extract it; anchor to domain tokens.
- A title company's own nav ("REFINANCE ORDER" ×3) outshouted its NAME in classification.
  The business name is who they are; weight it first-class.
- The art critic screenshotted above-the-fold only — it literally never saw the section
  where the logo-as-photo shipped. Judge the FULL page.

---

## WHAT WENT RIGHT (keep these)

- **The art critic** (`engine/art-critic.mjs`): the first honest measurement this
  project ever had. Independently produced the same diagnosis as a human ("maroon wash
  floods the hero") and refused 41 mediocre sites the process would previously have
  shipped. Its brutal first verdict was the beginning of truth, not a failure.
- **release.mjs**: one path to production, seven gates, aborts leave prod untouched.
  It correctly refused to deploy twice. The concept is right; keep it as the only button.
- **Vision gates at the asset layer** (photo-engine.mjs): baked-text banners rejected as
  heroes, wrong-brand logos ("BRIDGE" on a title company) rejected for wordmarks. Right
  idea — v7 should move them to pool-entry.
- **The photo tiering policy**: captured (real) → curated stock → designed gradient;
  stock never in "their photos" gallery slots. Honesty as architecture.
- **LLM content extraction** with heuristic fallback; keyless no-op. Real services,
  staff, testimonials — when fed more than one page, it will shine.
- **Parallel builds**: 57 sites in ~90 seconds (xargs -P). Serial regens wasted hours.
- **heal.mjs** (output-driven recipe selection): brute-force but sound — build
  candidates, judge screenshots, lock winners. Correct as the FALLBACK behind
  evidence-driven selection.
- **The sales machinery**: six-variant chooser with choice-as-lead-event, the Acacia
  funnel brief with verifiable facts (their title tag lacks their own name), blind
  7-vs-8 scoring against the live site. This is the business, and it works.
- **Git discipline**: the rejected push surfaced the parallel-engine collision instead
  of silently destroying one side. A conflict is always better than an overwrite.
- **The three-way audit** (fresh eyes read data flow + incumbent supplies scar tissue +
  owner decides): the most productive hour of the two days.

---

## PRINCIPLES (the actual lessons)

1. Look at pixels before declaring anything done. Structure passing ≠ good.
2. Every defect is a class. Fixing one instance fixes nothing.
3. Gates belong at the entrance (asset enters pool, page enters portfolio), not at each use.
4. The quality gate encodes the customer's standard, never sympathy for the engine.
5. A warning that never blocks is a diary entry.
6. Constrain design freedom. The ugliness lived in the degrees of freedom.
   Structural variety must be deliberate; surface variety alone smells like AI.
7. Feed the generator before blaming it. Content starvation masquerades as a hundred
   downstream bugs.
8. One writer on main. Parallel AI sessions on one repo create chimera code.
9. When output is chronically bad, read the data flow top-down before patching another
   symptom. Fresh eyes start at orchestration; tired eyes start at pixels.
10. Calibrated reporting: say what was verified, how, and what wasn't.

---

## STATE OF HANDOFF (for the v7 session)

ChatGPT is authoring the v7 patch: richer live capture, one strategic content brief
(replacing disconnected micro-prompts), evidence-driven layout selection, creative
quality gate with abort power. Agreed landmines:

- `engine/preview/recipes.json` — heal.mjs writes per-site recipe LOCKS and
  **pipeline.mjs silently honors them** when no explicit flags are passed. Delete or
  subordinate before evidence-driven selection, or stale locks will win fights.
- Critic must judge the full page (currently above-the-fold) and be calibrated with
  reference screenshots before holding abort power.
- `release.mjs` enumerates domains from the homepage-cache dirs — re-point when the
  capture layer changes.
- Old orphan demos exist in `demos/` (not in the 57 roster); release gates are scoped
  to the release set on purpose.
- Keys live in `.sightline.env` (gitignored): ANTHROPIC_API_KEY, PEXELS_KEY; AI_MODEL /
  EXTRACT_MODEL / CRITIC_MODEL overrides supported.
- `content-overrides.json` = hand-verified truth that beats all extraction. Keep it winning.
- Showcase mode anonymizes un-consented client names on public pages; `promote.mjs`
  syncs demos → live gallery folders and must run before any deploy that should be seen.

*Last known-good deploy: unified-engine v6 portfolio (57/57 built, pre-veil-fix critic
standard). Production untouched since; two later release runs were correctly aborted
by the critic gate.*
