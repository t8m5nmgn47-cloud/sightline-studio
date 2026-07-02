// Vercel Edge Middleware — Basic-Auth gate on /admin and /pipeline.
// Set ADMIN_PASS (and optionally ADMIN_USER) in Vercel → Project → Settings → Environment Variables.
export const config = { matcher: ["/admin/:path*", "/pipeline/:path*", "/admin", "/pipeline"] };

export default function middleware(request) {
  const env = (globalThis.process && process.env) || {};
  const USER = env.ADMIN_USER || "admin";
  const PASS = env.ADMIN_PASS;

  // Fail closed: if no password is configured, deny access rather than
  // falling back to a hardcoded default. Set ADMIN_PASS in Vercel.
  if (!PASS) {
    return new Response("Admin access is not configured.", { status: 503 });
  }

  const header = request.headers.get("authorization") || "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const i = decoded.indexOf(":");
      if (i > -1 && decoded.slice(0, i) === USER && decoded.slice(i + 1) === PASS) {
        return; // authorized → continue
      }
    } catch (e) {}
  }
  return new Response("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Sightline Admin", charset="UTF-8"' },
  });
}
