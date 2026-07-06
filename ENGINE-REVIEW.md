# Engine Performance Review — Prospecting · Capture · Website Generation

> **STATUS (July 5, 2026): All 4 phases implemented.** New tools: `engine/discover.mjs` (free OSM prospect discovery), `engine/signals.mjs` (keyless PageSpeed/HTTPS/DNS facts), `engine/crm.mjs` (status/notes that survive re-runs), `engine/qa.mjs` (ship gate), `engine/llm-extract.mjs` (optional — needs ANTHROPIC_API_KEY; everything falls back to free heuristics without it). Pipeline gained `--pages` (multi-page sites) and an automatic QA gate. Workflow: `discover --fetch` → `prospector` → `signals` → `pipeline <domain> [--pages]` → `crm set`. Note: 91 of 94 existing demos predate these upgrades — regenerate to bring them up to the new floor.
*July 5, 2026 · reviewed: `engine/prospector.mjs`, `engine/capture.mjs`, `engine/site-engine.mjs`, `engine/pipeline.mjs`, `engine/vertical-content.mjs`, `engine/extract.mjs`, `engine/harvest.mjs`*

Target: >40% performance lift per engine + world-class finished sites. Each section lists the levers ranked by impact, with why they clear 40%.

---

## 1. Prospecting Engine (`prospector.mjs`)

**Current state:** Works, but it's a *scorer*, not a *prospector*. It only ranks what's already in `assets/harvest/*` — 50 prospects total, 19 businesses. The bottleneck isn't scoring quality; it's pipeline volume and lead intelligence depth.

### Levers (ranked)

**1a. Self-feeding discovery (est. 5–20× volume — this alone dwarfs 40%).**
Today someone must manually harvest HTML files before the prospector can run. Add a discovery front-end that turns "vertical + geography" into domains automatically:
- Google Places / Maps API (or the Nimble/Bright Data tooling already installed in this workspace) → every dentist/law firm/HVAC/church in a metro, with **rating, review count, and phone included free** — data you currently can't see at all.
- Feed discovered domains straight into capture → score → rank. One command: `node engine/prospector.mjs --vertical dental --metro denver`.
- 50 prospects → 500+ per metro. At the current 7 HOT + 3 DEAD out of 50 (20% actionable), that's ~100 actionable leads per metro instead of 10.

**1b. Score from the multi-page capture, not a single cached homepage.**
The prospector scores one HTML file per domain; the capture engine already crawls 6 pages. Sites that keep booking/reviews/team on subpages get falsely low scores → wasted calls, wrong pitches. Route scoring through `capture()`'s merged corpus. Est. 15–25% reduction in false HOT/WARM classification.

**1c. External proof signals in the score + pitch.**
Business-readiness is entirely on-site regex. The most persuasive cold-call facts are off-site:
- Google review count/rating (from 1a, free) — "you have 12 reviews, the practice down the street has 340."
- Domain-age / SSL-expiry / mobile PageSpeed (free APIs) — concrete, verifiable pain.
- These also fix the current blind spot where a site *mentions* "reviews" in nav and gets full `reviews` credit despite having 2 stars on Google.

**1d. Lead-freshness + dedupe layer.**
`prospects.json` is regenerated wholesale; no memory of contacted/won/lost, no change detection. Persist to the Supabase instance you already stood up for leads (see NOTES-fixes.md): status, last-scored, score-delta. "Their site got worse since last quarter" is a re-engagement trigger the current engine can't produce.

**1e. Scoring honesty fixes (quick wins).**
- `dead` heuristic (`html.length < 60000 && no church words`) misfires on lean, fast business sites — length is a terrible proxy post-render. Use the capture engine's `textLen` instead.
- `winPct` is invented (linear in score). Fine as a heuristic, but label it "priority index" in the UI, or start calibrating it against actual close outcomes once CRM data exists (1d).
- Benchmark groups with n<5 (`cats`) produce meaningless "peer %" claims in openers — suppress peer stats below a minimum n.

**Combined effect:** 1a alone is a step-change in throughput; 1b+1c materially raise precision of who you call and what you say. >40% is conservative.

---

## 2. Capture Engine (`capture.mjs` + `extract.mjs`)

**Current state:** Well-designed heuristics (ranked logos, weighted colors, Google-Font echo, multi-page merge). Three structural gaps cap its yield: subpages never get JS-rendered, extraction is regex/DOM-heuristic only, and the richest content types (reviews, staff, real copy) are mostly missed.

### Levers (ranked)

**2a. Render subpages when the homepage needed rendering.**
`pickSubpages` results are fetched with `render:'never'`. Wix/Squarespace/Showit sites — a huge share of weak-site prospects, i.e. *your best leads* — return empty shells for about/services/team pages, so fonts/photos/services/staff silently vanish. One-line fix: inherit the homepage's render decision. Also: the cached-HTML path (`htmlOverride`) skips the crawl entirely, so every pipeline run against harvest cache is single-page — the prospects you score most often get the *worst* captures. Est. effect: on JS-built sites, services/staff/photo yield goes from near-zero to full — well over 40% average extraction yield on the segment that matters.

**2b. LLM extraction pass over the crawled text (the single biggest quality lever).**
You already have all pages' text in memory. One structured Claude call per prospect (Haiku-class, ~$0.01) extracting: services w/ descriptions, staff w/ roles, real testimonials + attribution, hours, offers, mission/tagline, differentiators. Replaces four brittle regex extractors that currently return `[]` on any non-standard markup, and eliminates whole classes of errors (e.g. `staff()` requiring name-heading-then-role-heading adjacency; `extractServices` capped at 6 with heavy noise filtering). Keep heuristics as the zero-cost fallback. This is the difference between demos filled with pack defaults and demos filled with *their* content.

**2c. Capture reviews — the highest-converting content isn't captured at all.**
`buildSections` honorably refuses to fabricate reviews, but nothing feeds `realReviews`, so business demos ship with no social-proof section — the #1 conversion element per your own Business-Readiness rubric (weight 14). Sources, in order of effort: on-site testimonials via 2b; Google Places reviews via 1a (rating + count + top quotes, properly attributed); schema.org `aggregateRating` JSON-LD already present on many sites.
Also grab: JSON-LD `LocalBusiness` (address/hours/geo — `extractFacts` currently gets phone/email/socials only despite the header comment claiming JSON-LD hours), and `og:image` dimensions.

**2d. Image quality gating + processing.**
Photos are ranked by declared width×height, which most `<img>` tags omit → ordering is near-random, and the hero pick falls back to "first file >120KB". Add: probe actual dimensions (sharp, or parse headers from the first KB), reject <800px-wide heroes, detect near-duplicates, auto-convert to WebP with responsive sizes at save time (feeds directly into §3 performance). Blurry/tiny hero = dead demo; this is a top-3 driver of perceived output quality.

**2e. Robustness details.**
- `collectCss` boolean bug: `if (r && /css/.test(...) || r)` is effectively `if (r)` — appends non-CSS responses into the color/font corpus. Fix precedence.
- Follow `@import` in CSS (many WordPress themes hide brand tokens there).
- Extract colors from computed styles when headless Chrome is already open (nav background, button colors) — far stronger signal than raw hex counting.
- Retry once with `www.` / `http://` on fetch failure; log per-stage yield (`logo:✓ photos:6 services:0 …`) to a capture-QA report so weak captures are visible instead of silent.

---

## 3. Website Generation Engine (`site-engine.mjs` + `vertical-content.mjs` + `pipeline.mjs`)

**Current state:** Genuinely good architecture (archetype × theme × tradition/vertical × mood; captured palette/font echo; concierge widget; a11y touches like `prefers-reduced-motion` and focus-visible). The gap to "world class" is: one page, thin/no images in most sections, template-detectable copy, no SEO/schema layer, and no QA gate.

### Levers (ranked)

**3a. Wire captured content into every section (depends on 2b/2c).**
Renderers already accept team members w/ photos, real reviews w/ ratings, real service descriptions, gallery — but the pipeline mostly feeds pack defaults. With 2b/2c landed: real staff cards with faces, real testimonials with names, service cards with the prospect's own descriptions and a captured photo each. This is the single biggest "wow, that's *my* practice" lever — the demo's entire sales thesis.

**3b. Section-level image art direction.**
Currently the hero is the only image on most generated sites; sections are flat text/cards. World-class sites alternate full-bleed imagery, split image/text bands, and photo-backed CTAs. Add: distribute `gallery[]` across sections (about band, services alternating rows, gallery strip, CTA background w/ scrim); when captured photos run out, per-vertical curated stock (already precedented: `church-2.webp`). Ship `loading="lazy"`, `srcset`, explicit dimensions (no CLS), WebP from 2d.

**3c. Copy variation engine (kill the template scent).**
Every dental demo says "gentle dentistry for the whole family"; two prospects in one metro can receive identical sites. Either 3–4 hand-written variants per pack rotated by slug-hash (zero cost), or a one-call LLM copy pass seeded with captured mission/phrases/services (small cost, much better). Vary hero headline, offer, CTA microcopy, section leads.

**3d. Multi-page output.**
One long page reads as "template demo"; separate Services / About / Contact pages read as "real site" — and are what the client actually buys. The section system makes this cheap: same renderers, a page manifest per vertical (home, services w/ one block per captured service, about w/ team, contact w/ map embed from JSON-LD address). Nav hrefs become real links instead of `#anchors`.

**3e. SEO/schema/perf layer (world-class table stakes, ~an afternoon).**
Generated sites currently have title+meta only. Add: JSON-LD `LocalBusiness`/`Dentist`/`Attorney`/`Church` with captured NAP + hours + `aggregateRating`; OG/Twitter cards using the hero image; canonical; favicon from captured logo; sitemap; font `preload` + `font-display:swap`; self-host or subset fonts. Bonus pitch material: "your current site scores X on Lighthouse, ours scores 98."
Also fix: hero `<h1>` text should be balanced against contrast — run an automated WCAG contrast check on derived palette combos (`derivePalette` can pick a low-contrast accent; clamp it).

**3f. Working forms + QA gate.**
Care/contact forms are `onsubmit="return false"` — fine for a demo, fatal for a delivered product. Point them at the existing `/api/contact` (already built per NOTES-fixes.md) with the prospect slug as the lead source — every demo becomes a lead-capture asset for *you* during the sales window.
Add an automated QA pass per generated site (Playwright, already a dependency): all images load, no layout overflow at 360/768/1440, contrast ≥4.5:1, Lighthouse ≥90, no console errors, screenshot archived to `thumbs/`. `business-designs/_verify.mjs` shows the pattern exists — generalize it and make it a pipeline gate. World-class isn't a design ceiling, it's a *floor that nothing ships below*.

---

## Sequencing (dependency-ordered)

| Phase | Items | Effort | Payoff |
|---|---|---|---|
| 1 | 2a render-subpages fix, 2e CSS bug, 1e scoring fixes, 3e SEO layer, 3f forms | days | immediate quality + correctness |
| 2 | 2b LLM extraction, 2c reviews, 2d image processing | ~1 wk | capture yield transforms |
| 3 | 3a real-content wiring, 3b art direction, 3c copy variation, 3f QA gate | ~1–2 wks | world-class output |
| 4 | 1a discovery, 1c external signals, 1d CRM persistence, 3d multi-page | ~2 wks | 10× prospect volume, sellable product |

The three engines compound: discovery (1a) feeds capture; richer capture (2b/2c) feeds both the prospector's pitch intelligence and the generator's content; the QA gate (3f) protects everything upstream from shipping a bad demo.
