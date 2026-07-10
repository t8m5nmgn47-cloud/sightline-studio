// ─────────────────────────────────────────────────────────────────────────────
// Creative quality gate — complements qa.mjs.
//
// qa.mjs answers "does it work?". This gate answers "is there enough grounded,
// distinctive material to deserve shipping?" Weak builds stop before publish.
// Use --allow-weak only for debugging a failed capture.
// ─────────────────────────────────────────────────────────────────────────────

const wc = s => String(s || '').trim().split(/\s+/).filter(Boolean).length;
const unique = xs => new Set(xs.map(x => String(x || '').trim().toLowerCase()).filter(Boolean)).size;

export function creativeGate({ profile, recipe, capture, strategy, override, business = false } = {}) {
  const fails = [], warns = [];
  if (!business) return { pass: true, fails, warns, score: 100 };

  const pages = capture?.pages || [];
  const services = profile?.sections?.services?.items || [];
  const faq = profile?.sections?.faq?.items || [];
  const about = profile?.sections?.about;
  const hero = profile?.hero || {};
  const gallery = profile?.gallery || [];
  const stock = profile?.stock || [];
  const reviews = profile?.sections?.reviews?.items || [];

  // Capture richness: a homepage-only snapshot cannot support a bespoke site.
  if (pages.length < 3 && !override) fails.push(`capture too thin: ${pages.length} page${pages.length === 1 ? '' : 's'} (need 3+)`);
  if (capture?.jsShell) fails.push('source capture is still a JS shell');

  // Hero quality: specific enough to communicate, short enough to scan.
  const hw = wc(hero.headline);
  const sw = wc(hero.sub);
  if (hw < 4 || hw > 15) fails.push(`hero headline length is weak (${hw} words; target 4–15)`);
  if (sw < 7 || sw > 36) fails.push(`hero subhead length is weak (${sw} words; target 7–36)`);
  if (/welcome to|trusted partner|quality service|excellence|state-of-the-art|one-stop shop/i.test(hero.headline || ''))
    fails.push('hero headline contains generic template language');

  // Grounded service depth: titles alone are not enough for a premium site.
  if (services.length < 3) fails.push(`not enough services (${services.length}; need 3+)`);
  const described = services.filter(s => wc(s?.p) >= 6).length;
  if (described < Math.min(3, services.length)) fails.push(`service copy too thin (${described}/${services.length} meaningfully described)`);
  if (unique(services.map(s => s?.h)) !== services.length) fails.push('duplicate service titles');

  // Narrative depth and practical answers.
  if (!about?.body || wc(about.body) < 28) fails.push('about/story section lacks grounded narrative depth');
  if (faq.length < 3) fails.push(`FAQ depth too thin (${faq.length}; need 3 grounded answers)`);

  // Visual material. Stock can support ambience, but the gallery itself remains real.
  const visualCount = (profile?.heroImage ? 1 : 0) + gallery.length + stock.length;
  if (visualCount < 3) fails.push(`visual direction too thin (${visualCount} usable image assets; need 3+)`);
  if (!profile?.heroImage) warns.push('no hero image; intentional poster treatment required');

  // Proof is not mandatory, but when absent the strategy must consciously choose
  // another argument instead of pretending proof exists.
  if (!reviews.length && recipe?.structure === 'proof') fails.push('proof structure chosen without real reviews');
  if (recipe?.structure === 'showcase' && gallery.length < 4) fails.push('showcase structure chosen without a deep real gallery');
  if (recipe?.structure === 'offer' && !profile?.sections?.offer) fails.push('offer structure chosen without a supported offer');

  // A strategy pass is the preferred route. Manual overrides can substitute;
  // heuristic-only builds may still pass if the actual content is unusually rich.
  if (!strategy && !override) warns.push('no site-strategy pass; layout used evidence-based fallback routing');

  const score = Math.max(0, 100 - fails.length * 14 - warns.length * 3);
  return { pass: fails.length === 0, fails, warns, score };
}

export default { creativeGate };
