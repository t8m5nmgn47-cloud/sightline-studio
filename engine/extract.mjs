// ─────────────────────────────────────────────────────────────────────────────
// Content extractors — pull real detail (service times, staff, events, gallery)
// from a page's HTML. Designed to run on rendered HTML (post-JS) for best yield,
// but degrade gracefully on raw HTML. Every function returns [] when it finds
// nothing, so the engine simply omits sections it has no real data for.
// ─────────────────────────────────────────────────────────────────────────────
import * as cheerio from 'cheerio';

const clean = s => (s || '').replace(/&#8211;/g,'–').replace(/&#8217;/g,'’').replace(/\s+/g,' ').trim();
const uniq = a => [...new Set(a)];

// Noise labels that show up in nav/footer/widgets and must never be mistaken for content.
const NOISE = /^(quicklinks|campuses|connect|email updates|text updates|views navigation|event views navigation|filters?|remove filters|close filter|menu|search|newsletter|subscribe|give|watch|home|about|contact|skip to content|load more|previous|next)$/i;

// Service / gathering times, e.g. "Sundays 9 & 11am", "Saturday nights at 4 PM".
const MONTH = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i;
export function serviceTimes(html){
  const out = [...html.matchAll(/([A-Z][a-z]+day[s]?)[^<>]{0,40}?(\d{1,2}(:\d{2})?\s?(?:AM|PM|am|pm|a\.m\.|p\.m\.))/g)]
    .map(m => clean(m[0]))
    .filter(t => t.length <= 60 && !MONTH.test(t) && !/\d{1,2},?\s*20\d\d/.test(t)); // drop dated events
  // prefer descriptive recurring lines ("Sunday mornings at 8, 9:15…") first
  return uniq(out).sort((a,b) => (/\b(morning|night|weekend|service|worship|gathering)/i.test(b)?1:0)-(/\b(morning|night|weekend|service|worship|gathering)/i.test(a)?1:0)).slice(0, 5);
}

// Staff: pair a person-name heading with the role heading that follows it.
const ROLE = /\b(pastor|minister|director|leader|elder|deacon|priest|reverend|rev\.|worship|kids|youth|students?|executive|associate|senior|lead|connections|missions?|care|administrat|communications?)\b/i;
const NAME = /^[A-Z][a-z’'.-]+(?:\s+[A-Z][a-z’'.-]+){1,2}$/;
export function staff($){
  const hs = $('h1,h2,h3,h4').map((_, e) => clean($(e).text())).get().filter(Boolean);
  const out = [];
  for (let i = 0; i < hs.length - 1; i++){
    const a = hs[i], b = hs[i+1];
    if (NAME.test(a) && !NOISE.test(a) && !ROLE.test(a) &&      // a is a real name, not a role
        ROLE.test(b) && b.length <= 42 && !NOISE.test(b) && !NAME.test(b.replace(ROLE,'').trim()||'x'))
      out.push({ name: a, role: b });
  }
  return out.filter((s,i,arr) => arr.findIndex(x=>x.name===s.name)===i).slice(0, 8);
}

// Events: The Events Calendar plugin + generic [class*=event-title] fallback.
export function events($){
  const titleSel = '.tribe-events-calendar-list__event-title, [class*="event-title"]';
  const out = [];
  $(titleSel).each((_, el) => {
    const title = clean($(el).text());
    if (!title || NOISE.test(title) || title.length > 70) return;
    // nearest date: a <time datetime> in the same event card, else nearby date text
    const card = $(el).closest('article, li, [class*="event"]');
    let when = card.find('time[datetime]').first().attr('datetime')
            || clean(card.find('[class*="event-date"], [class*="date"]').first().text());
    when = (when||'').slice(0, 40);
    // campus/location tag if present
    const loc = clean(card.find('[class*="venue"], [class*="location"], [class*="campus"]').first().text()).slice(0,40);
    out.push({ title, when, loc });
  });
  // dedupe by title, keep first (upcoming), drop obvious dupes
  return out.filter((e,i,a) => a.findIndex(x=>x.title===e.title)===i).slice(0, 6);
}

// Real content photos (rendered): sizeable jpg/png/webp, excluding logos/icons/pixels.
export function gallery($, base){
  const out = [];
  $('img').each((_, e) => {
    let s = $(e).attr('src') || $(e).attr('data-src') || '';
    if (!s) return;
    const w = +($(e).attr('width') || 0), h = +($(e).attr('height') || 0);
    s = s.split('?')[0];
    if (!/\.(jpe?g|png|webp)$/i.test(s)) return;
    if (/logo|icon|favicon|sprite|spinner|blank|pixel|\/90h|180x180|32x32|placeholder/i.test(s)) return;
    if ((w && w < 320) || (h && h < 200)) return;
    try { out.push(new URL(s, base).href); } catch {}
  });
  return uniq(out).slice(0, 12);
}

// Run all extractors over a set of {name -> html} pages, merge into one addendum.
export function extractAll(pages, base){
  const add = { serviceTimes: [], staff: [], events: [], gallery: [] };
  for (const [name, html] of Object.entries(pages)){
    if (!html) continue;
    const $ = cheerio.load(html);
    add.serviceTimes.push(...serviceTimes(html));
    add.staff.push(...staff($));
    if (/event/i.test(name) || name === 'home') add.events.push(...events($));
    add.gallery.push(...gallery($, base));
  }
  add.serviceTimes = uniq(add.serviceTimes).slice(0, 6);
  add.staff = add.staff.filter((s,i,a)=>a.findIndex(x=>x.name===s.name)===i).slice(0, 8);
  add.events = add.events.filter((e,i,a)=>a.findIndex(x=>x.title===e.title)===i).slice(0, 6);
  add.gallery = uniq(add.gallery).slice(0, 12);
  return add;
}
