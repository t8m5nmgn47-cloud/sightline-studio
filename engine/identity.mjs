// ─────────────────────────────────────────────────────────────────────────────
// Identity — "is this name/page really the business?" Shared by pipeline.mjs and
// covered by engine/selftest.mjs fixtures. Pure functions, no I/O.
// ─────────────────────────────────────────────────────────────────────────────

// ── G0: placeholders are not the business (entrance gate) ────────────────────
// A hosting company's default page (cPanel "Default Web Site Page", IIS, nginx,
// Apache, parked or suspended domains) and a site builder's never-set title
// ("Mysite", "My WordPress Blog") once shipped to the public gallery as the
// prospect's brand name (castlerockcpa → "Default Web Site Page", hrcoc →
// "Mysite"). Pages like that are rejected here; names like that are never
// accepted as the business name, wherever they came from.
export const PLACEHOLDER_PAGE_TEXT = /default web ?site page|defaultwebpage\.cgi|if you are the owner of this website,? please contact your hosting provider|welcome to nginx!|apache2? (ubuntu |debian |centos )?default page|this domain (name )?(is|has been) (parked|registered)|this domain (name )?(is|may be) for sale|buy this domain|this account has been suspended|parked free,? courtesy of/i;
export const PLACEHOLDER_PAGE_TITLE = /^(it works!?|coming soon|under construction|website coming soon|site under construction|future home of .*|domain (is )?for sale|account suspended|suspended (page|domain)|iis windows server|internet information services|index of \/.*|test page.*)$/i;
export const PLACEHOLDER_NAME = /^(default web ?site page|default page|web ?site|my ?site|my (wordpress |new |personal )?(blog|website|web site|site)|just another wordpress site|site ?title|site name|your (site|business|company) name|business name|company name|untitled( (page|site|document))?|new (page|site|website)|home ?page|home|welcome|index|main|coming soon|under construction|it works!?|test( page| site)?|wix|wix\.com|squarespace|weebly|wordpress|godaddy|iis windows server|welcome to nginx!?|404|page not found|not found|access denied|error)$/i;
export const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim();
export function isPlaceholderName(n){ const t = squash(n); return !t || PLACEHOLDER_NAME.test(t); }
export function looksPlaceholderPage(title, text){
  return PLACEHOLDER_PAGE_TITLE.test(squash(title)) || PLACEHOLDER_PAGE_TEXT.test(squash(title)) ||
    PLACEHOLDER_PAGE_TEXT.test(String(text || '').slice(0, 6000));
}

// ── name↔domain matching (G2) ───────────────────────────────────────────────
// "Does this name belong to this domain?" used to be answered by ANY token of
// >3 chars appearing in the domain string. On wamboltwealth.com that made
// "Carson Wealth" — a completely different firm, served from a mis-filed cache
// — look like a match, because "wealth" is in the domain. Industry words carry
// no identity, so they are filtered out before matching, and what remains must
// clear a real bar: two shared tokens, or one distinctive (>=6-char) one.
export const GENERIC_TOKENS = new Set([
  'wealth','health','dental','legal','group','associates','partners','financial',
  'advisor','advisors','service','services','solution','solutions','care','clinic',
  'center','centre','company','insurance','title','law','home','first','american',
  'national','family','management','capital','church','medical',
]);
export const identityTokens = (t) => (t || '').toLowerCase().split(/[^a-z0-9]+/)
  .filter((w) => w.length > 3 && !GENERIC_TOKENS.has(w));
// An initialism is identity too: "Highlands Ranch Church of Christ" is hrcoc.org.
// It counts only when the initials spell the whole domain label (>= 3 letters),
// with or without the small joining words.
export const domainLabel = (d) => (d || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/.]/)[0].replace(/[^a-z0-9]/g, '');
export function initialsOf(name, keepSmall){
  return (name || '').split(/[^A-Za-z0-9&]+/).filter(Boolean)
    .filter((w) => keepSmall || !/^(of|the|and|&|at|in|for|a)$/i.test(w))
    .map((w) => w[0].toLowerCase()).join('');
}
export function nameMatchesDomain(name, domain){
  const d = (domain || '').toLowerCase();
  const hits = identityTokens(name).filter((w) => d.includes(w));
  if (hits.length >= 2 || hits.some((w) => w.length >= 6)) return true;
  const label = domainLabel(domain);
  return label.length >= 3 && [initialsOf(name, true), initialsOf(name, false)].includes(label);
}
