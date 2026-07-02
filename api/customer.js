// POST /api/customer — Customer Database (CRM) add-on capture.
// A client site's forms post contacts here; we store them server-side in the
// tenant's `customers` table via the service-role key (bypasses RLS).
import { readBody, clean, isEmail, insertCustomer, notifySlack, methodGuard } from "./_lib.js";

const STATUSES = ["lead", "prospect", "customer", "archived"];

export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;

  const body = readBody(req);
  const name = clean(body.name, 200);
  const email = clean(body.email, 320);
  const phone = clean(body.phone, 50);

  // Need at least a name plus a way to reach them.
  if (!name || (!email && !phone)) {
    return res.status(400).json({ ok: false, error: "Need a name and an email or phone" });
  }
  if (email && !isEmail(email)) {
    return res.status(400).json({ ok: false, error: "Invalid email" });
  }

  const status = STATUSES.includes(body.status) ? body.status : "lead";
  const tags = Array.isArray(body.tags)
    ? body.tags.map((t) => clean(t, 40)).filter(Boolean).slice(0, 20)
    : null;

  const row = {
    name,
    email: email || null,
    phone: phone || null,
    company: clean(body.company, 200) || null,
    status,
    tags,
    notes: clean(body.notes, 5000) || null,
    source: clean(body.source, 120) || "website",
  };

  try {
    await insertCustomer(row);
  } catch (e) {
    console.error("customer insert failed:", e);
    return res.status(500).json({ ok: false, error: "Could not save contact" });
  }

  await notifySlack(`👤 New contact — *${name}*${row.company ? " (" + row.company + ")" : ""}\n${email || phone} · ${status}`);
  return res.status(200).json({ ok: true });
}
