# Site fixes — action required before merge/deploy

Branch: `fix/lead-capture-and-admin-creds`

## 1. Lead capture (forms now POST to serverless functions)

`/free-scan` → `POST /api/scan`, `/contact` → `POST /api/contact`. Both insert into a
Supabase `leads` table and optionally ping Slack. The forms now **fail loudly** if the
backend errors, instead of the old behavior (faking success and discarding the lead).

**You must set these before the forms work in production** (Vercel → Project → Settings → Environment Variables):

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | ✅ | e.g. `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key — server-side only, never expose client-side |
| `SLACK_WEBHOOK_URL` | optional | Incoming-webhook URL; lead notifications post here. No-ops if unset. |

**Apply the DB migration:** `supabase/migrations/0001_leads.sql` creates the `leads` table
(RLS on, no anon policies — only the service role writes). Run it via the Supabase SQL editor
or `supabase db push`. (I can apply it via the Supabase MCP if you confirm which project.)

## 2. Admin auth (security fix)

`middleware.js` no longer has a hardcoded fallback password. It now **fails closed** —
`/admin` and `/pipeline` return 503 until `ADMIN_PASS` is set. **Rotate the old password**
(`sightline-admin-2026`) since it was committed to git history. Set `ADMIN_PASS` (and
optionally `ADMIN_USER`, default `admin`) in Vercel env vars.

## 3. Analytics

Vercel Analytics snippet added to the funnel pages. Conversion events (`scan_request`,
`contact_message`) fire on successful submit. **Enable Web Analytics** in the Vercel
dashboard (Project → Analytics) for data to flow.

## 4. sitemap.xml

Added (was 404 despite being referenced in robots.txt). Update the hostnames if you move
to a custom domain (see below).

---

## Still needs a decision (not changed)

- **Currency / locale:** site is `lang="en-GB"` with £ pricing, but all clients are US
  (Colorado). If targeting the US, switch to `en-US` and `$` — but the £→$ amount is a
  pricing decision, so I left it. Tell me the intended USD prices and I'll convert.
- **Custom domain:** all canonical/OG/schema URLs use `sightline-studio.vercel.app` (your
  own mockups show `sightline.report`). Point the domain, then I'll rewrite the URLs +
  sitemap.
- **Client demo variants indexable:** ~370 `*-com--theme` folders are publicly served and
  crawlable. Consider `noindex` or a separate project.
