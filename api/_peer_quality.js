// Deterministic peer-set quality scoring for prospect and BI comparisons.
// The goal is conservative comparability, not market discovery. A nearby business
// is not treated as a peer unless category evidence is strong enough.

const CATEGORY_RULES = [
  {
    test: /dental|dentist|orthodont|endodont/i,
    expected: /dental|dentist|orthodont|endodont|smile|teeth|tooth/i,
    mismatch: /storage|hotel|motel|chiropr|vision|optometr|insurance|church|restaurant|roof|plumb|hvac/i,
  },
  {
    test: /optometr|eye ?care|vision|optician|optical/i,
    expected: /optometr|vision|eye|optical|optician|eyewear|lens/i,
    mismatch: /dental|dentist|chiropr|family medicine|primary care|hotel|motel|storage|church|restaurant/i,
  },
  {
    test: /dermatolog|obstetr|gyn|ob-?gyn|otolaryng|\bent\b|allerg|family medicine|primary care|midwif|physician|medical|clinic/i,
    expected: /medical|clinic|health|care|physician|doctor|family|primary|dermat|allerg|women|obgyn|ent/i,
    mismatch: /storage|hotel|motel|dental|optometr|vision|insurance|church|restaurant|roof|plumb|hvac/i,
  },
  {
    test: /med ?spa|medspa|aesthetic|skin care|day spa/i,
    expected: /med ?spa|aesthetic|skin|spa|beauty|laser|inject|wellness/i,
    mismatch: /storage|hotel|motel|dental|optometr|insurance|church|restaurant|roof|plumb|hvac/i,
  },
  {
    test: /law|attorney|legal|litigation|counsel/i,
    expected: /law|attorney|legal|counsel|litigation|advocate/i,
    mismatch: /storage|hotel|motel|dental|vision|insurance agency|church|restaurant|roof|plumb|hvac/i,
  },
  {
    test: /church|parish|congregation|worship|faith|catholic|lutheran|methodist|gospel|christ/i,
    expected: /church|parish|chapel|ministr|faith|christ|catholic|lutheran|methodist|baptist|community/i,
    mismatch: /storage|hotel|motel|dental|vision|insurance|restaurant|roof|plumb|hvac/i,
  },
  {
    test: /insurance/i,
    expected: /insurance|assurance|coverage|benefit|risk/i,
    mismatch: /storage|hotel|motel|dental|vision|church|restaurant|roof|plumb|hvac/i,
  },
  {
    test: /mortgage|lend|home loan/i,
    expected: /mortgage|lending|loan|finance|financial|home loan/i,
    mismatch: /storage|hotel|motel|dental|vision|church|restaurant|roof|plumb|hvac/i,
  },
  {
    test: /wealth|financial|advisor|advisory|invest|registered investment/i,
    expected: /wealth|financial|advisor|advisory|invest|capital|asset|planning/i,
    mismatch: /storage|hotel|motel|dental|vision|church|restaurant|roof|plumb|hvac/i,
  },
  {
    test: /accountant|accounting|\bcpa\b|\btax\b/i,
    expected: /account|accounting|cpa|tax|bookkeep/i,
    mismatch: /storage|hotel|motel|dental|vision|church|restaurant|roof|plumb|hvac/i,
  },
  {
    test: /title|escrow|settlement|closing/i,
    expected: /title|escrow|settlement|closing|abstract/i,
    mismatch: /storage|hotel|motel|dental|vision|church|restaurant|roof|plumb|hvac/i,
  },
  {
    test: /jewel/i,
    expected: /jewel|diamond|gold|ring|gem/i,
    mismatch: /storage|hotel|motel|dental|vision|church|restaurant|roof|plumb|hvac/i,
  },
  {
    test: /landscap|lawn|garden/i,
    expected: /landscap|lawn|garden|tree|turf|outdoor/i,
    mismatch: /storage|hotel|motel|dental|vision|church|restaurant|insurance/i,
  },
  {
    test: /hvac|heating|cooling|plumb|furnace|electric/i,
    expected: /hvac|heating|cooling|air|plumb|furnace|electric|mechanical/i,
    mismatch: /storage|hotel|motel|dental|vision|church|restaurant|insurance/i,
  },
  {
    test: /home ?builder|construction|contractor|remodel|bath|kitchen|design-?build|renovation/i,
    expected: /builder|construction|contract|remodel|bath|kitchen|design.?build|renovat|home improvement/i,
    mismatch: /storage|hotel|motel|dental|vision|church|restaurant|insurance|print|copy center/i,
  },
  {
    test: /montessori|preschool|pre-?k|childcare|early childhood|academy|\bschool\b|education/i,
    expected: /montessori|preschool|school|academy|childcare|learning|education|early childhood/i,
    mismatch: /storage|hotel|motel|dental|vision|church|restaurant|insurance|roof|plumb|hvac/i,
  },
  {
    test: /restaurant|cafe|coffee|bakery|bar|grill|pizza/i,
    expected: /restaurant|cafe|coffee|bakery|bar|grill|pizza|kitchen|eatery|bistro/i,
    mismatch: /storage|hotel|motel|dental|vision|insurance|church|roof|plumb|hvac/i,
  },
  {
    test: /fitness|gym|yoga|pilates|crossfit/i,
    expected: /fitness|gym|yoga|pilates|crossfit|training|strength|wellness/i,
    mismatch: /storage|hotel|motel|dental|vision|insurance|church|restaurant/i,
  },
  {
    test: /salon|barber|hair|nail|beauty/i,
    expected: /salon|barber|hair|nail|beauty|studio|spa/i,
    mismatch: /storage|hotel|motel|dental|vision|insurance|church|restaurant/i,
  },
  {
    test: /real estate|realtor|broker|property/i,
    expected: /real estate|realtor|broker|property|realty|homes/i,
    mismatch: /storage|hotel|motel|dental|vision|insurance|church|restaurant/i,
  },
];

const BROAD_OSM_TAGS = new Set([
  "office=company",
  "shop=yes",
  "shop=doityourself",
  "amenity=clinic",
  "office=financial",
  "shop=beauty",
]);

const LARGE_RETAIL = /home depot|lowe'?s|walmart|target|costco|sam'?s club|ace hardware|menards/i;
const TOKEN_STOP = new Set(["and", "the", "of", "for", "services", "service", "company", "center", "group", "llc", "inc", "co"]);

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function words(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((x) => x.length >= 3 && !TOKEN_STOP.has(x));
}

function ruleFor(category) {
  return CATEGORY_RULES.find((rule) => rule.test.test(String(category || ""))) || null;
}

function matchedOsmStrength(tags = {}, filters = []) {
  for (const [key, value] of filters || []) {
    if (String(tags?.[key] || "") !== String(value)) continue;
    return BROAD_OSM_TAGS.has(`${key}=${value}`) ? "broad" : "strong";
  }
  return "none";
}

export function scorePeer(targetCategory, peer = {}, opts = {}) {
  const name = String(peer.name || "");
  const domain = String(peer.domain || peer.website || "");
  const haystack = `${name} ${domain}`.toLowerCase();
  const reasons = [];
  const rule = ruleFor(targetCategory);
  let score = 40;

  const osmStrength = matchedOsmStrength(opts.tags || peer.osm_tags || {}, opts.filters || []);
  if (osmStrength === "strong") {
    score += 25;
    reasons.push("specific category tag");
  } else if (osmStrength === "broad") {
    score += 5;
    reasons.push("broad category tag");
  }

  if (rule?.expected.test(haystack)) {
    score += 25;
    reasons.push("name/domain matches target category");
  } else if (rule) {
    score -= 8;
    reasons.push("no clear category signal in name/domain");
  }

  if (rule?.mismatch.test(haystack)) {
    score -= 55;
    reasons.push("strong mismatch signal");
  }

  if (LARGE_RETAIL.test(haystack)) {
    score -= 35;
    reasons.push("large retailer, not a like-for-like local peer");
  }

  const targetTokens = [...new Set(words(targetCategory))];
  const peerTokens = new Set(words(haystack));
  const overlap = targetTokens.filter((t) => peerTokens.has(t)).length;
  if (overlap) {
    score += Math.min(15, overlap * 6);
    reasons.push(`${overlap} category keyword match${overlap === 1 ? "" : "es"}`);
  }

  const distance = Number(peer.distance_km ?? opts.distanceKm);
  if (Number.isFinite(distance)) {
    if (distance <= 15) score += 5;
    else if (distance > 30) {
      score -= 10;
      reasons.push("outside preferred local radius");
    }
  }

  score = clamp(score);
  const confidence = score >= 75 ? "high" : score >= 55 ? "medium" : "low";
  return {
    score,
    confidence,
    eligible: score >= 55,
    reasons: reasons.slice(0, 5),
  };
}

export function assessPeerSet(targetCategory, peers = []) {
  const scored = (peers || []).map((peer) => {
    const stored = peer?.peer_quality;
    const quality = stored && Number.isFinite(Number(stored.score))
      ? {
          score: clamp(Number(stored.score)),
          confidence: stored.confidence || (Number(stored.score) >= 75 ? "high" : Number(stored.score) >= 55 ? "medium" : "low"),
          eligible: Number(stored.score) >= 55,
          reasons: Array.isArray(stored.reasons) ? stored.reasons.slice(0, 5) : [],
        }
      : scorePeer(targetCategory, peer);
    return { ...peer, peer_quality: quality };
  });

  const eligible = scored.filter((peer) => peer.peer_quality.eligible);
  const averageScore = eligible.length
    ? Math.round(eligible.reduce((sum, peer) => sum + peer.peer_quality.score, 0) / eligible.length)
    : 0;

  let confidence = "low";
  if (eligible.length >= 5 && averageScore >= 70) confidence = "high";
  else if (eligible.length >= 3 && averageScore >= 60) confidence = "medium";

  return {
    confidence,
    average_score: averageScore,
    eligible,
    scored,
    eligible_count: eligible.length,
    suppressed_count: scored.length - eligible.length,
  };
}
