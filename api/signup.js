// POST /api/signup — /start plan-signup lead capture.
// Stores into the existing `leads` table (type 'contact' to satisfy the
// check constraint), with plan/phone/domain packed into `message`.
import { readBody, clean, isEmail, insertLead, notifySlack, methodGuard } from "./_lib.js";

export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;

  const body = readBody(req);
  const email = clean(body.email, 320);
  const plan = clean(body.plan, 120);
  const name = clean(body.contact_name, 200);
  const biz = clean(body.biz, 200);
  const phone = clean(body.phone, 40);
  const domain = clean(body.domain, 300);
  const notes = clean(body.notes, 2000);
  const source = clean(body.source, 200) || "start";

  if (!isEmail(email) || !plan) {
    return res.status(400).json({ ok: false, error: "Missing or invalid fields" });
  }

  const message = [
    `SIGNUP — ${plan}`,
    name && `Name: ${name}`,
    phone && `Phone: ${phone}`,
    domain && `Domain: ${domain}`,
    notes && `Notes: ${notes}`,
  ].filter(Boolean).join("\n");

  try {
    await insertLead({
      type: "contact",
      business: biz || name || email,
      website: domain || null,
      email,
      message,
      source,
      user_agent: req.headers["user-agent"] || null,
    });
  } catch (e) {
    console.error("signup insert failed:", e);
    return res.status(500).json({ ok: false, error: "Could not save signup" });
  }

  await notifySlack(`🚀 New plan signup\n*${biz || name || email}* — ${plan}\n${email}${phone ? " · " + phone : ""}`);
  return res.status(200).json({ ok: true });
}
