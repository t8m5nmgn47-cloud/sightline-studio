// Vercel Edge Middleware — Basic-Auth gate on /admin and /pipeline.
// Set ADMIN_PASS (and optionally ADMIN_USER) in Vercel → Project → Settings → Environment Variables.
export const config = { matcher: ["/admin/:path*", "/pipeline/:path*", "/admin", "/pipeline"] };

export default function middleware(request) {
  const USER = (globalThis.process && process.env && process.env.ADMIN_USER) || "kris";
  const PASS = (globalThis.process && process.env && process.env.ADMIN_PASS) || "sightline-admin-2026";
  const header = request.headers.get("authorization") || "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const i = decoded.indexOf(":");
      if (decoded.slice(0, i) === USER && decoded.slice(i + 1) === PASS) return; // authorized → continue
    } catch (e) {}
  }
  return new Response("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Sightline Admin", charset="UTF-8"' },
  });
}
