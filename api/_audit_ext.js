// ─────────────────────────────────────────────────────────────────────────────
// Passive security extension for the Sightline audit engine.
//
// Every check here is STRICTLY PASSIVE — it only observes what any visitor's
// browser or a public DNS lookup already sees:
//   • the TLS certificate the server presents (handshake, same as any browser)
//   • the response headers and HTML the site sends to everyone
//   • public DNS records (MX / CAA / DNSSEC)
//   • /.well-known/security.txt — a file whose entire purpose is to be fetched
//
// It does NOT probe for hidden files, guess admin paths, hit /.env or /.git,
// scan ports, or send anything the site didn't invite. That keeps the scanner
// squarely inside the "public information only — we never break in" promise.
// ─────────────────────────────────────────────────────────────────────────────
import tls from "node:tls";
import { promises as dns } from "node:dns";

const UA = "SightlineBot/1.0 (+https://sightline-studio.vercel.app/ethics)";

// ── TLS certificate (passive handshake — the cert is shown to every visitor) ──
export function tlsCertInfo(domain, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; try { sock.destroy(); } catch {} resolve(v); } };
    const sock = tls.connect(
      { host: domain, port: 443, servername: domain, timeout: timeoutMs, rejectUnauthorized: false },
      () => {
        const c = sock.getPeerCertificate();
        if (!c || !c.valid_to) return finish({ ok: false });
        const expiry = new Date(c.valid_to).getTime();
        const days = Math.round((expiry - Date.now()) / 86400000);
        const issuerCN = (c.issuer && (c.issuer.O || c.issuer.CN)) || "";
        const self_signed = !!c.issuerCertificate && c.issuerCertificate.fingerprint === c.fingerprint;
        finish({
          ok: true,
          authorized: sock.authorized,             // chain + hostname validated by Node
          auth_error: sock.authorizationError ? String(sock.authorizationError) : "",
          days_to_expiry: days,
          valid_to: c.valid_to,
          issuer: issuerCN,
          self_signed,
        });
      }
    );
    sock.on("error", () => finish({ ok: false }));
    sock.on("timeout", () => finish({ ok: false }));
  });
}

// ── Public DNS security records ──────────────────────────────────────────────
export async function dnsSecurity(domain) {
  const out = { mx: false, caa: false, dnssec: false };
  try { out.mx = (await dns.resolveMx(domain)).length > 0; } catch {}
  try { out.caa = (await dns.resolveCaa(domain)).length > 0; } catch {}
  // DNSSEC: ask a validating public resolver (Cloudflare DoH) whether the
  // answer is authenticated (AD flag). Passive — a normal recursive query.
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A&do=1`,
      { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(6000) });
    if (r.ok) { const j = await r.json(); out.dnssec = !!j.AD; }
  } catch {}
  return out;
}

// ── /.well-known/security.txt (a file meant to be public) ────────────────────
export async function securityTxt(domain) {
  for (const path of ["/.well-known/security.txt", "/security.txt"]) {
    try {
      const r = await fetch(`https://${domain}${path}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(6000) });
      if (r.ok) { const t = await r.text(); if (/contact:/i.test(t)) return true; }
    } catch {}
  }
  return false;
}

// ── On-page & header signals (parse only what the server already sent) ───────
const OLD_JQUERY = /jquery[-.]?(1\.\d+|2\.\d+|3\.[0-4])(\.\d+)?(\.min)?\.js/i;
export function headerPageSecurity({ headers = {}, setCookies = [], html = "", finalUrl = "" }) {
  const g = (k) => (headers[k] || "");
  // Server software / version disclosure — a fingerprinting aid you should hide.
  const server = g("server");
  const poweredBy = g("x_powered_by");
  const discloses_version = /\d/.test(server) || !!poweredBy;

  // Insecure cookies: any Set-Cookie missing Secure or HttpOnly.
  let insecure_cookie = false;
  for (const c of setCookies) {
    if (!/;\s*secure/i.test(c) || !/;\s*httponly/i.test(c)) { insecure_cookie = true; break; }
  }

  // Mixed content: http:// subresources loaded on an https page.
  let mixed_content = false;
  if (/^https:/i.test(finalUrl) && html) {
    mixed_content = /(?:src|href)\s*=\s*["']http:\/\/(?!localhost)/i.test(html);
  }

  // Software/version leaks in the page itself.
  const gen = (html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i) || [])[1] || "";
  const wp = (gen.match(/wordpress\s*([\d.]+)/i) || [])[1] || "";
  const leaks_cms_version = !!wp; // WordPress version disclosed in <meta generator>
  const old_jquery = OLD_JQUERY.test(html);

  // HSTS strength → preload eligibility.
  const hsts = g("hsts");
  const maxAge = (hsts.match(/max-age=(\d+)/i) || [])[1];
  const hsts_preload_ready = !!hsts && +maxAge >= 31536000 && /includesubdomains/i.test(hsts) && /preload/i.test(hsts);

  return {
    server, powered_by: poweredBy, discloses_version,
    insecure_cookie, cookies_seen: setCookies.length,
    mixed_content, generator: gen, cms_version: wp,
    leaks_cms_version, old_jquery, hsts_preload_ready,
  };
}

// ── The extra checks, scored. Points are additive onto the Security area. ────
// Kept modest so they refine — not dominate — the existing 40-pt security band.
export function extraSecurityChecks(ext) {
  const t = ext.tls || {}, d = ext.dns || {}, p = ext.page || {};
  const checks = [];
  const add = (label, ok, points, note = "") => checks.push({ area: "security", label, ok: !!ok, points, note });

  // Certificate lifecycle — the #1 "site is broken/insecure" cause for SMBs.
  if (t.ok) {
    add("TLS certificate not expiring soon (>21 days)", t.days_to_expiry > 21, 4,
      t.days_to_expiry <= 21 ? (t.days_to_expiry < 0 ? "Certificate has EXPIRED" : `Expires in ${t.days_to_expiry} days`) : "");
    add("Certificate issued by a trusted CA (not self-signed)", t.authorized && !t.self_signed, 3,
      t.self_signed ? "Self-signed certificate — browsers will warn visitors" : (t.auth_error || ""));
  }

  // Email deliverability / spoofing hardening (beyond the base DMARC/SPF).
  add("Domain can receive email (MX record)", d.mx, 1);
  add("CAA record limits who can issue certs", d.caa, 2, d.caa ? "" : "No CAA — any CA can mint a cert for your domain");
  add("DNSSEC enabled (tamper-proof DNS)", d.dnssec, 2, d.dnssec ? "" : "DNS answers aren't cryptographically signed");

  // Information disclosure / hygiene.
  add("Server software version hidden", !p.discloses_version, 2,
    p.discloses_version ? `Discloses ${[p.server, p.powered_by].filter(Boolean).join(" / ")}` : "");
  add("Cookies marked Secure + HttpOnly", !p.insecure_cookie || p.cookies_seen === 0, 2,
    p.insecure_cookie ? "A cookie is missing Secure or HttpOnly" : "");
  add("No mixed (http) content on secure page", !p.mixed_content, 3,
    p.mixed_content ? "Loads http:// resources — breaks the padlock" : "");
  add("No outdated jQuery detected", !p.old_jquery, 2,
    p.old_jquery ? "Old jQuery with known vulnerabilities is loaded" : "");
  add("CMS version not publicly exposed", !p.leaks_cms_version, 1,
    p.cms_version ? `WordPress ${p.cms_version} exposed in page source` : "");
  add("HSTS preload-ready", p.hsts_preload_ready, 1);

  return checks;
}

// One call the audit engine can await. `probe` is the already-fetched result
// from checkHttps (so we reuse its html/headers/cookies — no second page load).
export async function collectExtSecurity(domain, probe = {}) {
  const [tlsInfo, dnsInfo, hasSecTxt] = await Promise.all([
    tlsCertInfo(domain),
    dnsSecurity(domain),
    securityTxt(domain),
  ]);
  const page = headerPageSecurity({
    headers: probe.headers || {},
    setCookies: probe.set_cookie || [],
    html: probe.html || "",
    finalUrl: probe.final_url || "https://" + domain,
  });
  return { tls: tlsInfo, dns: dnsInfo, security_txt: hasSecTxt, page };
}

export default { tlsCertInfo, dnsSecurity, securityTxt, headerPageSecurity, extraSecurityChecks, collectExtSecurity };
