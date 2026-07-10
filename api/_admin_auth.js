// Server-side Basic Auth helper for private APIs that are not routed through
// the Edge middleware matcher. Fails closed when ADMIN_PASS is missing.

import { timingSafeEqual } from "node:crypto";

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function requireAdmin(req, res) {
  const user = process.env.ADMIN_USER || "admin";
  const pass = process.env.ADMIN_PASS;
  if (!pass) {
    res.status(503).json({ ok: false, error: "Admin access is not configured." });
    return false;
  }

  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Sightline Admin", charset="UTF-8"');
    res.status(401).json({ ok: false, error: "Authentication required." });
    return false;
  }

  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const i = decoded.indexOf(":");
    const suppliedUser = i >= 0 ? decoded.slice(0, i) : "";
    const suppliedPass = i >= 0 ? decoded.slice(i + 1) : "";
    if (safeEqual(suppliedUser, user) && safeEqual(suppliedPass, pass)) return true;
  } catch {}

  res.setHeader("WWW-Authenticate", 'Basic realm="Sightline Admin", charset="UTF-8"');
  res.status(401).json({ ok: false, error: "Authentication required." });
  return false;
}
