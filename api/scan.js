// POST /api/scan — free-scan lead capture.
import { readBody, clean, isEmail, insertLead, notifySlack, methodGuard } from "./_lib.js";

export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;

  const body = readBody(req);
  const biz = clean(body.biz, 200);
  const site = clean(body.site, 500);
  const email = clean(body.email, 320);

  if (!biz || !site || !isEmail(email)) {
    return res.status(400).json({ ok: false, error: "Missing or invalid fields" });
  }

  try {
    await insertLead({
      type: "scan",
      business: biz,
      website: site,
      email,
      source: "free-scan",
      user_agent: req.headers["user-agent"] || null,
    });
  } catch (e) {
    console.error("scan insert failed:", e);
    return res.status(500).json({ ok: false, error: "Could not save request" });
  }

  await notifySlack(`🔍 New free-scan request\n*${biz}* — ${site}\n${email}`);
  return res.status(200).json({ ok: true });
}
