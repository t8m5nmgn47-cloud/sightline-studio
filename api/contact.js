// POST /api/contact — contact-form lead capture.
import { readBody, clean, isEmail, insertLead, notifySlack, methodGuard, sbSelect, sbInsert } from "./_lib.js";
import { normDomain } from "./_audit.js";

export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;

  const body = readBody(req);
  const name = clean(body.cname, 200);
  const email = clean(body.cemail, 320);
  const message = clean(body.cmsg, 5000);
  // optional source tag — generated demo sites send "demo:<slug>" so leads
  // captured during the sales window are attributable to the prospect
  const source = clean(body.source, 100) || "contact";

  if (!name || !isEmail(email) || !message) {
    return res.status(400).json({ ok: false, error: "Missing or invalid fields" });
  }

  try {
    await insertLead({
      type: "contact",
      business: name,
      email,
      message,
      source,
      user_agent: req.headers["user-agent"] || null,
    });
  } catch (e) {
    console.error("contact insert failed:", e);
    return res.status(500).json({ ok: false, error: "Could not send message" });
  }

  // Generated demo leads already carry a stable prospect slug. Convert that
  // existing attribution into a BI outcome without storing email PII in BI.
  if (source.startsWith("demo:")) {
    try {
      const slug = source.slice(5).trim();
      if (slug) {
        const rows = await sbSelect("prospect_audits", `select=domain&slug=eq.${encodeURIComponent(slug)}&limit=1`);
        const domain = normDomain(rows?.[0]?.domain || "");
        if (domain) {
          await sbInsert("bi_events", {
            entity_key: domain,
            event_type: "lead_created",
            occurred_at: new Date().toISOString(),
            channel: "website",
            campaign_id: source,
            metadata: { source, lead_type: "contact" },
          });
        }
      }
    } catch (e) {
      console.error("contact BI event save failed:", e?.message || e);
    }
  }

  await notifySlack(`✉️ New contact message from *${name}* (${email})\n${message}`);
  return res.status(200).json({ ok: true });
}
