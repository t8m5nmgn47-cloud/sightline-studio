import { normDomain } from "./_audit.js";

// Domain identity for matching stored audit/event records. Common URL spelling
// differences must not make the same business look like a different entity.
export function canonicalDomainIdentity(input) {
  return normDomain(input).replace(/^www\./, "").replace(/\.$/, "");
}

export function domainAliases(...inputs) {
  const aliases = new Set();
  for (const input of inputs) {
    const canonical = canonicalDomainIdentity(input);
    if (!canonical) continue;
    aliases.add(canonical);
    aliases.add(`www.${canonical}`);
  }
  return [...aliases];
}

export function resolveDomainRecord(rows = [], requestedDomain) {
  const target = canonicalDomainIdentity(requestedDomain);
  if (!target) return null;

  return (rows || [])
    .filter((row) => canonicalDomainIdentity(row?.domain) === target)
    .sort((a, b) => Date.parse(b?.updated_at || 0) - Date.parse(a?.updated_at || 0))[0] || null;
}
