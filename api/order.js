// POST /api/order — checkout order capture (plan + add-ons).
// Saves server-side via the service-role key so orders persist even though
// the public `orders` table has RLS locked down (no anon writes).
import { readBody, clean, isEmail, insertOrder, notifySlack, methodGuard } from "./_lib.js";

export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;

  const body = readBody(req);
  const plan = clean(body.plan, 120);
  if (!plan) {
    return res.status(400).json({ ok: false, error: "Missing plan" });
  }
  const email = clean(body.email, 320);
  if (email && !isEmail(email)) {
    return res.status(400).json({ ok: false, error: "Invalid email" });
  }

  // Whitelist the fields the checkout sends, matching the orders table shape.
  const addons = Array.isArray(body.addons) ? body.addons.slice(0, 50) : null;
  const total = typeof body.monthly_total === "number"
    ? body.monthly_total
    : Number(body.monthly_total) || 0;

  const row = {
    biz: clean(body.biz, 200) || null,
    slug: clean(body.slug, 200) || null,
    plan,
    addons,
    monthly_total: total,
    first_name: clean(body.first_name, 120) || null,
    last_name: clean(body.last_name, 120) || null,
    email: email || null,
    phone: clean(body.phone, 50) || null,
    domain: clean(body.domain, 200) || null,
    notes: clean(body.notes, 2000) || null,
  };

  try {
    await insertOrder(row);
  } catch (e) {
    console.error("order insert failed:", e);
    return res.status(500).json({ ok: false, error: "Could not save order" });
  }

  const who = [row.first_name, row.last_name].filter(Boolean).join(" ") || "—";
  const addonLine = addons && addons.length ? ` · ${addons.length} add-on${addons.length > 1 ? "s" : ""}` : "";
  await notifySlack(`🧾 New order — ${plan}${row.biz ? " · " + row.biz : ""} · $${total}/mo${addonLine}\n${who} · ${email || "no email"}`);
  return res.status(200).json({ ok: true });
}
