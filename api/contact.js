// POST /api/contact — contact-form lead capture.
import { readBody, clean, isEmail, insertLead, notifySlack, methodGuard } from "./_lib.js";

export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;

  const body = readBody(req);
  const name = clean(body.cname, 200);
  const email = clean(body.cemail, 320);
  const message = clean(body.cmsg, 5000);

  if (!name || !isEmail(email) || !message) {
    return res.status(400).json({ ok: false, error: "Missing or invalid fields" });
  }

  try {
    await insertLead({
      type: "contact",
      business: name,
      email,
      message,
      source: "contact",
      user_agent: req.headers["user-agent"] || null,
    });
  } catch (e) {
    console.error("contact insert failed:", e);
    return res.status(500).json({ ok: false, error: "Could not send message" });
  }

  await notifySlack(`✉️ New contact message from *${name}* (${email})\n${message}`);
  return res.status(200).json({ ok: true });
}
