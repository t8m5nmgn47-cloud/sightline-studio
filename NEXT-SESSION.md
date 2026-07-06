# Next Session — Priority List
*Saved July 5, 2026. Everything below assumes $0 budget unless marked.*

## Do first on YOUR machine (needs Chrome / Vercel access — I can't do these from the sandbox)
1. **Full portfolio regen:** `node engine/regen.mjs --pages` — reruns all ~90 cached prospects through the upgraded pipeline with rendered capture + rendered QA. (Sandbox verified the script on a sample; the full run belongs on your Mac.)
2. **Vercel env vars:** set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASS` (rotate the leaked `sightline-admin-2026`), optional `SLACK_WEBHOOK_URL`. Apply `supabase/migrations/0001_leads.sql`. Until then, lead forms 503.
3. **Decisions I need from you:** US pricing in $ (site is currently £/en-GB), and whether `sightline.report` is the production domain (then canonical/OG URLs + `SITE_ORIGIN` env get pointed at it).

## Next build items (in priority order)
~~4. Admin UI catch-up~~ ✅ DONE — status filter/badges, notes, score deltas, re-engagement flags, external facts, PSI chips, copy-CRM-command button.
5. **Metro sweep** — run `discover --fetch` across your real target metros/verticals (Denver metro: dental, law, medspa, trades, churches), then `prospector` + `signals` + `greenfield`. This is the 10× prospect-volume payoff; Littleton alone showed 80% of mapped dentists have no site.
~~6. Noindex demos~~ ✅ DONE — robots meta in all generated output (`recipe.indexable:true` to disable for delivered sites) + `X-Robots-Tag` for `/demos/*` and `*--variant*` folders in vercel.json.
~~7. Outreach kit~~ ✅ DONE — `node engine/outreach.mjs <domain> | --tier HOT | --all` → printable one-pagers in `outreach/`.
~~8. Screenshot thumbnails~~ ✅ DONE — `node engine/qa.mjs --all --shots` (needs Chrome, so run on your Mac) → `thumbs/<slug>.png`. Next: show thumbs in the admin grid.
~~9. Per-demo sitemap~~ ✅ DONE — written automatically with `--pages`.
10. **Supabase prospect sync** — optional mirror of `prospect-state.json` to a `prospects` table so CRM state survives your laptop and feeds the portal.
11. **Admin discovery tab** — show discovered no-site leads in the admin UI with the greenfield command per lead.
12. **Thumbnails in admin grid** — once `--shots` has run on your Mac, render `thumbs/<slug>.png` in the prospector rows and outreach pages.

## When budget allows (~$0.01/prospect)
11. **Set `ANTHROPIC_API_KEY`** — activates `engine/llm-extract.mjs`: real service descriptions, staff, verbatim testimonials, taglines in every demo. Code is already wired; nothing else to do.

## Current one-command workflow (reference)
```
node engine/discover.mjs --vertical dental --metro "Denver, Colorado" --fetch
node engine/prospector.mjs
node engine/signals.mjs
node engine/greenfield.mjs engine/preview/discovered-dental-denver-colorado.json --pages   # no-site leads
node engine/pipeline.mjs <domain> --pages                                                  # captured leads
node engine/crm.mjs set <domain> contacted "left voicemail"
node engine/qa.mjs --all
```
