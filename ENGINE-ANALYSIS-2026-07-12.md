# Website Creation Engine — Analysis & Improvement Plan
*July 12, 2026 · analyzed at `main` @ `cf1cd3b` (fresh clone; local Mac folder was disconnected this session). Read: all of `engine/site-engine.mjs`, `pipeline.mjs`, `capture.mjs`, `vertical-content.mjs`, `site-strategy.mjs`, `qa.mjs`, `art-critic.mjs`, `creative-gate.mjs`, `heal.mjs`, `release.mjs`, `regen.mjs`, `promote.mjs`, `llm-extract.mjs`, `ai-content.mjs`, `photo-engine.mjs`, `fetch-stock.mjs`, `inline-assets.mjs`, `variants.mjs`, `studio-local.mjs`, both design-module trees, plus ENGINE-REVIEW.md, POSTMORTEM-2026-07-09.md, CLAUDE.md. **No changes were made — analysis only, per your instruction.**

---

## Part 1 — How the engine works today

### The big picture

One prospect flows through five layers:

```
CAPTURE (capture.mjs + llm-extract.mjs)
   live multi-page crawl → logo/palette/fonts/photos/services/staff/reviews/facts
        ↓
STRATEGY (site-strategy.mjs)
   one grounded Haiku pass over the real pages → headline, subhead, archetype,
   structure, FAQ, about, trust — "never invent" rules enforced in the prompt
        ↓
CONTENT ASSEMBLY (pipeline.mjs + vertical-content.mjs)
   precedence: content-overrides.json (hand truth) → captured+LLM → strategy →
   pack defaults; every section deleted if not source-backed (grounding policy)
        ↓
RENDER (site-engine.mjs)
   recipe {archetype × theme × mood × vertical/tradition × structure} →
   ~40 section renderers → self-contained HTML (single or --pages multi-page)
        ↓
GATES + SHIP (creative-gate → qa → art-critic → heal → release → promote)
   creative gate pre-publish, QA post-render, critic on screenshots,
   heal bake-off for flagged sites, release.mjs = the only button to prod
```

### Capture (the input layer)

`capture(domain, {maxPages:7})` fetches the homepage (raw fetch, falls back to headless Chrome/Playwright when the rendered text is under ~400 chars), scores same-origin links for about/services/team/gallery/contact, crawls the top 7, and merges everything into one corpus. From that it extracts: ranked logo candidates (JSON-LD > img-logo > apple-touch > og > favicon), a usage-weighted color palette, Google-Font echo (with a ~60-face commercial→free mapping), up to 24 photos (srcset/lazy-attr/background-image aware), services, JSON-LD reviews + aggregateRating + address/hours/geo, and contact facts. `llm-extract.mjs` (Haiku, ~1¢) then runs over the crawled text and upgrades services/staff/testimonials/tagline — but only ever *upgrades*, never downgrades the heuristics. Assets are downloaded with magic-byte sniffing, real-dimension probing, and dedup; hero = widest landscape ≥800px.

**Status vs the July 5 review (§2):** most of it landed. Subpage rendering now inherits the homepage decision (2a, homepage-granularity), the `collectCss` precedence bug is fixed with `@import` following added (2e), JSON-LD reviews/hours/address are captured (2c), and real dimensions gate final photo selection (2d, partially). The infamous "cached capture is single-page" root cause is **sidestepped, not removed**: pipeline.mjs now makes the live crawl the primary path and uses cache only as a failure fallback, but `htmlOverride` inside capture.mjs still skips the crawl entirely — CLAUDE.md's "until the v7 capture rework lands" is still the accurate framing.

### Strategy + content assembly

`site-strategy.mjs` is the single most important quality addition since the postmortem: one creative-director LLM pass that sees the real page set and extracted facts, and returns the hero copy, section plan, archetype, and structure — with hard grounding rules (never invent years/licenses/offers/hours/ratings). It fails soft (null → pack defaults). The pipeline then assembles sections under a strict grounding policy: hours/offer/money/features/trust/FAQ/about are each *deleted* if not source-backed. `content-overrides.json` beats everything. The older `ai-content.mjs` survives only as a narrow single-page fallback when strategy fails and captured services < 3.

`vertical-content.mjs` carries 15 vertical packs (dental → business fallback) with scored vertical detection, a narrative layer (CONTENT_PLUS: money leads, differentiators, about arcs, FAQs), and a deterministic `vary(slug, arr)` slug-hash so neighboring prospects get different copy but rebuilds are stable. Reviews are never fabricated.

### Render

`site-engine.mjs` (~1,455 lines) drives everything from a recipe: 8 archetypes (section orderings + body class), 6 themes (font/radius/palette), 5 business structures, moods (production forces `drift`). `derivePalette` filters framework colors, picks the first vivid brand color, guards accent hue harmony, and clamps brand for white-text contrast. Captured Google Fonts echo into the display face. Output is a fully self-contained HTML file (inline CSS, inline runtime JS, concierge widget, forms POSTing to `/api/contact` with the demo slug as lead source). `--pages` produces real multi-page sites (home/services/about/reviews/contact) with real nav hrefs and a sitemap.

**Status vs the July 5 review (§3):** the review body is now stale — 3c (copy variation), 3d (multi-page), 3e (SEO/schema: JSON-LD LocalBusiness subtypes, OG/Twitter, canonical, noindex-for-demos), and 3f (working forms) are all implemented. Still unmet from §3: responsive images (srcset/dimensions/WebP), font preload/self-hosting, and the accent contrast clamp.

### Gates and shipping

- **creative-gate.mjs** (pre-publish, no AI): ≥3 crawled pages, headline word bounds, ≥3 meaningfully-described services, about ≥28 words, FAQ ≥3, ≥3 visual assets, structure/proof consistency. This is the postmortem's "customer's standard, not engine sympathy" gate — it exists and blocks (exit 3).
- **qa.mjs** (post-render): asset existence, full SEO block as hard fails, CSS-variable contrast checks, template-artifact detection (`${`, `[object Object]`), form wiring; rendered mode adds zero-console-errors and no-overflow at 360/768/1440.
- **art-critic.mjs**: Haiku vision on a 1280×800 above-the-fold screenshot, 1–10 rubric, flags <7.
- **heal.mjs**: for flagged sites, builds 4 candidate recipes, screenshots, scores each, locks the winner into `engine/preview/recipes.json`.
- **release.mjs**: the one button — smoke build → parallel build (xargs -P 6) → retry → QA → critic → heal → re-critic (>15% still flagged aborts) → promote → git push. Aborts leave prod untouched.

### The second engine nobody is using

This is the biggest architectural discovery of this review: there are **two complete generation systems** in the repo.

1. **site-engine.mjs** — the recipe/renderer path. This is what pipeline.mjs, variants.mjs, studio-local.mjs, greenfield.mjs, and every generate-*.mjs script actually use. It is the production engine.
2. **business-designs/ + church-designs/** — 16 hand-crafted template+module designs (bold, editorial, luxe, precision… flagship, hearth, stillness…) with their own token system, a variety layer (deterministic narrative-order/font-pack/shape shuffling seeded from the business identity), a same-vertical design-spread recommender, content-swap verify gates, and a cross-site distinctness checker (`variety-check.mjs` fails if two of six dentists share all four style axes).

The design-module path is *richer art direction* and directly answers the postmortem's root cause #2 ("forced flagship: structural sameness") — yet **nothing in the shipping pipeline imports it**. It's reachable only through the manual `build-church.mjs` CLI and its own test gates. It's a fully built alternative renderer, parked.

---

## Part 2 — Findings (verified in code, with line refs)

### A. Real bugs in the live path

1. **Duplicate renderer definitions in site-engine.mjs — later definitions silently win.** `S.about` (488 vs 590), `S.gallery` (520 vs 607), `S.faq` (531 vs 618) are each defined twice. The first (editorial/flagship-flavored) versions never run, and their CSS (~L1142–1185, `.about-media`, `.galgrid`, `.qa`) is orphaned dead weight. This looks like a remnant of the two-engines-merged-on-main chimera era the postmortem documented. Flagship's bespoke about/gallery/FAQ treatments literally cannot render today.
2. **Mobile nav is broken.** At ≤720px, `.navlinks{display:none}` (L1012) with no hamburger — every nav link vanishes on phones; only the CTA button survives. On multi-page sites this strands mobile visitors on the homepage. Most prospects will open their own demo *on their phone*.
3. **No HTML escaping of captured content in body sections.** Only meta attributes are escaped. Service names, review quotes, team names, event fields are interpolated raw — a captured string containing `<`, `"`, or a stray `</script>` breaks markup (or worse). The capture layer ingests arbitrary third-party HTML, so this is not theoretical.
4. **The engine invents business hours.** `S.hours` defaults to `'Mon–Fri · 8:00 AM – 5:00 PM','Sat · By appointment'` (L548) when nothing was captured — directly violating the grounding rule site-strategy enforces and the pipeline's own "delete unbacked sections" policy (pipeline deletes the hours *section*, but any path that renders `S.hours` without items fabricates them). `S.mass` similarly invents service times (L343).
5. **recipes.json locks are written but never read by the build path.** heal.mjs locks winners (heal.mjs:117), but pipeline.mjs and regen.mjs never load the file — a normal regen quietly reverts a healed site to its fallback recipe, undoing the bake-off you paid 4 builds + 5 vision calls for. Note: CLAUDE.md says "pipeline.mjs honors them silently" — **that's no longer true in the current code**; the landmine note is stale in the opposite direction.
6. **`biggestFromSrcset` picks the *last* URL, not the biggest**, when srcset entries lack width descriptors (capture.mjs:258–260) — both `w` and `bw` are 0 so `>=` always swaps.
7. **The 24-photo candidate cut still uses declared dimensions** (capture.mjs:303–304, unknown dims scored at a neutral 420,000 px²) — a great photo with no declared size can be truncated before the real-dimension probe in `saveAssets` ever sees it. The July 5 §2d fix landed at the selection end but not at the pool-entry end — and CLAUDE.md law #4 says gates belong at the entrance.
8. **Vision gates silently disable when cwd ≠ repo root.** photo-engine.mjs resolves `.sightline.env` from `process.cwd()` while the other AI modules resolve it from the module directory. Run the pipeline from anywhere else and hero/logo vision gates return null (= keep everything) with no warning, while extraction passes still work.
9. **`heroGate`'s bytes-per-kilopixel ≥30 heuristic punishes well-compressed images** (pipeline.mjs:292) — an efficiently encoded WebP hero from the prospect's own site can lose to stock purely for being small in bytes.

### B. Gate integrity gaps (the postmortem's own standards, unfinished)

10. **Release never runs rendered QA.** release.mjs step 4 invokes `qa.mjs --static` (release.mjs:88) — so console-error and overflow gates *never run on the path that ships to prod*. Only regen runs them. A JS error in the template ships. This is a direct "warning that never blocks is a diary entry" violation.
11. **The art critic still judges above-the-fold desktop only** (art-critic.mjs:45–56: 1280×800, no scroll, no mobile shot). CLAUDE.md flags this as a known gap; it's still fully open. The logo-as-photo class of defect the postmortem describes would *still* be invisible to the critic today. There is also no mobile screenshot anywhere in the gate chain — combined with finding #2, broken mobile nav has no gate that could catch it.
12. **Release's critic accounting is brittle.** It parses 🚩 emoji counts from stdout and defaults `total` to 1 on parse failure (release.mjs:98–101), which makes the ≤15% release threshold meaningless in exactly the failure cases that matter.
13. **heal's scorer poisons the bake-off on API failure.** Any non-200 returns score 0 (heal.mjs:94), so an outage scores all four candidates 0 and reports "no candidate succeeded" instead of surfacing the real error.
14. **QA's contrast check reads CSS variables via regex** — it never checks rendered element pairs, and specifically not text-over-hero-photo legibility, which is the #1 real-world contrast failure on these designs. The accent color is never contrast-clamped at all (`clampForWhite` applies to brand only, site-engine L64) — an explicit open item from §3e.
15. **Rendered QA filters out all `net::` console errors** (qa.mjs:119) — genuinely broken external resources (fonts, analytics, the contact API) are masked.

### C. Strategic / architectural

16. **Two engines, one maintained.** Every hour spent polishing site-engine renderers deepens the divergence from the design-module system that was built to solve structural sameness. The design modules have their own gaps (no JSON-LD/OG at all, zero `<img>` tags — everything is CSS background-image with no alt/srcset/dimensions, `esc()` doesn't escape quotes, regex-slice injection silently no-ops leaving *dental sample copy* in a partial profile, church path has no variety layer). Neither engine is strictly better; each has what the other lacks:
    | | site-engine.mjs (live) | design modules (parked) |
    |---|---|---|
    | SEO/schema/OG | ✅ good | ❌ none |
    | Multi-page | ✅ | ❌ |
    | Grounded content policy | ✅ | ❌ (sample copy can leak) |
    | Distinct art direction per design | ⚠️ recipe permutations | ✅ hand-crafted |
    | Cross-site variety enforcement | ❌ (vary() copy only) | ✅ variety.mjs + spread + distinctness gate |
    | Escaping | ❌ body unescaped | ⚠️ no quote escaping |
    A decision is needed: converge (port variety.mjs + the distinctness gate + the best art direction into site-engine), cut over (bring SEO/multi-page/grounding to the design modules), or explicitly retire one. The worst option is the current one — both alive, one rotting.
17. **Church output is the sameness hot-spot.** Business verticals get `vary()` copy rotation + strategy-chosen structure; church sections are hardcoded static strings (nextsteps, care, sermons, groups, music) and the church design path skips `applyVariety`. Every church demo without captured overrides reads identically — the exact "AI template smell" the postmortem warns about, surviving in one vertical.
18. **The concierge guardrail is hardcoded for legal/medical only** (site-engine L1250, L1277–1280) — a childcare or retail site gets medical-advice guardrails, and no vertical-appropriate ones.

### D. Robustness / ops (smaller, cheap)

19. Chrome binary discovery is a hardcoded macOS-favoring list duplicated in **four files** (qa.mjs:102, art-critic.mjs:90, heal.mjs:72, promote.mjs:55) with no env override — one `CHROME_BIN` env var + a shared helper ends the class.
20. release.mjs uses fixed shared `/tmp/release-domains.txt` / `release-fails.txt` (64–67) — two runs on one host collide; a crash before `rmSync` appends across runs.
21. release's push-conflict recovery is `git pull --no-rebase -X ours` (release.mjs:134) — it can silently discard another machine's concurrent commits. That's the opposite of law #2's spirit; the rejected-push-surfaced-the-collision story in the postmortem only had a happy ending because nothing auto-resolved with "ours".
22. The harvest-dir list is copy-pasted across pipeline/heal/release/regen (drift class); the smoke domain (`araoent.com`) and `SITE_ORIGIN` fallback are hardcoded.
23. AI cost has no budget cap or retry/backoff anywhere. A flagged site in a release costs ~15–20 AI calls (critic ×2, 4 heal builds × [strategy + 2 vision] + 4 scores + winner rebuild). All Haiku-class so cheap today, but a single retry loop + per-release call counter would make costs observable before you scale to metro sweeps.
24. Key-resolution precedence differs between modules (`ANTHROPIC_API_KEY` vs `ANTHROPIC_KEY` first) — harmless until both are set to different values.
25. Schema `address` is emitted as a plain string, not `PostalAddress` (site-engine L1353); no `geo`/`openingHours` in JSON-LD even when captured; fonts are preconnect-only (no preload/subset).

---

## Part 3 — Recommended sequencing (discussion only — nothing done)

**Phase 0 — hygiene sweep (hours, zero risk).** Delete the dead duplicate renderers + orphaned CSS (#1), fix `biggestFromSrcset` (#6), remove invented hours/mass defaults (#4), unify key resolution (#24), `CHROME_BIN` env + shared helper (#19), namespace release tmp files (#20), replace `-X ours` with fail-loud (#21). Also: update CLAUDE.md's recipes.json landmine note to match reality (#5) — a wrong landmine note is worse than none.

**Phase 1 — trust the gates again (the highest-leverage week).**
- Run rendered QA in release (drop `--static`, or run it on the retry set if wall-clock matters) (#10).
- Critic v2: full-page screenshot + one 390px mobile shot, calibrated on the compfm/Acacia/araoent references before it keeps abort power (#11) — this single change makes findings #2 and #14 *detectable* by the machine instead of by Kris's eyeballs.
- Structured critic output (JSON file, not emoji counting) (#12); heal scorer surfaces API errors instead of zeroing (#13).
- Escape all captured text at render time — one `esc()` applied in the section renderers (#3). It's a mechanical, low-risk sweep and closes an entire defect class (law #5).
- Make pipeline read recipes.json (with strategy-choice taking precedence over stale locks, per the postmortem's "subordinate the locks" note) or delete the lock system deliberately (#5).

**Phase 2 — mobile + images (the visible-quality jump).** Hamburger nav (#2); `width`/`height` + `srcset` + WebP conversion at asset-save time (capture already probes real dimensions — the data is in hand); move the photo-pool entry gate to real dimensions (#7); soften `heroGate` for well-compressed formats (#9); accent contrast clamp (#14). These are the last unmet items from the July 5 review and they're all in the "prospect looks at their demo on a phone" critical path.

**Phase 3 — the engine decision (needs your call, not more code).** Pick a future for the two-engine situation (#16). My read: site-engine.mjs has the plumbing that's hard to rebuild (SEO, multi-page, grounding, gates integration) and the design modules have the taste layer that's hard to retrofit — so the highest-value convergence is porting `variety.mjs` + the design-spread recommender + the distinctness gate onto the site-engine path, then mining the best template art direction into new archetypes/themes, and formally retiring the parallel renderer. But cutting over the other way is defensible if the hand-crafted looks are the sales edge. Either way, church variation (#17) should ride along.

**Phase 4 — scale-out safety.** Retry/backoff + per-run AI call budget (#23), shared harvest-dir constant (#22), PostalAddress/geo/openingHours schema (#25), vertical-aware concierge guardrails (#18).

### What's genuinely good (don't touch)

The grounding architecture (never-invent prompts + section deletion + overrides-beat-everything + reviews-never-fabricated) is the most disciplined part of the codebase and is the real moat — most competitors fabricate. The strategy pass, the honesty-tiered photo policy (captured → curated stock in ambience slots only → gradient), the vision gates at the asset layer, the deterministic `vary()` seeding, creative-gate's customer-standard checks, release.mjs as the only button, and demo-forms-as-lead-capture are all exactly right. The postmortem's lessons visibly shaped this engine; the remaining work is mostly *finishing* those lessons (full-page critic, rendered QA at release, entrance gates for photos) rather than new philosophy.
