// ─────────────────────────────────────────────────────────────────────────────
// Sightline Site Engine — turns a captured SiteProfile + a Recipe into a full,
// self-contained website. Variety comes from ARCHETYPE (structure) × THEME
// (palette/type/shape/motion) × FEATURES (which sections) × per-section treatment.
// No two recipes render the same site.
// ─────────────────────────────────────────────────────────────────────────────

import { seedOf, pick, pickFontPack, pickRad } from './variety.mjs';

// ── colour helpers ───────────────────────────────────────────────────────────
const hex = h => (h || '').trim().toLowerCase();
function rgb(h){ h=hex(h).replace('#',''); if(h.length===3) h=h.split('').map(c=>c+c).join('');
  return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
function lum([r,g,b]){ const f=v=>{v/=255; return v<=.03928?v/12.92:((v+.055)/1.055)**2.4}; return .2126*f(r)+.7152*f(g)+.0722*f(b); }
function sat([r,g,b]){ const mx=Math.max(r,g,b),mn=Math.min(r,g,b); return mx===0?0:(mx-mn)/mx; }
function darken(h,amt){ const [r,g,b]=rgb(h); const f=v=>Math.max(0,Math.round(v*(1-amt))); return `#${[f(r),f(g),f(b)].map(v=>v.toString(16).padStart(2,'0')).join('')}`; }
const rgbStr = h => rgb(h).join(',');
// WCAG contrast ratio between two hex colours
function contrast(a,b){ const [x,y]=[lum(rgb(a)),lum(rgb(b))].sort((p,q)=>q-p); return (x+.05)/(y+.05); }
// darken a colour until white text/buttons on it hit the target ratio
function clampForWhite(h, target=3){ let c=h, i=0; while(contrast(c,'#ffffff')<target && i++<12) c=darken(c,.12); return c; }
// pull an over-saturated colour toward its own grey — neon captured brands
// (pure reds/oranges) become rich instead of overwhelming
function desat(h, amt){ const [r,g,b]=rgb(h); const grey=Math.round(.299*r+.587*g+.114*b);
  const f=v=>Math.round(v+(grey-v)*amt);
  return `#${[f(r),f(g),f(b)].map(v=>v.toString(16).padStart(2,'0')).join('')}`; }
function tame(h){ const c=rgb(h); const sv=sat(c); return sv>.6 ? desat(h, Math.min(.4, (sv-.55)*1.1)) : h; }
// escape captured/profile-derived values before they enter HTML text or
// attributes — never applied to trusted renderer-built markup
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
// display-format a US phone: +13035005783 → (303) 500-5783 (module-scope —
// used by hero CTAs and normalize alike)
const fmtPhone = ph => { const d=String(ph||'').replace(/[^0-9]/g,'').replace(/^1(?=\d{10}$)/,'');
  return d.length===10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : (ph||''); };

// Derive a coherent palette from the real captured colours.
// Framework/default colours that appear in almost every site's CSS but are
// nobody's brand: Bootstrap/Tailwind/WP defaults. Never let these win.
const FRAMEWORK = new Set(['#007bff','#0056b3','#0d6efd','#6610f2','#6f42c1','#e83e8c','#dc3545','#fd7e14','#ffc107','#28a745','#20c997','#17a2b8','#6c757d','#343a40','#f8f9fa','#563d7c','#0069d9','#004085','#3b82f6','#2563eb','#1d4ed8','#0073aa','#0085ba','#2271b1','#135e96','#ff0000','#00ff00','#0000ff',
  // social-platform brand colours (share buttons / embeds — never THE brand)
  '#1877f2','#4267b2','#3b5998','#1da1f2','#1d9bf0','#0a66c2','#0077b5','#e60023','#bd081c','#25d366','#128c7e','#ff4500','#7289da','#5865f2','#e1306c','#c13584','#fe2c55','#ff0050']);
function derivePalette(colors){
  const cs = (colors||[]).map(hex).filter(c=>/^#[0-9a-f]{6}$/.test(c)).filter(c=>!FRAMEWORK.has(c));
  // capture ranks colours by real usage weight — respect that order. The FIRST
  // sufficiently-vivid colour is the brand; sorting by raw saturation let one
  // stray utility colour outrank the actual brand.
  const vivid = cs.filter(c=>sat(rgb(c))>.35 && lum(rgb(c))>.06 && lum(rgb(c))<.7);
  const darks = cs.filter(c=>lum(rgb(c))<.14).sort((a,b)=>lum(rgb(a))-lum(rgb(b)));
  const lights = cs.filter(c=>lum(rgb(c))>.85).sort((a,b)=>lum(rgb(b))-lum(rgb(a)));
  // Monochrome brands (all-black/gray sites) get a deliberate gunmetal palette —
  // near-black brand + steel accent — instead of an arbitrary default colour.
  const mono = !vivid.length;
  const brand = vivid[0] || (mono && (darks[1] || darks[0])) || '#1f6f5c';
  // accent: mono → steel; else a second vivid hue, guarded for HARMONY — it
  // must be analogous to the brand (≤70° hue distance) or a warm gold/amber;
  // a saturated clashing hue (pink checkmarks on a green site) reads broken.
  const hue = ([r,g,b]) => { const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn||1;
    let h = mx===r ? (g-b)/d % 6 : mx===g ? (b-r)/d+2 : (r-g)/d+4; return ((h*60)+360)%360; };
  const hueDist = (a,b)=>{ const d=Math.abs(hue(rgb(a))-hue(rgb(b))); return Math.min(d,360-d); };
  let accent = mono ? '#a8adb8'
    : vivid.find(c=>Math.abs(lum(rgb(c))-lum(rgb(brand)))>.08 && c!==brand) || '#c0914c';
  if (!mono){
    const aHue = hue(rgb(accent));
    const harmonious = hueDist(accent,brand) <= 70 || (aHue >= 20 && aHue <= 70) || sat(rgb(accent)) < .35;
    if (!harmonious) accent = '#c0914c';
  }
  // accent-coloured text/UI (stars, dots, checks) sits on the light page
  // ground — like clampForWhite for brand, darken until it reads (≥3:1)
  const bgLight = lights[0] || '#faf8f4';
  if (contrast(accent, bgLight) < 3){
    accent = tame(accent);
    let i = 0;
    while (contrast(accent, bgLight) < 3 && i++ < 12) accent = darken(accent, .12);
  }
  // buttons and bands put white text on brand — clamp so it always reads;
  // tame() caps saturation so a neon captured brand can't shout down the page
  const safeBrand = clampForWhite(tame(brand), 3);
  return {
    brand: safeBrand, brandD: darken(safeBrand,.18), accent,
    ink: darks[0] || '#1b1b1f',
    bg: bgLight, surf:'#ffffff',
    mut:'#6a6a72', line:'rgba(0,0,0,.10)',
  };
}

// ── profile normaliser ───────────────────────────────────────────────────────
const titleCase = s => (s||'').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
const clean = s => (s||'').replace(/\s+/g,' ').trim();

export function normalize(sig, over={}){
  const name = clean(over.name || sig.og_site_name || (sig.title||'').split(/[|–—]/)[0]);
  const tabs = (sig.nav_tabs||[])
    .map(t=>({label:clean(t.label), href:t.href}))
    .filter(t=>t.label && t.label.length<=22 && !/^(skip|search|menu|back|home|log ?in|log ?out|sign ?in|sign ?out|donate|create account|my account|account|orders?|cart|checkout|register)$/i.test(t.label))
    .filter((t,i,a)=>a.findIndex(x=>x.label.toLowerCase()===t.label.toLowerCase())===i)
    .slice(0,6);
  const phrases = (sig.hero_phrases||[]).map(clean).filter(Boolean);
  const mission = phrases.find(p=>/\b(exist|mission|help you|we are|our vision)\b/i.test(p));
  return {
    slug: over.slug,
    name,
    tagline: clean(over.tagline || sig.og_title_tag || ''),
    mission: mission ? titleCase(mission) : '',
    description: clean(sig.description||''),
    logo: over.logo,                       // path to saved logo asset
    palette: derivePalette(sig.color_signals),
    fonts: over.fonts || null,        // {head, body} — prospect's own Google Fonts
    nav: tabs.length ? tabs : null,
    phrases,
    hero: over.hero || null,               // {kick, headline, sub, ctas:[{label,href,ghost}]}
    location: over.location || '',
    phone: fmtPhone(over.phone),           // for click-to-call in the book bar
    serviceTimes: over.serviceTimes || [], // real captured service times
    gallery: over.gallery || [],           // real captured photo URLs
    sections: over.sections || {},         // {services, events, giving, team, ...}
    heroImage: over.heroImage || null,     // data URI or path
    stock: over.stock || [],               // curated vertical stock (ambience slots only)
    finalUrl: sig.finalUrl,
  };
}

// ── theme presets (font pairing + shape + motion mood) ───────────────────────
// palette may be overridden by the captured one via recipe.useCapturedPalette.
export const THEMES = {
  sanctuary:{ font:'Cormorant Garamond', fontUrl:'Cormorant+Garamond:wght@500;600;700', rad:10,
              pal:{brand:'#6b2737',brandD:'#511c29',accent:'#b08d3f'} },
  modern:{ font:'Sora', fontUrl:'Sora:wght@500;600;700;800', rad:22,
           pal:{brand:'#6d4bd8',brandD:'#5433c0',accent:'#ff7a45'} },
  quiet:{ font:'Newsreader', fontUrl:'Newsreader:opsz,wght@6..72,400;6..72,600', rad:8,
          pal:{brand:'#3a4a43',brandD:'#2b382f',accent:'#a8988a'} },
  community:{ font:'Poppins', fontUrl:'Poppins:wght@500;600;700', rad:18,
              pal:{brand:'#d97742',brandD:'#bd5f30',accent:'#4c8a76'} },
  heritage:{ font:'Playfair Display', fontUrl:'Playfair+Display:wght@500;600;700', rad:6,
             pal:{brand:'#1e2a4a',brandD:'#141d36',accent:'#c2a04a'} },
  evergreen:{ font:'Lora', fontUrl:'Lora:wght@400;500;600;700', rad:14,
              pal:{brand:'#2f6f4f',brandD:'#245740',accent:'#c0914c'} },
  // luxe (ported from the old business luxe template): fashion-house didone
  // display + tone restraint. Near-black ink brand, muted champagne accent,
  // razor corners (rad 0). pal is the FALLBACK only — with useCapturedPalette
  // (the default) the captured brand still drives colour and luxe contributes
  // the type + shape restraint.
  luxe:{ font:'Bodoni Moda', fontUrl:'Bodoni+Moda:opsz,wght@6..96,400;6..96,500;6..96,600', rad:0,
         pal:{brand:'#16151a',brandD:'#0b0b0d',accent:'#a88b47'} },
};

// motion moods (Living Light) reused from the church hero work
export const MOODS = {
  none:'', drift:'drift', godrays:'godrays', candle:'candle',
};

// ── the CSS foundation (shared) + theme injection ─────────────────────────────
function themeVars(profile, theme, useCaptured, radOverride){
  const p = profile.palette;
  const t = THEMES[theme] || THEMES.evergreen;
  const brand  = useCaptured ? p.brand  : t.pal.brand;
  const brandD = useCaptured ? p.brandD : t.pal.brandD;
  const accent = useCaptured ? p.accent : t.pal.accent;
  const rad = Number.isFinite(radOverride) ? radOverride : t.rad;
  return `--ink:${p.ink};--bg:${p.bg};--surf:${p.surf};--mut:${p.mut};--line:${p.line};
    --brand:${brand};--brand-d:${brandD};--accent:${accent};--brand-rgb:${rgbStr(brand)};--rad:${rad}px`;
}

// ── section renderers ────────────────────────────────────────────────────────
const S = {};

S.nav = (p) => `
<nav class="nav">
  <a class="brandmark" href="#top">${p.logo
    ? `<img src="${p.logo}" alt="${esc(p.name)}" class="logo" onerror="this.outerHTML='<span class=&quot;wordmark&quot;>${esc(p.name.replace(/'/g,'’'))}</span>'">`
    : `<span class="wordmark">${esc(p.name)}</span>`}</a>
  ${p.nav ? `<div class="navlinks">${p.nav.map(t=>`<a href="${t.href}">${esc(t.label)}</a>`).join('')}</div>` : ''}
  <a class="btn sm" href="#visit">${esc(p._t?.imNew || 'Get in Touch')}</a>
  ${p.nav ? `<button class="navburger" type="button" aria-label="Menu" aria-expanded="false" aria-controls="navmenu"><span></span><span></span><span></span></button>
  <div class="navlinks navlinks-m" id="navmenu">${p.nav.map(t=>`<a href="${t.href}">${esc(t.label)}</a>`).join('')}</div>` : ''}
</nav>`;

// pull a REAL price out of a grounded offer — an explicit {price} field first,
// else the first $/€/£ amount already present in the offer's own copy. Returns
// null when the offer carries no price; callers must then render type-only.
// This is the ONLY source of the statement hero's giant numerals — never invents.
function offerPriceParts(s){
  if (!s) return null;
  const src = [s.price, s.title, s.lead].filter(Boolean).join(' ');
  const m = String(src).match(/([$€£])\s?(\d[\d,]*(?:\.\d{2})?)/);
  return m ? { symbol: m[1], num: m[2] } : null;
}

S.hero = (p, {mood, arch}) => {
  const h = p.hero || {};
  // ── STATEMENT hero: high-energy split-price offer poster (ported from the
  // old bold template). The oversized price numerals render ONLY when a real
  // grounded offer (p.sections.offer) carries a real price; an offer without a
  // price gets the card sans numerals; no offer at all falls back to the
  // statement-weight type treatment. Never a fabricated price. ────────────────
  if (arch === 'statement'){
    const offer = p.sections?.offer || null;
    const pr = offerPriceParts(offer);
    const media = p.heroImage ? `<div class="st-media" style="background-image:url('${p.heroImage}')"></div>` : '';
    const ctas = h.ctas || (p._t?.bookCta ? [{label:p._t.bookCta, href:'#book'}]
      : p._t?.ctaCta ? [{label:p._t.ctaCta, href:'#visit'}]
      : [{label:'Get in touch →', href:'#book'}]);
    return `
<header class="sthero" id="top">
  ${media}
  ${pr?`<span class="st-big" aria-hidden="true">${esc(pr.num)}</span>`:''}
  <div class="wrap st-grid${offer?'':' solo'}">
    <div class="st-main">
      ${h.kick?`<span class="kick">${esc(h.kick)}</span>`:''}
      <h1 class="st-head">${esc(h.headline || p.name)}</h1>
      ${h.sub?`<p class="st-sub">${esc(h.sub)}</p>`:''}
      <div class="cta-row">
        ${ctas.map((c,i)=>`<a class="btn lg${i?' ghost':''}" href="${c.href}">${esc(c.label)}</a>`).join('')}
        ${p.phone?`<a class="btn lg ghost" href="tel:${p.phone.replace(/[^0-9]/g,'')}">${esc(fmtPhone(p.phone))}</a>`:''}
      </div>
    </div>
    ${offer?`<aside class="st-aside" aria-label="Current offer">
      <div class="st-card">
        ${offer.kicker?`<p class="st-tag">${esc(offer.kicker)}</p>`:''}
        ${pr?`<p class="st-price"><sup>${esc(pr.symbol)}</sup>${esc(pr.num)}</p>`:''}
        ${(offer.title||offer.lead)?`<p class="st-desc">${offer.title?`<b>${esc(offer.title)}</b> `:''}${offer.lead?esc(offer.lead):''}</p>`:''}
        <a class="btn" href="${offer.href||'#book'}">${esc(offer.cta||p._t?.bookCta||'Book now →')}</a>
      </div>
    </aside>`:''}
  </div>
</header>`;
  }
  // ── FLAGSHIP hero: cinematic, editorial, layered. The signature look. ──────
  if (arch === 'flagship'){
    const words = esc(h.headline || p.name).split(' ');
    const anim = words.map((w,i)=>`<span class="w" style="--i:${i}">${w}</span>`).join(' ');
    const media = p.heroVideo
      ? `<video autoplay muted loop playsinline preload="metadata" poster="${p.heroImage||''}"><source src="${p.heroVideo}" type="video/mp4"></video>`
      : p.heroImage ? `<img src="${p.heroImage}" alt="${esc(p.name)}" loading="eager">` : '';
    const trust = (p.sections?.trust?.length ? p.sections.trust : (p._t && p._t.trust) || []).slice(0,3);
    return `
<header class="fhero" id="top">
  <div class="fhero-media">${media}<div class="fhero-veil"></div></div>
  <div class="wrap fhero-in">
    ${h.kick?`<span class="fkick"><span class="fkick-dot"></span>${esc(h.kick)}</span>`:''}
    <h1 class="fhead">${anim}</h1>
    ${h.sub?`<p class="fsub">${esc(h.sub)}</p>`:''}
    <div class="fcta">
      ${(h.ctas||[{label:'Get started →',href:'#book'}]).map((c,i)=>`<a class="fbtn${i?' ghost':''}" href="${c.href}">${esc(c.label)}</a>`).join('')}
      ${p.phone?`<a class="fbtn ghost" href="tel:${p.phone.replace(/[^0-9]/g,'')}">${esc(fmtPhone(p.phone))}</a>`:''}
    </div>
    ${trust.length?`<ul class="ftrust">${trust.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:''}
  </div>
  <a class="fscroll" href="#book" aria-label="Scroll"><span></span></a>
</header>`;
  }
  // Video hero when the church gives us footage (their own, or AI for commercial demos);
  // the still image is the poster + instant fallback, so it degrades gracefully.
  const bg = p.heroVideo
    ? `<video class="hero-bg hero-video" autoplay muted loop playsinline preload="metadata" poster="${p.heroImage||''}"><source src="${p.heroVideo}" type="video/mp4"></video>`
    : p.heroImage ? `<div class="hero-bg" style="background-image:url('${p.heroImage}')"></div>` : '';
  const glow = mood && mood!=='none' ? `<div class="glow"></div>` : '';
  const noImg = !p.heroVideo && !p.heroImage ? ' no-img' : '';
  return `
<header class="hero mood-${mood||'none'}${noImg}" id="top">
  ${bg}${glow}<div class="scrim"></div>
  <div class="hero-in">
    ${h.kick?`<span class="kick">${esc(h.kick)}</span>`:''}
    <h1>${esc(h.headline || p.name)}</h1>
    ${h.sub?`<p class="hero-sub">${esc(h.sub)}</p>`:''}
    <div class="cta-row">
      ${(h.ctas || (p._t?.bookCta ? [{label:p._t.bookCta,href:'#book'}]
          : p._t?.ctaCta ? [{label:p._t.ctaCta,href:'#visit'},{label:'Watch Online',href:'#watch',ghost:true}]
          : [{label:'Get in touch →',href:'#book'}]))
        .map(c=>`<a class="btn lg${c.ghost?' ghost':''}" href="${c.href}">${esc(c.label)}</a>`).join('')}
    </div>
  </div>
</header>`;
};

S.services = (p) => { const s=p.sections.services; if(!s||!s.items||!s.items.length) return ''; const tc=p._t?.copy?.services||{};
  // described items lead — a service that carries real copy earns the top of
  // the list; the compact/pill treatment is gone (a title-only pill grid
  // orphaned its last row on every odd count and read like a nav menu).
  const items = [...s.items].sort((a,b)=>((b.p?1:0)-(a.p?1:0)));
  const kicker = s.kicker||tc.kicker||(p._t&&!p._t.bookCta?'New here?':'What we do');
  const title  = s.title ||tc.title ||(p._t&&!p._t.bookCta?'What to expect':`What ${p.name} does.`);
  // BUSINESS: a compfm-style editorial list — an intro rail beside hairline-
  // ruled rows. A vertical list cannot orphan at any count.
  // CHURCH: the card grid stays (archetypes style .card/.cardgrid heavily).
  const biz = !!(p._vertical || p._t?.bookCta);
  if (biz){
    const shown = items.slice(0,8);
    const rest  = items.length - shown.length;
    const cta   = s.cta || p._t?.bookCta || 'Get in touch →';
    return `
<section class="sec services" id="visit">
  <div class="wrap">
    <div class="svc-grid">
      <div class="svc-intro">
        <span class="sec-k">${esc(kicker)}</span>
        <h2>${esc(title)}</h2>
        ${s.lead?`<p class="svc-lead">${esc(s.lead)}</p>`:''}
        <a class="svc-cta" href="#book">${esc(cta)}</a>
      </div>
      <div class="svc-list">${shown.map((it,i)=>`
        <div class="svc-row"><span class="si">${String(i+1).padStart(2,'0')}</span>
          <div class="svc-body"><h3>${esc(it.h)}</h3>${it.p?`<p>${esc(it.p)}</p>`:''}</div></div>`).join('')}
        ${rest>0?`<p class="svc-more">…and ${rest} more — ask us what you need.</p>`:''}
      </div>
    </div>
  </div>
</section>`;
  }
  return `
<section class="sec services" id="visit">
  <div class="wrap">
    <span class="sec-k">${esc(kicker)}</span>
    <h2>${esc(title)}</h2>
    ${s.lead?`<p class="lead">${esc(s.lead)}</p>`:''}
    <div class="cardgrid">${items.map((it,i)=>`
      <article class="card"><span class="cn">${i+1}</span><h3>${esc(it.h)}</h3>${it.p?`<p>${esc(it.p)}</p>`:''}</article>`).join('')}
    </div>
  </div>
</section>`; };

S.events = (p) => { const s=p.sections.events; if(!s||!s.items) return '';
  return `
<section class="sec events" id="events">
  <div class="wrap">
    <span class="sec-k">${esc(s.kicker||'This week')}</span>
    <h2>${esc(s.title||"What's on")}</h2>
    <div class="evlist">${s.items.map(e=>`
      <div class="ev"><div class="ev-when">${esc(e.when||'')}</div>
        <div class="ev-body"><h3>${esc(e.h)}</h3><p>${esc(e.p||'')}</p></div></div>`).join('')}
    </div>
  </div>
</section>`; };

S.giving = (p) => { const s=p.sections.giving; if(!s) return '';
  return `
<section class="sec band" id="give">
  <div class="wrap band-in">
    <div><span class="sec-k light">${esc(s.kicker||'Give')}</span><h2>${esc(s.title||'Generosity, made simple.')}</h2>
      <p class="lead light">${esc(s.lead||'')}</p></div>
    <a class="btn lg light" href="${s.href||'#give'}">${esc(s.cta||'Give online')}</a>
  </div>
</section>`; };

S.cta = (p) => {
  // photo-backed close when we captured enough imagery (their own photos > flat colour)
  const pics = (p.gallery||[]).filter(g=>g!==p.heroImage);
  const img = pics.length >= 4 ? pics[pics.length-1] : null;
  // fallback copy comes from the ACTIVE PACK (p._t: vertical or tradition) —
  // never a hardcoded vertical's voice. Church copy lives in TRADITIONS
  // (ctaTitle/ctaLead/ctaCta); business copy lives in VERTICALS. No pack at
  // all → generic-neutral, safe for any direct assemble() caller.
  const s = p.sections.cta || {};
  return `
<section class="sec cta${img?' cta-photo':''}" id="join"${img?` style="background-image:linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,.55)),url('${img}')"`:''}>
  <div class="wrap">
    <h2>${esc(s.title || p._t?.ctaTitle || 'Ready to get started?')}</h2>
    <p class="lead${img?' light':''}">${esc(s.lead || p._t?.ctaLead || 'Reach out — we’ll take it from there.')}</p>
    <a class="btn lg${img?' light':''}" href="${p._t?.bookCta ? '#book' : '#visit'}">${esc(s.cta || p._t?.bookCta || p._t?.ctaCta || 'Get in touch →')}</a>
  </div>
</section>`; };

// live announcement bar — proof the church is current & alive
S.announce = (p) => p.announce ? `<div class="announce"><span class="adot"></span>${esc(p.announce)}</div>` : '';

// ── church copy variants ─────────────────────────────────────────────────────
// The church sections used to ship ONE hardcoded string each — every church
// demo read identically on a side-by-side cold call. Each section now carries
// 2-3 handwritten variants in the same warm register, chosen by the profile
// seed (same pattern as vertical-content's vary()). Variant #1 is always the
// original copy. Precedence unchanged: captured/profile content (s.*) beats
// tradition-pack copy (tc.*), which beats these seeded defaults.
const cvar = (p, salt, arr) => arr[pick(seedOf(p), salt, arr.length)];
const CHURCH_COPY = {
  nextstepsTitle: [
    'New here? Start here.',
    'Your first Sunday, made simple.',
    'Not sure where to begin? Right here.',
  ],
  nextstepsSteps: [
    [
      {n:'01',h:'Plan your visit',p:'Tell us you’re coming — we’ll have someone ready to meet you.'},
      {n:'02',h:'Come as you are',p:'Grab coffee, find a seat, stay as long as you like. No pressure.'},
      {n:'03',h:'Get connected',p:'A quick connect card is all it takes to hear about what’s next.'},
      {n:'04',h:'Find your people',p:'A group is where a big church becomes a family.'},
    ],
    [
      {n:'01',h:'Pick a Sunday',p:'Any Sunday works. Let us know you’re coming and we’ll save you a parking spot.'},
      {n:'02',h:'Walk in, breathe out',p:'No dress code, no expectations — just a warm welcome at the door.'},
      {n:'03',h:'Say hello',p:'Stop by the welcome table and we’ll answer anything you’re wondering about.'},
      {n:'04',h:'Take a next step',p:'When you’re ready — a group, a class, a conversation. At your pace.'},
    ],
    [
      {n:'01',h:'Come see for yourself',p:'The best way to know if this is home is one ordinary Sunday.'},
      {n:'02',h:'Bring the kids',p:'They’re cared for, safe, and honestly — they’ll want to come back.'},
      {n:'03',h:'Meet a real person',p:'Fill out a simple card and someone will follow up personally, not automatically.'},
      {n:'04',h:'Settle in',p:'Groups, serving, community — belonging happens a little at a time.'},
    ],
  ],
  groups: [
    { title:'Find your people.', lead:'A group is where Sunday becomes a family. Tell us your season of life and we’ll match you.' },
    { title:'Life is better together.', lead:'Nobody was meant to do faith alone. There’s a group that fits your schedule, your stage, and your questions.' },
    { title:'Get around a table.', lead:'The friendships that carry you through the week start in a living room, not a pew. We’ll help you find yours.' },
  ],
  serve: [
    { title:'There’s a place for you here.', lead:'Kids, worship, hospitality, tech, outreach — serving is how you go from attending to belonging.' },
    { title:'Put your hands to something that matters.', lead:'Whatever you’re good at — greeting, coffee, sound boards, spreadsheets — there’s a team that needs exactly that.' },
    { title:'The church runs on volunteers like you.', lead:'An hour a month changes someone’s Sunday. Tell us what you enjoy and we’ll find the fit.' },
  ],
  music: [
    { title:'A tradition of sung faith.', lead:'Choir, organ, and worship arts — music that lifts the whole room, every week.' },
    { title:'Music that carries the service.', lead:'From the first hymn to the final blessing, our musicians help the whole congregation find its voice.' },
    { title:'Come sing with us.', lead:'Whether you read music or just love to sing, there’s a place for you in our worship life.' },
  ],
  care: [
    { title:'However you come, you don’t come alone.', lead:'Need prayer, or just want someone to know you’re coming? Send a note — a real person reads every one.' },
    { title:'We’d love to pray with you.', lead:'Whatever you’re carrying this week, you don’t have to carry it by yourself. Write to us — every note reaches a real person.' },
    { title:'Tell us how we can help.', lead:'A question, a prayer request, or just “I’m thinking about visiting” — send it over and someone will reply personally.' },
  ],
  sermons: [
    { title:'Can’t make it in person? Worship with us online.', lead:'Every service streams live — and the full message library is a tap away. A great way to sample before you step in.' },
    { title:'Join us from anywhere.', lead:'Traveling, home sick, or just curious? The whole service streams live, and past messages are always there when you need them.' },
    { title:'Listen before you visit.', lead:'Not ready to walk in yet? Watch a service online first — same message, same heart, zero pressure.' },
  ],
};
// stable per-section salts (used by the variety-check gate too)
const CHURCH_SALTS = { nextsteps:41, groups:43, serve:47, music:53, care:59, sermons:61 };
// fingerprint of which copy variants a profile lands on — one axis of the
// distinctness gate (engine/variety-check.mjs)
export function churchCopySignature(profile){
  const seed = seedOf(profile);
  return Object.entries(CHURCH_SALTS)
    .map(([k,salt]) => `${k}:${pick(seed, salt, (k==='nextsteps'?CHURCH_COPY.nextstepsSteps:CHURCH_COPY[k]).length)}`)
    .join('|');
}

// the visitor journey — the spine of a congregation-first site
S.nextsteps = (p) => { const s=p.sections.nextsteps; if(!s) return '';
  const steps = s.items || cvar(p, CHURCH_SALTS.nextsteps, CHURCH_COPY.nextstepsSteps);
  return `
<section class="sec steps" id="next-steps">
  <div class="wrap"><span class="sec-k">Your next step</span><h2>${esc(s.title||cvar(p, CHURCH_SALTS.nextsteps, CHURCH_COPY.nextstepsTitle))}</h2>
    <div class="steprail">${steps.map(x=>`<div class="step"><span class="stepn">${esc(x.n)}</span><h3>${esc(x.h)}</h3><p>${esc(x.p)}</p></div>`).join('<span class="steparrow">→</span>')}</div>
    <a class="btn lg" href="#connect">Plan my visit →</a>
  </div></section>`; };

S.groups = (p) => { const s=p.sections.groups; if(!s) return ''; const tc=p._t?.copy?.groups||{};
  const v = cvar(p, CHURCH_SALTS.groups, CHURCH_COPY.groups);
  const cats = s.cats || tc.cats || ['Life Groups','Men','Women','Young Adults','Students','Families'];
  return `
<section class="sec groups" id="groups">
  <div class="wrap"><span class="sec-k">${esc(tc.kicker||'Belong')}</span><h2>${esc(s.title||tc.title||v.title)}</h2>
    <p class="lead">${esc(s.lead||tc.lead||v.lead)}</p>
    <div class="chips">${cats.map(c=>`<span class="chip">${esc(c)}</span>`).join('')}</div>
    <a class="btn lg" href="#connect">${esc(s.cta||tc.cta||'Find your group →')}</a>
  </div></section>`; };

S.serve = (p) => { const s=p.sections.serve; if(!s) return ''; const tc=p._t?.copy?.serve||{};
  const v = cvar(p, CHURCH_SALTS.serve, CHURCH_COPY.serve);
  return `
<section class="sec band alt" id="serve">
  <div class="wrap band-in"><div><span class="sec-k light">${esc(tc.kicker||'Serve')}</span>
    <h2>${esc(s.title||tc.title||v.title)}</h2>
    <p class="lead light">${esc(s.lead||tc.lead||v.lead)}</p></div>
    <a class="btn lg light" href="#connect">${esc(s.cta||tc.cta||'Find where to serve')}</a></div></section>`; };

S.music = (p) => { const s=p.sections.music; if(!s) return ''; const m=s;
  const v = cvar(p, CHURCH_SALTS.music, CHURCH_COPY.music);
  return `
<section class="sec music" id="music">
  <div class="wrap"><span class="sec-k">Worship & music</span><h2>${esc(m.title||v.title)}</h2>
    <p class="lead">${esc(m.lead||v.lead)}</p>
    <a class="btn lg" href="#events">${esc(m.cta||'Our music ministry')}</a></div></section>`; };

S.care = (p) => { const s=p.sections.care; if(!s) return '';
  const v = cvar(p, CHURCH_SALTS.care, CHURCH_COPY.care);
  return `
<section class="sec care" id="connect">
  <div class="wrap care-in">
    <div class="care-copy"><span class="sec-k">Care & prayer</span><h2>${esc(s.title||v.title)}</h2>
      <p class="lead">${esc(s.lead||v.lead)}</p></div>
    <form class="care-form" data-source="demo:${esc(p.slug||p.name||'')}">
      <input type="text" name="cname" placeholder="Your name" aria-label="Your name" required>
      <input type="email" name="cemail" placeholder="Email" aria-label="Email" required>
      <textarea rows="3" name="cmsg" placeholder="How can we pray for you, or how can we help?" aria-label="Message" required></textarea>
      <button class="btn" type="submit">Send it →</button>
      <p class="form-note" hidden></p>
    </form>
  </div></section>`; };

// Watch / Livestream — universal among top churches (7/7); the sample-before-you-come on-ramp
S.sermons = (p) => { const s=p.sections.sermons; if(!s) return '';
  const v = cvar(p, CHURCH_SALTS.sermons, CHURCH_COPY.sermons);
  return `
<section class="sec watch" id="watch">
  <div class="wrap watch-in">
    <div class="watch-copy"><span class="sec-k">Watch</span><h2>${esc(s.title||v.title)}</h2>
      <p class="lead">${esc(s.lead||v.lead)}</p>
      <div class="cta-row"><a class="btn lg" href="${s.live||'#watch'}">Watch live →</a><a class="btn ghost lg" href="${s.archive||'#watch'}">Past messages</a></div>
    </div>
    <div class="watch-frame"><span class="playbtn">▶</span>${s.latest?`<div class="watch-meta"><b>${esc(s.latest.title)}</b><span>${esc(s.latest.speaker||'')}</span></div>`:''}</div>
  </div>
</section>`; };

S.times = (p) => { const t=p.serviceTimes; if(!t||!t.length) return '';
  const heading = p._t?.timesLabel || 'Service times';
  return `
<section class="sec times" id="times">
  <div class="wrap times-in">
    <div class="times-h"><span class="sec-k">Join us</span><h2>${esc(heading)}</h2></div>
    <ul class="times-list">${t.map(x=>`<li><span class="tdot"></span>${esc(x)}</li>`).join('')}</ul>
  </div>
</section>`; };

// ── Catholic tradition sections ──────────────────────────────────────────────
S.mass = (p) => { const t=p.serviceTimes||[]; const m=p.sections.mass||{};
  // grounding rule: never invent a Mass schedule. No captured times → omit the
  // times markup; nothing captured at all → no section.
  const devos = (m.confession||m.adoration)?`<div class="wrap devos">${m.confession?`<div class="devo"><b>Reconciliation</b><span>${esc(m.confession)}</span></div>`:''}${m.adoration?`<div class="devo"><b>Eucharistic Adoration</b><span>${esc(m.adoration)}</span></div>`:''}</div>`:'';
  if(!t.length && !devos) return '';
  return `
<section class="sec times" id="times">
  ${t.length?`<div class="wrap times-in">
    <div class="times-h"><span class="sec-k">Join us</span><h2>Mass times</h2></div>
    <ul class="times-list">${t.map(x=>`<li><span class="tdot"></span>${esc(x)}</li>`).join('')}</ul>
  </div>`:''}
  ${devos}
</section>`; };

S.sacraments = (p) => { const s=p.sections.sacraments; if(!s) return '';
  const items = s.items || ['Baptism','First Holy Communion','Reconciliation','Confirmation','Holy Matrimony','Anointing of the Sick'];
  return `
<section class="sec sacr" id="sacraments">
  <div class="wrap">
    <span class="sec-k">The Sacraments</span><h2>${esc(s.title||'Encounter Christ in the sacraments.')}</h2>
    <p class="lead">${esc(s.lead||'From Baptism to Marriage, the sacraments mark every season of a Catholic life. Here’s how to receive each one in our parish.')}</p>
    <div class="sacrgrid">${items.map(x=>`<article class="sacrcard"><span class="sx">✦</span><h3>${esc(x)}</h3></article>`).join('')}</div>
    <a class="btn lg" href="#connect">${esc(s.cta||'New to the faith? Begin OCIA →')}</a>
  </div>
</section>`; };

S.team = (p) => { const s=p.sections.team; if(!s||!s.items||!s.items.length) return '';
  return `
<section class="sec team" id="team">
  <div class="wrap">
    <span class="sec-k">${esc(s.kicker||'Our team')}</span>
    <h2>${esc(s.title||'People you\'ll meet')}</h2>
    <div class="teamgrid">${s.items.map(m=>`
      <article class="tcard">${m.photo?`<img src="${m.photo}" alt="${esc(m.name)}" loading="lazy" decoding="async">`:`<div class="tinitial">${esc((m.name||'?')[0])}</div>`}
        <h3>${esc(m.name)}</h3><span class="trole">${esc(m.role||'')}</span></article>`).join('')}
    </div>
  </div>
</section>`; };

// gallery strip — the prospect's own photos, proof the site is really theirs.
// Renders only with 3+ captured photos beyond the hero; all lazy-loaded.
S.gallerystrip = (p) => {
  const hero = p.heroImage;
  const pics = (p.gallery||[]).filter(g=>g!==hero).slice(0,6);
  if (pics.length < 2) return '';
  return `
<section class="sec gstrip" id="gallery">
  <div class="wrap"><span class="sec-k">${esc(p._t?.copy?.gallery?.kicker||'Take a look')}</span><h2>${esc(p._t?.copy?.gallery?.title||'Real photos, not stock.')}</h2></div>
  <div class="gstrip-row">${pics.map((g,i)=>`<img src="${g}" alt="${esc(p.name)} — photo ${i+1}" loading="lazy" decoding="async">`).join('')}</div>
</section>`; };

// compact page header for interior pages (multi-page output)
S.pagehero = (p) => `
<header class="pagehero">
  <div class="wrap">
    <span class="sec-k light">${esc(p.name)}</span>
    <h1>${esc(p._page?.title || '')}</h1>
    ${p._page?.lead ? `<p class="pagehero-lead">${esc(p._page.lead)}</p>` : ''}
  </div>
</header>`;

S.footer = (p) => `
<footer class="foot"><div class="wrap">
  <div class="foot-brand">${esc(p.name)}</div>
  ${p.location?`<div class="foot-loc">${esc(p.location)}</div>`:''}
  <div class="foot-fine">Site by Sightline</div>
</div></footer>`;

// ── archetypes: section order + body class (drives layout treatment) ─────────
export const ARCHETYPES = {
  cathedral:{ order:['nav','hero','times','services','events','team','giving','cta','footer'], body:'arch-cathedral' },
  // editorial carries the serif-led split treatments ported from the old
  // editorial template: about_split + faq_columns instead of the plain
  // about/faq renderers (both no-op without content, as always).
  editorial:{ order:['nav','hero','services','about_split','times','giving','events','team','faq_columns','cta','footer'], body:'arch-editorial' },
  modern:{    order:['nav','hero','events','times','services','team','giving','cta','footer'], body:'arch-modern' },
  split:{     order:['nav','hero','times','services','events','team','giving','cta','footer'], body:'arch-split' },
  minimal:{   order:['nav','hero','services','times','events','giving','cta','footer'], body:'arch-minimal' },
  // congregation-first: ordered around the visitor's journey, not the institution
  journey:{   order:['announce','nav','hero','times','nextsteps','services','groups','serve','events','team','care','giving','sermons','cta','footer'], body:'arch-journey' },
  // FLAGSHIP: the $15k look. Cinematic hero, editorial type, layered depth,
  // staggered reveals. The one we show on every call.
  flagship:{  order:['nav','hero','marquee','services','about','whyus','reviews','offer','gallery','faq','hours','cta','footer'], body:'arch-flagship' },
  // STATEMENT: the high-energy offer-forward look (ported from the old bold
  // template). Oversized split-price hero when a real offer exists, marquee
  // early, offer prominent, proof after. Chunky type, strong brand blocks.
  statement:{ order:['announce','nav','hero','marquee','offer','services','whyus','reviews','about_split','gallery','team','faq_columns','hours','cta','footer'], body:'arch-statement' },
  // HEARTH: warm, homey, gathered — ported from the old hearth church template
  // (cream ground, pill buttons, tilted number chips, curved hero edge, paper
  // grain). CHURCH archetype: a gathered visitor-journey order built from the
  // existing church renderers only (every one no-ops without content). Times
  // sit late as a warm dark band, the way the old template closed its page.
  hearth:{ order:['announce','nav','hero','services','nextsteps','sermons','groups','serve','music','giving','events','times','care','cta','footer'], body:'arch-hearth' },
};

// ── business sections (local high-value verticals: dental / law / medspa) ────
S.bookbar = (p) => { const b=p.sections.book||{};
  return `
<section class="sec bookbar" id="book">
  <div class="wrap bookbar-in">
    <div><b>${esc(b.title||'Ready when you are.')}</b><span>${esc(b.sub||'Book online in under a minute — or call and we’ll take care of the rest.')}</span></div>
    <div class="bookbtns"><a class="btn lg" href="${b.href||'#book'}">${esc(p._t?.bookCta||'Book appointment →')}</a>${p.phone?`<a class="btn ghost lg" href="tel:${p.phone.replace(/[^0-9]/g,'')}">📞 ${esc(fmtPhone(p.phone))}</a>`:''}</div>
  </div>
</section>`; };

// FLAGSHIP marquee — a slow scrolling band of what they do / who they serve.
S.marquee = (p) => {
  const items = (p._t?.services || p.sections?.services?.items?.map(i=>i.h) || []).filter(Boolean).slice(0,8);
  if (!items.length) return '';
  const run = items.map(x=>`<span>${esc(x)}</span><span class="mstar">✦</span>`).join('');
  return `
<section class="fmarquee" aria-hidden="true"><div class="fmarquee-t">${run}${run}</div></section>`;
};

S.reviews = (p) => { const s=p.sections.reviews; if(!s) return '';
  const items = s.items || [];
  return `
<section class="sec reviews" id="reviews">
  <div class="wrap">
    <span class="sec-k">${esc(s.kicker||'What people say')}</span>
    <h2>${esc(s.title||'Trusted by neighbors like you.')}</h2>
    ${s.rating?`<div class="rating"><span class="stars">★★★★★</span> <b>${esc(s.rating)}</b> from <b>${esc(s.count||'hundreds of')}</b> reviews</div>`:''}
    <div class="rvgrid">${items.map(r=>`<blockquote class="rv">“${esc(r.q)}”<cite>— ${esc(r.name||'Verified patient')}</cite></blockquote>`).join('')}</div>
  </div>
</section>`; };

S.offer = (p) => { const s=p.sections.offer; if(!s) return '';
  return `
<section class="sec band" id="offer">
  <div class="wrap band-in">
    <div><span class="sec-k light">${esc(s.kicker||'New here?')}</span><h2>${esc(s.title||'New-patient special.')}</h2>
      <p class="lead light">${esc(s.lead||'')}</p></div>
    <a class="btn lg light" href="${s.href||'#book'}">${esc(s.cta||'Claim this offer →')}</a>
  </div></section>`; };

S.results = (p) => { const s=p.sections.results; if(!s) return '';
  const items = s.items || [];
  return `
<section class="sec results" id="results">
  <div class="wrap"><span class="sec-k">${esc(s.kicker||'Results')}</span><h2>${esc(s.title||'Real results, real people.')}</h2>
    <div class="cardgrid">${items.map(it=>`<article class="card"><h3>${esc(it.h)}</h3><p>${esc(it.p||'')}</p></article>`).join('')}</div>
  </div></section>`; };

// trust band — the pack's proof points, right under the hero/services
S.trust = (p) => { const s=p.sections.trust; if(!s||!s.items||!s.items.length) return '';
  return `
<section class="trustband">
  <div class="wrap trust-in">${s.items.map(t=>`<div class="trustitem"><span class="tcheck">✓</span>${esc(t)}</div>`).join('')}</div>
</section>`; };

// Cost/coverage band. The old fallbacks were dental-voiced ("Affordable care",
// "Insurance & financing, made easy.", "Verified patient") and fired for ANY
// vertical that reached this renderer without copy — so a construction firm or
// a title company could be made to talk about dental insurance. Fallback copy
// now comes from the ACTIVE PACK (p._t, same source S.cta uses), and when
// neither the section nor the pack has anything real to say, the band renders
// nothing. Empty beats invented.
S.bizmoney = (p) => { const s=p.sections.money; if(!s) return '';
  const tc = p._t?.copy?.money || {};
  const kicker = s.kicker || tc.kicker || '';
  const title  = s.title  || tc.title  || '';
  const lead   = s.lead   || tc.lead   || '';
  if (!kicker && !title) return '';        // no headline of its own = no section
  const img = photoPlan(p).money;
  return `
<section class="sec money" id="money">
  <div class="wrap money-in${img?'':' noimg'}">
    <div class="money-copy">
      ${kicker?`<span class="sec-k">${esc(kicker)}</span>`:''}${title?`<h2>${esc(title)}</h2>`:''}
      ${lead?`<p class="lead">${esc(lead)}</p>`:''}
      ${s.quote?`<blockquote class="money-quote">“${esc(s.quote.q)}”<cite>— ${esc(s.quote.name||'Verified review')}</cite></blockquote>`:''}
      ${s.logos?`<div class="chips">${s.logos.map(l=>`<span class="chip">${esc(l)}</span>`).join('')}</div>`:''}
      <a class="btn" href="#book" style="margin-top:20px">${esc(s.cta||tc.cta||p._t?.bookCta||'Get in touch →')}</a>
    </div>
    ${img?`<div class="money-img"><img src="${img}" alt="${esc(p.name)}" loading="lazy" decoding="async"></div>`:''}
  </div></section>`; };

// Why-us pillars — credibility without fabricating reviews.
S.whyus = (p) => { const s=p.sections.whyus; if(!s||!s.items||!s.items.length) return '';
  return `
<section class="sec whyus" id="why">
  <div class="wrap">
    <span class="sec-k">${esc(s.kicker||'Why choose us')}</span>
    <h2>${esc(s.title||"The difference you'll feel.")}</h2>
    <div class="whygrid">${s.items.map((it,i)=>`
      <div class="why" style="--n:${i}"><span class="whycheck">✓</span><div><h3>${esc(it.h)}</h3><p>${esc(it.p||'')}</p></div></div>`).join('')}
    </div>
  </div>
</section>`; };

S.hours = (p) => { const s=p.sections.hours||{};
  // grounding rule: no captured hours → no section. Empty is better than false.
  if(!s.items||!s.items.length) return '';
  return `
<section class="sec times" id="contact">
  <div class="wrap times-in">
    <div class="times-h"><span class="sec-k">Visit us</span><h2>Hours & location</h2>${p.location?`<p class="lead">${esc(p.location)}</p>`:''}</div>
    <ul class="times-list">${s.items.map(x=>`<li><span class="tdot"></span>${esc(x)}</li>`).join('')}</ul>
  </div></section>`; };


// ── narrative-arc sections (the compfm bar): feature split, about story, ─────
// gallery grid, FAQ. Every renderer no-ops without content, so a thin capture
// degrades gracefully instead of rendering an empty frame.
// Photo allocation: one plan per page so feature/about/gallery/CTA never
// repeat the same image.
function photoPlan(p){
  if (p._photoPlan) return p._photoPlan;
  const pics = (p.gallery||[]).filter(g=>g && g!==p.heroImage);
  const stock = (p.stock||[]).filter(g=>g && g!==p.heroImage);
  const galEnd = pics.length >= 4 ? pics.length - 1 : pics.length;   // reserve the last pic for the CTA background
  // captured photos first; curated stock fills the ambience slots (feature,
  // about) when capture ran thin. The gallery grid stays captured-only —
  // stock is never presented as "their photos".
  return p._photoPlan = {
    feature: pics[0] || stock[0] || null,
    about:   pics[1] || (pics[0] ? stock[0] : stock[1]) || null,
    money:   pics[2] || stock[2] || stock[1] || null,
    gallery: pics.slice(3, Math.min(11, galEnd)),
  };
}

// split image/checklist band — the "why choose us" story with a real photo
S.feature = (p) => { const s=p.sections.feature; if(!s||!s.points||!s.points.length) return '';
  const img = photoPlan(p).feature;
  return `
<section class="sec featsplit" id="why">
  <div class="wrap feat-in${img?'':' noimg'}">
    ${img?`<div class="feat-img"><img src="${img}" alt="${esc(p.name)}" loading="lazy" decoding="async"></div>`:''}
    <div class="feat-copy">
      <span class="sec-k">${esc(s.kicker||'Why us')}</span>
      <h2>${esc(s.title||`Why neighbors choose ${p.name}.`)}</h2>
      ${s.lead?`<p class="lead">${esc(s.lead)}</p>`:''}
      <ul class="feat-points">${s.points.map(x=>`<li><span class="tcheck">✓</span><span>${esc(x)}</span></li>`).join('')}</ul>
    </div>
  </div>
</section>`; };

// about/story band — mission narrative + stat chips, photo when captured
S.about = (p) => { const s=p.sections.about; if(!s||!s.body) return '';
  const img = photoPlan(p).about;
  const stats = (s.stats||[]).filter(x=>x&&x.v);
  return `
<section class="sec aboutband" id="about">
  <div class="wrap about-in${img?'':' noimg'}">
    <div class="about-copy">
      <span class="sec-k">${esc(s.kicker||'Our story')}</span>
      <h2>${esc(s.title||`The story behind ${p.name}.`)}</h2>
      <p class="lead">${esc(s.body)}</p>
      ${stats.length?`<div class="about-stats">${stats.map(x=>`<div class="astat"><b>${esc(x.v)}</b><span>${esc(x.k)}</span></div>`).join('')}</div>`:''}
    </div>
    ${img?`<div class="about-img"><img src="${img}" alt="${esc(p.name)}" loading="lazy" decoding="async"></div>`:''}
  </div>
</section>`; };

// business gallery grid ("A closer look") — needs 3+ photos beyond hero/feature/about
S.gallery = (p) => {
  const pics = photoPlan(p).gallery;
  if (pics.length < 3) return '';
  return `
<section class="sec bizgallery" id="gallery">
  <div class="wrap"><span class="sec-k">${esc(p.sections.gallery?.kicker||'Gallery')}</span><h2>${esc(p.sections.gallery?.title||'A closer look.')}</h2>
    <div class="bgal">${pics.map((g,i)=>`<figure class="bgal-i${i===0?' wide':''}"><img src="${g}" alt="${esc(p.name)} — photo ${i+1}" loading="lazy" decoding="async"></figure>`).join('')}</div>
  </div>
</section>`; };

// FAQPage structured data (rich-result eligible) — ONE builder shared by every
// FAQ renderer (S.faq accordion + S.faq_columns two-column) so the schema never
// drifts between treatments.
function faqLd(items){
  const strip = (t)=>String(t||'').replace(/<[^>]+>/g,'');
  return { '@context':'https://schema.org','@type':'FAQPage',
    mainEntity: items.map(f=>({'@type':'Question',name:strip(f.q),acceptedAnswer:{'@type':'Answer',text:strip(f.a)}})) };
}

// FAQ accordion + FAQPage structured data (rich-result eligible)
S.faq = (p) => { const s=p.sections.faq; if(!s||!s.items||!s.items.length) return '';
  const ld = faqLd(s.items);
  return `
<section class="sec faqsec" id="faq">
  <div class="wrap">
    <span class="sec-k">${esc(s.kicker||'Good to know')}</span>
    <h2>${esc(s.title||'Questions, answered.')}</h2>
    <div class="faqlist">${s.items.map((f,i)=>`
      <details class="faq-i"${i===0?' open':''}><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}
    </div>
  </div>
  <script type="application/ld+json">${JSON.stringify(ld)}</script>
</section>`; };

// ── editorial split treatments (ported from the old editorial template) ──────
// About as a serif-led split: narrative beside a framed portrait photo. Image
// comes from the SAME photoPlan slot as S.about (captured-first, curated stock
// fallback) — no new image path. With no photo at all, a brand monogram panel
// stands in (initials derived from the real name; a graphic, not a claim).
S.about_split = (p) => { const s=p.sections.about; if(!s||!s.body) return '';
  const img = photoPlan(p).about;
  const media = img
    ? `<figure class="abs-media"><img src="${img}" alt="${esc(p.name)}" loading="lazy" decoding="async"></figure>`
    : `<div class="abs-media abs-panel"><span class="abs-mark">${esc((p.name||'').split(/\s+/).map(w=>w[0]).join('').slice(0,3))}</span></div>`;
  const stats = (s.stats||[]).filter(x=>x&&x.v);
  return `
<section class="sec aboutsplit" id="about">
  <div class="wrap abs-in">
    <div class="abs-copy">
      <span class="sec-k">${esc(s.kicker||'Our story')}</span>
      <h2>${esc(s.title||`The story behind ${p.name}.`)}</h2>
      <p class="abs-body">${esc(s.body)}</p>
      ${p.location?`<p class="abs-loc">◆ ${esc(p.location)}</p>`:''}
      ${stats.length?`<div class="about-stats">${stats.map(x=>`<div class="astat"><b>${esc(x.v)}</b><span>${esc(x.k)}</span></div>`).join('')}</div>`:''}
    </div>
    ${media}
  </div>
</section>`; };

// FAQ as an editorial two-column layout: sticky heading rail beside the
// accordion. Same grounding + the SAME FAQPage JSON-LD builder as S.faq.
S.faq_columns = (p) => { const s=p.sections.faq; if(!s||!s.items||!s.items.length) return '';
  const ld = faqLd(s.items);
  const tel = p.phone ? p.phone.replace(/[^0-9]/g,'') : '';
  return `
<section class="sec faqcols" id="faq">
  <div class="wrap faqcols-in">
    <div class="faqcols-h"><span class="sec-k">${esc(s.kicker||'Good to know')}</span>
      <h2>${esc(s.title||'Questions, answered.')}</h2>
      <p class="lead">Don't see yours? ${tel?`Call <a href="tel:${tel}">${esc(p.phone)}</a> — a real person answers.`:'Reach out — a real person answers.'}</p></div>
    <div class="faqlist">${s.items.map((f,i)=>`
      <details class="qa"${i===0?' open':''}><summary>${esc(f.q)}<span class="qplus" aria-hidden="true"></span></summary><p>${esc(f.a)}</p></details>`).join('')}
    </div>
  </div>
  <script type="application/ld+json">${JSON.stringify(ld)}</script>
</section>`; };

// ── demo-only upsell layer ────────────────────────────────────────────────────
// Renders ONLY on demos (recipe.indexable !== true); disable per render with
// recipe.upsells = false. Shows the prospect what higher Sightline tiers add.
// These are clearly-labelled optional add-ons — nothing pretends to be live.
const UPSELL_BASE = [
  { h:'Online booking',        p:'Patients and clients book themselves 24/7 — synced to your calendar, with reminders that cut no-shows.', tier:'Growth' },
  { h:'Review engine',         p:'Automatic post-visit review requests that grow your Google rating on autopilot.', tier:'Growth' },
  { h:'Monthly SEO content',   p:'Fresh, search-optimised pages every month so you climb the rankings for the services that pay.', tier:'Pro' },
  { h:'Google Business sync',  p:'Hours, photos, offers and posts pushed to your Google profile automatically.', tier:'Pro' },
];
const UPSELL_VERTICAL = {
  dental:   { h:'Insurance & membership pages', p:'Plan-by-plan insurance pages plus an in-house membership club that converts the uninsured.', tier:'Pro' },
  medical:  { h:'Patient intake forms',         p:'HIPAA-conscious online intake that fills your front desk’s day before patients arrive.', tier:'Pro' },
  medspa:   { h:'Before & after gallery',       p:'A consent-managed results gallery — your strongest closer, updated from your phone.', tier:'Growth' },
  law:      { h:'Lead-qualifying intake',       p:'Case-type intake forms that qualify prospects before the first consult.', tier:'Pro' },
  trades:   { h:'Instant estimate requests',    p:'Photo-upload estimate forms that turn night-time browsers into booked jobs.', tier:'Growth' },
  optometry:{ h:'Frame gallery & insurance',    p:'A browsable frame gallery plus vision-plan pages that pre-answer the #1 phone question.', tier:'Pro' },
  childcare:{ h:'Tour scheduling & waitlist',   p:'Parents book tours online and join a managed waitlist — no more phone tag.', tier:'Growth' },
};
const UPSELL_CSS = `<style id="sl-upsell-css">
.upsell .upgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px;margin-top:26px}
.upcard{position:relative;background:var(--surf);border:1px dashed var(--line);border-radius:var(--rad);padding:22px;opacity:.92}
.upcard h3{margin:8px 0 6px;font-size:1.05rem}
.upcard p{margin:0;color:var(--mut);font-size:.92rem}
.uptier{position:absolute;top:14px;right:14px;font-size:.72rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--brand);border:1px solid var(--brand);border-radius:999px;padding:3px 10px}
.uplock{font-size:1.1rem;opacity:.7}
.upgrade{background:linear-gradient(120deg,var(--brand),var(--brand-d));color:#fff}
.upgrade .wrap{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:18px;padding-top:34px;padding-bottom:34px}
.upgrade b{font-size:1.12rem}.upgrade span{opacity:.9;display:block;margin-top:4px;max-width:56ch}
.upgrade .btn.light{background:#fff;color:var(--brand-d)}
</style>`;

S.upsell = (p) => {
  const extra = UPSELL_VERTICAL[p._vertical] ? [UPSELL_VERTICAL[p._vertical]] : [];
  const items = [...extra, ...UPSELL_BASE].slice(0, 4);
  return `
<section class="sec upsell" id="upgrades">
  <div class="wrap">
    <span class="sec-k">Ready when you are</span>
    <h2>Your site can do even more.</h2>
    <p class="lead">This demo is the Foundation build. These add-ons switch on without a redesign:</p>
    <div class="upgrid">${items.map(u=>`
      <article class="upcard"><span class="uptier">${u.tier}</span><span class="uplock">🔒</span><h3>${u.h}</h3><p>${u.p}</p></article>`).join('')}
    </div>
  </div>
</section>`;
};

S.upgradecta = (p) => `
${UPSELL_CSS}
<section class="sec upgrade" id="upgrade">
  <div class="wrap">
    <div><b>Like what you see? This is just the Foundation tier.</b>
      <span>Online booking, an automatic review engine and monthly SEO content are one conversation away — no rebuild, no downtime.</span></div>
    <a class="btn lg light" href="https://sightline-studio.vercel.app/pricing" target="_blank" rel="noopener">See what's included →</a>
  </div>
</section>`;

// ── traditions: the CONTENT layer (which sections, vocabulary, tone) ─────────
// Separate from archetype (visual structure) and theme (palette/type). A Catholic
// parish and a non-denom church can share a visual archetype but differ completely
// in sections + language. Covers the sellable market with a few packs, not per-religion.
export const TRADITIONS = {
  contemporary:{ label:'Contemporary', imNew:"I'm New", timesLabel:'Service times',
    ctaTitle:'We saved you a seat.', ctaLead:'Come as you are — this Sunday.', ctaCta:'Plan Your Visit →',
    order:['announce','nav','hero','times','nextsteps','services','groups','serve','sermons','events','team','care','giving','cta','footer'] },
  catholic:{ label:'Catholic', imNew:'New to the Parish', timesLabel:'Mass times',
    ctaTitle:'We saved you a seat.', ctaLead:'Come as you are — this Sunday.', ctaCta:'Plan Your Visit →',
    order:['announce','nav','hero','mass','sacraments','services','serve','sermons','events','team','care','giving','cta','footer'] },
  mainline:{ label:'Mainline / Liturgical', imNew:'Visiting?', timesLabel:'Worship times',
    ctaTitle:'We saved you a seat.', ctaLead:'Come as you are — this Sunday.', ctaCta:'Plan Your Visit →',
    order:['announce','nav','hero','times','services','sermons','music','groups','serve','events','team','care','giving','cta','footer'],
    copy:{
      services:{ kicker:'Welcome', title:'What a Sunday looks like here.' },
      groups:{ kicker:'Grow', title:'Ministries for every season of faith.',
        lead:'From faith formation to fellowship, there’s a place to grow alongside others.',
        cats:['Adult Formation','Children','Youth','Women','Men','Seniors'], cta:'Explore ministries →' },
      serve:{ kicker:'Mission', title:'Faith in action — mission & outreach.',
        lead:'Local mission, global partners, and hands-on service in our community.', cta:'Explore mission & outreach' },
    } },
};

// ── business verticals: the profit engine (same architecture as traditions) ──
export const VERTICALS = {
  dental:{ label:'Dental', imNew:'New Patients', bookCta:'Book appointment →',
    ctaTitle:'Ready when you are.', ctaLead:'New patients welcome — book a visit that fits your schedule.',
    order:['announce','nav','hero','marquee','bookbar','services','about','whyus','reviews','offer','gallery','team','results','bizmoney','faq','hours','cta','footer'] },
  medical:{ label:'Medical', imNew:'New Patients', bookCta:'Request an appointment →',
    ctaTitle:'Your health, on your schedule.', ctaLead:'Request an appointment and we’ll take it from there.',
    order:['announce','nav','hero','marquee','bookbar','services','about','whyus','reviews','bizmoney','gallery','team','offer','faq','hours','cta','footer'] },
  optometry:{ label:'Eye Care', imNew:'New Patients', bookCta:'Book an eye exam →',
    ctaTitle:'See the difference.', ctaLead:'Book an eye exam — most visits take under an hour.',
    order:['announce','nav','hero','marquee','bookbar','services','about','whyus','reviews','offer','gallery','bizmoney','team','faq','hours','cta','footer'] },
  law:{ label:'Law', imNew:'Free Consult', bookCta:'Request a free consult →',
    ctaTitle:'Let’s talk about your case.', ctaLead:'A consultation costs nothing and clarifies everything.',
    order:['announce','nav','hero','marquee','bookbar','services','about','whyus','reviews','team','offer','faq','hours','cta','footer'] },
  accounting:{ label:'Accounting', imNew:'New Clients', bookCta:'Book a consultation →',
    ctaTitle:'Take the numbers off your plate.', ctaLead:'Book a consultation and get your year in order.',
    order:['announce','nav','hero','marquee','bookbar','services','about','whyus','reviews','team','offer','faq','hours','cta','footer'] },
  insurance:{ label:'Insurance', imNew:'Free Quote', bookCta:'Get a free quote →',
    ctaTitle:'Covered, without the runaround.', ctaLead:'Get a free quote in minutes — no obligation.',
    order:['announce','nav','hero','marquee','bookbar','services','about','whyus','offer','reviews','team','faq','hours','cta','footer'] },
  mortgage:{ label:'Mortgage', imNew:'Get Started', bookCta:'Get pre-approved →',
    ctaTitle:'Ready to make your move?', ctaLead:'Get pre-approved and shop with confidence.',
    order:['announce','nav','hero','marquee','bookbar','services','about','whyus','offer','reviews','team','faq','hours','cta','footer'] },
  title:{ label:'Title & Escrow', imNew:'Start a File', bookCta:'Open an order →',
    ctaTitle:'Let’s open your file.', ctaLead:'Fast, accurate closings start with one order.',
    order:['announce','nav','hero','marquee','bookbar','services','about','whyus','offer','reviews','team','faq','hours','cta','footer'] },
  medspa:{ label:'Med Spa', imNew:'Book Now', bookCta:'Book your visit →',
    ctaTitle:'You, refreshed.', ctaLead:'Book your visit — consultations are easy and pressure-free.',
    order:['announce','nav','hero','marquee','bookbar','services','about','whyus','reviews','offer','gallery','results','team','bizmoney','faq','hours','cta','footer'] },
  construction:{ label:'Commercial Construction', imNew:'Work With Us', bookCta:'Discuss your project \u2192',
    ctaTitle:'Let\u2019s build it right.', ctaLead:'Tell us about your project \u2014 scope, site, and timeline.',
    order:['announce','nav','hero','marquee','bookbar','services','about','whyus','reviews','gallery','results','offer','team','faq','hours','cta','footer'] },
  trades:{ label:'Home Services', imNew:'Free Estimate', bookCta:'Get a free estimate →',
    ctaTitle:'Fixed right the first time.', ctaLead:'Free estimates — call today, on the schedule this week.',
    order:['announce','nav','hero','marquee','bookbar','services','about','whyus','offer','reviews','gallery','bizmoney','results','faq','hours','cta','footer'] },
  childcare:{ label:'Childcare & Education', imNew:'Schedule a Tour', bookCta:'Schedule a tour →',
    ctaTitle:'Come see for yourself.', ctaLead:'Schedule a tour and meet the people your child will spend the day with.',
    order:['announce','nav','hero','marquee','bookbar','services','about','whyus','offer','reviews','gallery','team','faq','hours','cta','footer'] },
  retail:{ label:'Shop', imNew:'Shop', bookCta:'Shop now →',
    ctaTitle:'Find your next favorite.', ctaLead:'Visit the shop or browse what’s new this week.',
    order:['announce','nav','hero','marquee','services','about','whyus','reviews','offer','gallery','faq','bookbar','cta','footer'] },
  business:{ label:'Local Business', imNew:'Get Started', bookCta:'Get in touch →',
    ctaTitle:'Ready to get started?', ctaLead:'Reach out — we’ll take it from there.',
    order:['announce','nav','hero','marquee','bookbar','services','about','whyus','offer','reviews','gallery','team','faq','hours','cta','footer'] },
};

// Every business vertical carries the full narrative arc (feature split →
// about story → gallery → FAQ) — the structure of the hand-built flagship
// demos. Renderers no-op without content, so this never produces empty frames.
for (const v of Object.values(VERTICALS)) {
  const o = v.order;
  const insAfter = (name, ...anchors) => {
    if (o.includes(name)) return;
    for (const a of anchors) { const i = o.indexOf(a); if (i > -1) { o.splice(i+1, 0, name); return; } }
    o.splice(o.indexOf('cta'), 0, name);
  };
  insAfter('feature', 'services');
  insAfter('about', 'reviews', 'feature');
  insAfter('gallery', 'team', 'about');
  insAfter('faq', 'gallery');
}



// ── structural variants: six skeletons over the same conversion spine ────────
// Same six visitor questions, different order of argument. recipe.structure
// picks one; sections without content no-op as always. Business verticals only.
export const STRUCTURES = {
  // classic: trust-led funnel (the default per-vertical order) — structure=null
  proof:    ['announce','nav','hero','reviews','bookbar','trust','services','feature','about','offer','team','gallery','faq','bizmoney','hours','cta','footer'],
  story:    ['announce','nav','hero','about','feature','services','gallery','reviews','team','offer','faq','bizmoney','hours','bookbar','cta','footer'],
  offer:    ['announce','nav','hero','offer','bookbar','services','trust','reviews','faq','feature','about','gallery','bizmoney','hours','cta','footer'],
  showcase: ['announce','nav','hero','gallery','feature','services','reviews','about','trust','offer','team','faq','bizmoney','hours','cta','footer'],
  flagship: ['nav','hero','marquee','services','feature','reviews','about','offer','gallery','faq','bizmoney','hours','cta','footer'],
};

// ── the stylesheet (structure + archetype/mood variations) ───────────────────
function stylesheet(){ return `
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);
  font-family:Inter,system-ui,-apple-system,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased}
h1,h2,h3{font-family:'__DISPLAY__',Georgia,serif;font-weight:600;line-height:1.08;letter-spacing:-.01em;margin:0}
.wrap{max-width:1120px;margin:0 auto;padding:0 24px}
.btn{display:inline-block;font-weight:600;text-decoration:none;background:var(--brand);color:#fff;
  padding:12px 22px;border-radius:calc(var(--rad)*1px);border:1px solid transparent;transition:.2s}
.btn.lg{padding:15px 28px;font-size:1.02rem}.btn.sm{padding:9px 16px;font-size:.9rem}
.btn.ghost{background:transparent;border-color:rgba(255,255,255,.5);color:#fff}
.btn.light{background:#fff;color:var(--brand)}
.btn:hover{background:var(--brand-d)}
.sec-k{display:block;font-size:.76rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--brand)}
.sec-k.light{color:rgba(255,255,255,.85)}
.lead{color:var(--mut);font-size:1.08rem;max-width:60ch;margin:.5em 0 0}.lead.light{color:rgba(255,255,255,.9)}
.sec{padding:clamp(48px,7vw,96px) 0}
/* nav */
.nav{position:absolute;top:0;left:0;right:0;z-index:10;display:flex;align-items:center;gap:20px;
  padding:18px clamp(20px,4vw,44px);color:#fff;flex-wrap:wrap;row-gap:10px}
.nav .brandmark{display:inline-flex;align-items:center;background:#fff;border-radius:9px;padding:7px 12px;box-shadow:0 2px 12px rgba(0,0,0,.12);text-decoration:none}
.nav .logo{height:30px;width:auto;max-width:min(56vw,230px);object-fit:contain;display:block}
.arch-split .nav .brandmark,.arch-minimal .nav .brandmark{box-shadow:none;background:transparent;padding:0}
.nav .wordmark{font-family:'__DISPLAY__',serif;font-size:1.4rem;font-weight:600}
.navlinks{display:flex;gap:12px 20px;margin-left:auto;font-size:.82rem;font-weight:600;letter-spacing:.02em;flex-wrap:wrap;justify-content:flex-end}
.navlinks a{color:#fff;text-decoration:none;opacity:.9;text-transform:uppercase}
.navlinks a:hover{opacity:1}.nav .btn{margin-left:12px}
/* hero */
.hero{position:relative;min-height:100svh;display:flex;align-items:flex-end;color:#fff;isolation:isolate;overflow:hidden}
.hero-bg{position:absolute;inset:0;z-index:-3;background-size:cover;background-position:center;transform:scale(1.06);transform-origin:60% 40%}
.hero-video{width:100%;height:100%;object-fit:cover}
.glow{position:absolute;z-index:-2;pointer-events:none;display:none;mix-blend-mode:screen}
.scrim{position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(0,0,0,.44),rgba(0,0,0,.12) 34%,rgba(0,0,0,.42) 62%,rgba(0,0,0,.86))}
.hero-in{padding:0 clamp(20px,4vw,44px) clamp(44px,7vw,84px);max-width:820px}
.hero .kick{font-size:.78rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
.hero h1{font-size:clamp(2.4rem,6.5vw,4.6rem);margin:.24em 0 .2em;text-shadow:0 2px 30px rgba(0,0,0,.35);text-wrap:balance}
.hero-sub{max-width:46ch;font-size:clamp(1rem,1.7vw,1.2rem);color:rgba(255,255,255,.94);margin:0 0 22px;text-shadow:0 1px 14px rgba(0,0,0,.4)}
.cta-row{display:flex;flex-wrap:wrap;gap:12px}
/* cards */
.cardgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:20px;margin-top:34px}
.card{background:var(--surf);border:1px solid var(--line);border-radius:calc(var(--rad)*1px);padding:26px}
.card .cn{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--brand);color:#fff;font-weight:700;margin-bottom:12px}
.card h3{font-size:1.16rem}.card p{color:var(--mut);margin:.4em 0 0}
/* services — editorial two-column list (business). Intro rail + hairline rows;
   a vertical list has no trailing gap to orphan, at any item count. */
.svc-grid{display:grid;grid-template-columns:.82fr 1.18fr;gap:clamp(30px,6vw,88px);align-items:start}
.svc-intro{position:sticky;top:clamp(24px,9vh,108px)}
.svc-intro h2{margin:14px 0 20px;max-width:14ch}
.svc-lead{font-family:'__DISPLAY__',Georgia,serif;font-weight:400;font-size:clamp(1.08rem,1rem + .5vw,1.42rem);
  line-height:1.44;color:color-mix(in srgb,var(--ink) 80%,var(--mut));max-width:34ch;margin:0 0 28px}
.svc-cta{display:inline-block;font-weight:600;font-size:1rem;color:var(--ink);text-decoration:none;
  border-bottom:2px solid var(--accent);padding-bottom:5px;transition:color .25s}
.svc-cta:hover{color:var(--brand)}
.svc-list{display:flex;flex-direction:column}
.svc-row{display:grid;grid-template-columns:auto 1fr;gap:clamp(18px,3vw,46px);padding:clamp(22px,3vw,38px) 0;
  border-top:1px solid var(--line);align-items:baseline;transition:padding-left .3s var(--ease,ease)}
.svc-row:last-of-type{border-bottom:1px solid var(--line)}
.svc-row:hover{padding-left:8px}
.svc-row .si{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9rem;font-weight:700;
  letter-spacing:.04em;color:var(--brand);font-variant-numeric:tabular-nums}
.svc-body h3{font-size:clamp(1.4rem,1rem + 1.25vw,2.05rem);line-height:1.06;margin:0 0 10px}
.svc-body p{color:color-mix(in srgb,var(--ink) 74%,var(--mut));font-size:1.08rem;line-height:1.56;max-width:50ch;margin:0}
.svc-more{margin:24px 0 0;color:var(--mut);font-size:.95rem}
@media(max-width:860px){.svc-grid{grid-template-columns:1fr;gap:26px}.svc-intro{position:static}}
/* events */
.evlist{margin-top:30px;display:flex;flex-direction:column;gap:2px}
.ev{display:flex;gap:22px;padding:20px 0;border-top:1px solid var(--line);align-items:baseline}
.ev-when{min-width:140px;font-weight:700;color:var(--brand)}
.ev-body h3{font-size:1.12rem}.ev-body p{color:var(--mut);margin:.3em 0 0}
/* business: book bar, reviews, offer */
.bookbar{background:color-mix(in srgb,var(--ink) 4%,var(--bg));padding:22px 0}
.bookbar-in{display:flex;justify-content:space-between;align-items:center;gap:24px;flex-wrap:wrap}
.bookbar b{font-family:'__DISPLAY__',serif;font-size:1.3rem;display:block}.bookbar span{color:var(--mut);font-size:.92rem}
.bookbtns{display:flex;gap:10px;flex-wrap:wrap}
/* the ghost button sits on the LIGHT book-bar ground here — white border/text
   (built for photo heroes) was invisible on every theme; flip it to ink */
.bookbar .btn.ghost{color:var(--brand-d);border-color:color-mix(in srgb,var(--brand) 35%,var(--line))}
.bookbar .btn.ghost:hover{background:color-mix(in srgb,var(--brand) 8%,var(--bg));color:var(--brand-d)}
.rating{display:flex;align-items:center;gap:8px;margin:14px 0 0;font-size:1.05rem}
.rating .stars{color:var(--accent);letter-spacing:2px}
.rvgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;margin-top:26px}
.rv{margin:0;background:var(--surf);border:1px solid var(--line);border-radius:calc(var(--rad)*1px);padding:22px;font-size:1.02rem;line-height:1.5;font-style:italic}
.rv cite{display:block;margin-top:12px;font-style:normal;font-weight:600;font-size:.9rem;color:var(--mut)}
/* Catholic: sacraments + devotions */
.sacrgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin:30px 0 26px}
.sacrcard{display:flex;align-items:center;gap:14px;background:var(--surf);border:1px solid var(--line);border-radius:calc(var(--rad)*1px);padding:18px 20px}
.sacrcard .sx{color:var(--accent);font-size:1.2rem}.sacrcard h3{font-size:1.05rem;margin:0}
.devos{display:flex;gap:30px;flex-wrap:wrap;margin-top:18px;padding-top:18px;border-top:1px solid var(--line)}
.devo{display:flex;flex-direction:column}.devo b{color:var(--brand)}.devo span{color:var(--mut);font-size:.92rem}
/* announcement bar */
.announce{background:var(--brand-d);color:#fff;text-align:center;font-size:.9rem;font-weight:500;padding:9px 16px;display:flex;gap:9px;align-items:center;justify-content:center}
.arch-journey .nav{position:relative;background:color-mix(in srgb,var(--ink) 92%,#000)}
.adot{width:8px;height:8px;border-radius:50%;background:var(--accent);flex:none;animation:pulse 2s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
/* next steps rail */
.steprail{display:flex;align-items:stretch;gap:14px;margin:30px 0;flex-wrap:wrap}
.step{flex:1;min-width:180px;background:var(--surf);border:1px solid var(--line);border-radius:calc(var(--rad)*1px);padding:22px}
.stepn{font-family:'__DISPLAY__',serif;font-size:1.6rem;color:var(--accent);font-weight:700}
.step h3{font-size:1.08rem;margin:.3em 0 .2em}.step p{color:var(--mut);font-size:.92rem;margin:0}
.steparrow{align-self:center;color:var(--mut);font-size:1.4rem}
/* groups chips */
.chips{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0 26px}
.chip{border:1px solid var(--line);border-radius:100px;padding:9px 18px;font-weight:600;font-size:.92rem;background:var(--surf);transition:.15s}
.chip:hover{border-color:var(--brand);color:var(--brand);transform:translateY(-2px)}
.band.alt{background:var(--ink)}
/* care + prayer form */
.care-in{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center}
.care-copy .lead{margin-top:.5em}
.care-form{display:flex;flex-direction:column;gap:12px}
.care-form input,.care-form textarea{font:inherit;padding:13px 15px;border:1px solid var(--line);border-radius:calc(var(--rad)*1px);background:var(--surf);color:var(--ink);resize:vertical}
.care-form input:focus,.care-form textarea:focus{outline:2px solid var(--brand);border-color:transparent}
.care-form .btn{align-self:flex-start}
.form-note{margin:0;font-size:.92rem;color:var(--brand);font-weight:600}
@media(max-width:760px){.care-in{grid-template-columns:1fr;gap:24px}.steparrow{display:none}}
/* watch / livestream */
.watch-in{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center}
.watch-frame{position:relative;aspect-ratio:16/9;border-radius:calc(var(--rad)*1px);overflow:hidden;
  background:linear-gradient(135deg,var(--brand),var(--brand-d));display:grid;place-items:center;box-shadow:0 20px 50px rgba(0,0,0,.18)}
.playbtn{width:74px;height:74px;border-radius:50%;background:rgba(255,255,255,.92);color:var(--brand);
  display:grid;place-items:center;font-size:1.5rem;padding-left:5px;transition:transform .2s}
.watch-frame:hover .playbtn{transform:scale(1.08)}
.watch-meta{position:absolute;left:16px;bottom:14px;color:#fff}.watch-meta b{display:block}.watch-meta span{font-size:.86rem;opacity:.85}
@media(max-width:760px){.watch-in{grid-template-columns:1fr;gap:22px}}
/* service times */
.times-in{display:flex;gap:40px;flex-wrap:wrap;align-items:center}
.times-h{min-width:200px}.times-h h2{font-size:1.8rem;margin-top:.1em}
.times-list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px 30px;flex:1}
.times-list li{display:flex;align-items:center;gap:12px;font-size:1.05rem;padding:10px 0;border-bottom:1px solid var(--line)}
.tdot{width:9px;height:9px;border-radius:50%;background:var(--accent);flex:none}
/* team */
.teamgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,210px));gap:24px;margin-top:32px;justify-content:center}
.tcard{text-align:center;max-width:210px}.tcard img,.tinitial{width:100%;aspect-ratio:1;object-fit:cover;border-radius:calc(var(--rad)*1px)}
.tinitial{display:grid;place-items:center;background:var(--brand);color:#fff;font-family:'__DISPLAY__',serif;font-size:2.4rem;font-weight:600}
.tcard h3{font-size:1.1rem;margin-top:14px}.trole{color:var(--mut);font-size:.92rem}
/* band */
.band{background:linear-gradient(120deg,color-mix(in srgb,var(--brand) 48%,#14161b),color-mix(in srgb,var(--brand) 22%,#0e1014));color:#fff}
.band-in{display:flex;gap:30px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.band h2{margin-top:.2em}
/* cta */
.cta{text-align:center}.cta h2{font-size:clamp(2rem,4vw,3rem)}.cta .lead{margin:.6em auto 24px}
.cta-photo{background-size:cover;background-position:center;color:#fff}
.cta-photo h2{text-shadow:0 2px 24px rgba(0,0,0,.4)}
/* trust band */
.trustband{background:var(--surf);border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:18px 0}
.trust-in{display:flex;flex-wrap:wrap;gap:12px 34px;justify-content:center}
.trustitem{font-weight:600;font-size:.92rem;display:flex;align-items:center;gap:8px}
.tcheck{color:var(--accent);font-weight:800}
/* feature split / about band / gallery grid / FAQ (narrative-arc sections) */
.feat-in,.about-in{display:grid;grid-template-columns:1fr 1fr;gap:clamp(28px,5vw,64px);align-items:center}
.feat-in.noimg,.about-in.noimg{grid-template-columns:1fr}
.feat-img img,.about-img img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:calc(var(--rad)*1px);box-shadow:0 24px 60px rgba(0,0,0,.14)}
.feat-points{list-style:none;margin:26px 0 0;padding:0;display:flex;flex-direction:column;gap:12px}
.feat-points li{display:flex;gap:12px;align-items:baseline;font-weight:600}
.aboutband{background:color-mix(in srgb,var(--brand) 5%,var(--bg))}
.about-stats{display:flex;gap:34px;margin-top:28px;flex-wrap:wrap}
.astat b{font-family:'__DISPLAY__',serif;font-size:1.9rem;color:var(--brand);display:block;line-height:1.1}
.astat span{color:var(--mut);font-size:.9rem}
.money-in{display:grid;grid-template-columns:1.15fr 1fr;gap:clamp(28px,5vw,60px);align-items:center}
.money-in.noimg{grid-template-columns:1fr}
.money-img img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:calc(var(--rad)*1px);box-shadow:0 24px 60px rgba(0,0,0,.14)}
.money-quote{margin:22px 0 0;padding:18px 22px;background:var(--surf);border-left:4px solid var(--accent);border-radius:0 calc(var(--rad)*1px) calc(var(--rad)*1px) 0;font-style:italic;font-size:1.04rem}
.money-quote cite{display:block;margin-top:10px;font-style:normal;font-weight:600;font-size:.88rem;color:var(--mut)}
@media(max-width:760px){.money-in{grid-template-columns:1fr}}
.bgal{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:30px}
.bgal-i{margin:0;overflow:hidden;border-radius:calc(var(--rad)*1px)}
.bgal-i.wide{grid-column:span 2}
.bgal-i img{width:100%;height:100%;min-height:220px;object-fit:cover;display:block;transition:transform .35s}
.bgal-i:hover img{transform:scale(1.04)}
.faqlist{margin-top:30px;max-width:820px}
.faq-i{border-top:1px solid var(--line);padding:4px 0}
.faq-i summary{cursor:pointer;font-weight:600;font-size:1.08rem;padding:16px 0;list-style:none;display:flex;justify-content:space-between;gap:16px}
.faq-i summary::-webkit-details-marker{display:none}
.faq-i summary::after{content:'+';color:var(--brand);font-weight:700;font-size:1.3rem}
.faq-i[open] summary::after{content:'–'}
.faq-i p{color:var(--mut);margin:0 0 18px;max-width:70ch}
@media(max-width:760px){.feat-in,.about-in{grid-template-columns:1fr}.bgal{grid-template-columns:1fr 1fr}}
/* no-photo hero: a designed brand poster, never a bare text block.
   (body prefix lifts specificity above the light-archetype hero grounds
   declared later — without it, editorial/split/minimal override the poster
   background while the white-h1 rules below still apply → white-on-white) */
body .hero.no-img{background:
  radial-gradient(90% 70% at 85% 10%,color-mix(in srgb,var(--accent) 22%,transparent),transparent 60%),
  radial-gradient(70% 90% at 5% 95%,color-mix(in srgb,var(--brand) 30%,transparent),transparent 65%),
  linear-gradient(135deg,color-mix(in srgb,var(--brand) 55%,#14161a),color-mix(in srgb,var(--brand-d) 45%,#0e1013));
  color:#fff;min-height:78vh;align-items:center}
.hero.no-img .scrim{display:none}
.hero.no-img h1,.arch-editorial .hero.no-img h1,.arch-split .hero.no-img h1,.arch-minimal .hero.no-img h1{color:#fff;text-shadow:none}
.hero.no-img .hero-sub,.arch-editorial .hero.no-img .hero-sub,.arch-split .hero.no-img .hero-sub,.arch-minimal .hero.no-img .hero-sub{color:rgba(255,255,255,.9)}
.hero.no-img .kick{color:rgba(255,255,255,.85)}
/* the brandmark must never fall back to UA link blue/underline */
.nav .brandmark{color:var(--ink);text-decoration:none}
.nav .wordmark{color:inherit}
/* interior pages */
.subpage .nav{position:relative;background:color-mix(in srgb,var(--ink) 92%,#000)}
.pagehero{background:linear-gradient(135deg,var(--brand),var(--brand-d));color:#fff;padding:clamp(48px,7vw,90px) 0 clamp(36px,5vw,64px)}
.pagehero h1{font-size:clamp(2rem,5vw,3.4rem);margin:.2em 0 0}
.pagehero-lead{color:rgba(255,255,255,.92);max-width:56ch;margin:.6em 0 0;font-size:1.06rem}
/* gallery strip */
.gstrip .wrap{margin-bottom:26px}
.gstrip-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;padding:0 clamp(10px,2vw,24px)}
.gstrip-row img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:calc(var(--rad)*1px);transition:transform .25s}
.gstrip-row img:hover{transform:scale(1.02)}
@media(max-width:720px){.gstrip-row{grid-template-columns:repeat(2,1fr)}}
/* footer */
.foot{background:var(--ink);color:#fff;padding:44px 0}
.foot-brand{font-family:'__DISPLAY__',serif;font-size:1.3rem;font-weight:600}
.foot-loc{color:rgba(255,255,255,.7);margin-top:6px}.foot-fine{color:rgba(255,255,255,.45);margin-top:18px;font-size:.85rem}
/* motion moods */
@keyframes drift{from{transform:scale(1.06)}to{transform:scale(1.16) translate(-2.4%,-2%)}}
@keyframes rays{0%{transform:translate(-4%,-3%) rotate(-1.1deg);opacity:.14}100%{transform:translate(4%,3%) rotate(1.1deg);opacity:.3}}
@keyframes flick{0%,100%{opacity:.18}30%{opacity:.28}60%{opacity:.2}85%{opacity:.3}}
.mood-drift .hero-bg,.mood-godrays .hero-bg,.mood-candle .hero-bg{animation:drift 26s ease-in-out infinite alternate}
.mood-godrays .glow{display:block;inset:-28%;filter:blur(9px);animation:rays 15s ease-in-out infinite alternate;
  background:radial-gradient(52% 46% at 70% 6%,color-mix(in srgb,var(--accent) 62%,transparent),transparent 72%),
  linear-gradient(101deg,transparent 20%,rgba(255,252,242,.11) 32%,transparent 46%),
  linear-gradient(101deg,transparent 50%,rgba(255,250,238,.07) 62%,transparent 78%)}
.mood-candle .glow{display:block;inset:0;animation:flick 9s ease-in-out infinite;
  background:radial-gradient(58% 60% at 50% 84%,color-mix(in srgb,var(--accent) 42%,#ffb066),transparent 66%)}
/* ARCHETYPE: editorial — a framed magazine cover. Headline ABOVE a boxed image on a light ground. */
.arch-editorial .nav{position:relative;background:var(--bg);color:var(--ink);border-bottom:1px solid var(--line)}
.arch-editorial .nav .logo{filter:none}.arch-editorial .navlinks a{color:var(--ink)}
.arch-editorial .hero{display:flex;flex-direction:column;min-height:auto;background:var(--bg);color:var(--ink);padding:clamp(28px,5vw,68px) clamp(20px,5vw,64px)}
.arch-editorial .hero-in{order:0;position:relative;z-index:1;max-width:1080px;margin:0 auto 26px;padding:0;width:100%}
.arch-editorial .hero .kick{color:var(--brand)}
.arch-editorial .hero h1{color:var(--ink);text-shadow:none;font-size:clamp(2.6rem,7vw,5rem);max-width:24ch}
.arch-editorial .hero-sub{color:var(--mut);text-shadow:none;max-width:52ch}
.arch-editorial .hero-bg{position:relative;inset:auto;z-index:0;order:1;width:100%;max-width:1080px;margin:0 auto;
  height:min(66vh,640px);border-radius:calc(var(--rad)*2.2px);transform:none;box-shadow:0 30px 70px rgba(0,0,0,.16)}
.arch-editorial .scrim,.arch-editorial .glow{display:none}
/* ARCHETYPE: modern — a deep brand-tinted poster. Oversized type; photo becomes a quiet texture.
   The gradient mixes brand into near-black so vivid captured brands stay rich, never neon. */
.arch-modern .hero{align-items:center;background:linear-gradient(135deg,color-mix(in srgb,var(--brand) 32%,#14161a),color-mix(in srgb,var(--brand-d) 24%,#0e1013));color:#fff}
.arch-modern .hero-bg{opacity:.32;mix-blend-mode:luminosity}
.arch-modern .scrim{background:linear-gradient(180deg,rgba(0,0,0,.25),transparent 40%,rgba(0,0,0,.35))}
.arch-modern .hero-in{max-width:960px}
.arch-modern .hero h1{font-size:clamp(3rem,9vw,6.5rem);letter-spacing:-.03em;line-height:.98}
.arch-modern .hero .kick{opacity:.9}
.arch-modern .btn{border-radius:100px}.arch-modern .btn.lg{padding:16px 32px}
.arch-modern .nav .btn{border-radius:100px}.arch-modern .card{border:none;box-shadow:0 10px 40px rgba(0,0,0,.06)}
/* ARCHETYPE: split — real image beside text on a light ground (no overlay) */
.arch-split .nav{position:relative;color:var(--ink);background:var(--bg);border-bottom:1px solid var(--line)}
.arch-split .nav .logo{filter:none}.arch-split .navlinks a{color:var(--ink)}
.arch-split .hero{min-height:86vh;display:grid;grid-template-columns:1.02fr .98fr;align-items:stretch;background:var(--bg);color:var(--ink)}
.arch-split .hero-bg{position:relative;inset:auto;z-index:0;order:2;transform:none;min-height:100%}
.arch-split .scrim,.arch-split .glow{display:none}
.arch-split .hero-in{align-self:center;padding:clamp(32px,5vw,86px);max-width:660px}
.arch-split .hero .kick{color:var(--brand)}
.arch-split .hero h1{color:var(--ink);text-shadow:none}
.arch-split .hero-sub{color:var(--mut);text-shadow:none}
/* ARCHETYPE: minimal — text-forward, generous whitespace, image as a calm band */
.arch-minimal .nav{position:relative;color:var(--ink);background:transparent}
.arch-minimal .nav .logo{filter:none}.arch-minimal .navlinks a{color:var(--ink);opacity:.7}
.arch-minimal .hero{min-height:78vh;align-items:center;text-align:center;background:var(--bg);color:var(--ink)}
.arch-minimal .hero-bg{opacity:.14;filter:grayscale(.3);transform:none}
.arch-minimal .scrim,.arch-minimal .glow{display:none}
.arch-minimal .hero-in{margin:0 auto;max-width:760px}
.arch-minimal .hero .kick{color:var(--brand)}
.arch-minimal .hero h1{color:var(--ink);text-shadow:none;font-weight:500;letter-spacing:-.02em}
.arch-minimal .hero-sub{color:var(--mut);margin-left:auto;margin-right:auto;text-shadow:none}
.arch-minimal .cta-row{justify-content:center}
.arch-minimal .sec{padding:clamp(64px,9vw,120px) 0}.arch-minimal .card{border:none;background:transparent;padding:0}
@media (prefers-reduced-motion:reduce){.hero-bg,.glow{animation:none!important}.hero-bg{transform:scale(1.08)}}
@media(max-width:820px){.arch-split .hero{grid-template-columns:1fr}.arch-split .hero-bg{min-height:42vh}}
@media(max-width:720px){.navlinks{display:none}.ev{flex-direction:column;gap:4px}.ev-when{min-width:0}}

/* ── PHASE 4 · craft polish ─────────────────────────────────────────────── */
/* rhythm: alternate section grounds so the page breathes.
   :not(.upgrade) — the demo upgrade band is a brand gradient with white text;
   this tint outranked its (later, lower-specificity) UPSELL_CSS rule whenever
   the band landed on an even index → white-on-light. Never tint it. */
.sec:nth-of-type(even):not(.band):not(.cta):not(.upgrade){background:color-mix(in srgb,var(--ink) 3%,var(--bg))}
.sec-k{margin-bottom:6px}.sec h2{font-size:clamp(1.7rem,3.2vw,2.5rem)}
/* micro-interactions */
.btn{transition:transform .18s var(--ease,ease),background .18s,box-shadow .18s;will-change:transform}
.btn:hover{transform:translateY(-2px);box-shadow:0 10px 26px rgba(var(--brand-rgb),.28)}
.btn.light:hover{box-shadow:0 10px 26px rgba(0,0,0,.18)}
.card{transition:transform .2s,box-shadow .2s,border-color .2s}
.card:hover{transform:translateY(-4px);box-shadow:0 16px 40px rgba(0,0,0,.09);border-color:transparent}
.navlinks a{position:relative;transition:opacity .15s}
.navlinks a::after{content:"";position:absolute;left:0;right:100%;bottom:-5px;height:2px;background:currentColor;opacity:.7;transition:right .22s var(--ease,ease)}
.navlinks a:hover::after{right:0}
.ev{transition:padding-left .2s}.ev:hover{padding-left:8px}
.tcard img,.tinitial{transition:transform .25s}.tcard:hover img,.tcard:hover .tinitial{transform:scale(1.03)}
a:focus-visible,.btn:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:4px}
/* nav turns solid on scroll (overlay-nav archetypes only) */
body:not(.arch-split):not(.arch-minimal) .nav{transition:background .3s,padding .3s,box-shadow .3s}
body:not(.arch-split):not(.arch-minimal) .nav.scrolled{background:color-mix(in srgb,var(--ink) 92%,#000);padding-top:12px;padding-bottom:12px;box-shadow:0 6px 24px rgba(0,0,0,.22)}
/* scroll reveal */
.reveal{opacity:0;transform:translateY(22px);transition:opacity .7s var(--ease,ease),transform .7s var(--ease,ease)}
.reveal.in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.reveal{opacity:1!important;transform:none!important}}
/* guest concierge */
.cx-bubble{position:fixed;right:22px;bottom:22px;z-index:50;width:58px;height:58px;border-radius:50%;border:none;
  background:var(--brand);color:#fff;font-size:1.5rem;cursor:pointer;box-shadow:0 10px 30px rgba(var(--brand-rgb),.4);transition:transform .2s}
.cx-bubble:hover{transform:scale(1.06)}
.cx-panel{position:fixed;right:22px;bottom:22px;z-index:51;width:min(360px,calc(100vw - 32px));height:min(520px,calc(100vh - 44px));
  background:var(--surf);border:1px solid var(--line);border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.28);display:flex;flex-direction:column;overflow:hidden}
.cx-panel[hidden]{display:none}
.cx-head{background:var(--brand);color:#fff;padding:16px 18px;position:relative}
.cx-head b{display:block;font-family:'__DISPLAY__',serif;font-size:1.1rem}.cx-head span{font-size:.8rem;opacity:.85}
.cx-x{position:absolute;top:12px;right:14px;background:none;border:none;color:#fff;font-size:1.4rem;cursor:pointer;line-height:1}
.cx-log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}
.cx-msg{max-width:85%;padding:10px 14px;border-radius:14px;font-size:.92rem;line-height:1.45}
.cx-msg.bot{background:color-mix(in srgb,var(--ink) 6%,var(--bg));align-self:flex-start;border-bottom-left-radius:4px}
.cx-msg.me{background:var(--brand);color:#fff;align-self:flex-end;border-bottom-right-radius:4px}
.cx-msg ul{margin:6px 0 0;padding-left:18px}.cx-cta{display:inline-block;margin-top:8px;font-weight:600;color:var(--brand);text-decoration:none}
.cx-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 10px}
.cx-chip{font:inherit;font-size:.8rem;padding:7px 11px;border:1px solid var(--line);border-radius:100px;background:var(--surf);color:var(--ink);cursor:pointer}
.cx-chip:hover{border-color:var(--brand);color:var(--brand)}
.cx-in{display:flex;gap:8px;padding:12px 14px;border-top:1px solid var(--line)}
.cx-in input{flex:1;font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink)}
.cx-in button{border:none;background:var(--brand);color:#fff;width:42px;border-radius:10px;font-size:1.1rem;cursor:pointer}
/* richer footer */
.foot{padding:56px 0 40px}.foot .wrap{display:flex;flex-wrap:wrap;gap:20px;align-items:baseline;justify-content:space-between}
.foot-fine{width:100%;border-top:1px solid rgba(255,255,255,.12);padding-top:16px;margin-top:8px}

/* ═══════════════════════════════════════════════════════════════════════════
   FLAGSHIP — the $15k look. Cinematic hero, editorial scale, layered depth.
   ═══════════════════════════════════════════════════════════════════════════ */
.arch-flagship{--ease:cubic-bezier(.2,.7,.2,1)}
.arch-flagship .nav{position:fixed;top:0;left:0;right:0;z-index:40;padding:18px clamp(20px,4vw,56px);transition:padding .3s var(--ease),background .3s,box-shadow .3s,backdrop-filter .3s}
.arch-flagship .nav .wrap,.arch-flagship .nav{display:flex;align-items:center;justify-content:space-between}
.arch-flagship .nav.solid{padding:11px clamp(20px,4vw,56px);background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:saturate(1.6) blur(14px);box-shadow:0 1px 0 var(--line),0 12px 30px -18px rgba(0,0,0,.4)}
/* transparent brandmark over the hero — no floating white pill */
.arch-flagship .nav .brandmark{background:transparent;box-shadow:none;padding:0}
.arch-flagship .nav .wordmark{font-family:'__DISPLAY__',Georgia,serif;font-weight:600;font-size:1.34rem;letter-spacing:-.02em;color:#fff}
.arch-flagship .nav .logo{max-height:40px}
.arch-flagship .navlinks a{font-size:.9rem;font-weight:500;opacity:.85;transition:opacity .2s}
.arch-flagship .navlinks a:hover{opacity:1}
.arch-flagship .nav:not(.solid) .navlinks a{color:#fff}
.arch-flagship .nav:not(.solid) .btn.sm{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.42);color:#fff;backdrop-filter:blur(6px)}
/* once scrolled onto the light glass bar, flip type back to ink */
.arch-flagship .nav.solid .wordmark{color:var(--ink)}
.arch-flagship .nav.solid .navlinks a{color:var(--ink)}

/* cinematic hero */
.fhero{position:relative;min-height:100svh;display:flex;align-items:flex-end;overflow:hidden;color:#fff;isolation:isolate;background:linear-gradient(150deg,color-mix(in srgb,var(--brand) 42%,#0a0d12),color-mix(in srgb,var(--brand) 16%,#0a0d12) 70%,#0a0d12)}
/* no photo? a premium layered brand gradient instead of flat gray */
.fhero:has(.fhero-media:empty)::after,.fhero .fhero-media:empty{background:radial-gradient(90% 70% at 78% 8%,color-mix(in srgb,var(--accent,#fff) 26%,transparent),transparent 55%),radial-gradient(70% 60% at 12% 96%,color-mix(in srgb,var(--brand) 60%,transparent),transparent 60%)}
.fhero .fhero-media:empty{position:absolute;inset:0;z-index:-1}
.fhero-media{position:absolute;inset:0;z-index:-2}
.fhero-media img,.fhero-media video{width:100%;height:100%;object-fit:cover;transform:scale(1.08);animation:fkenburns 18s var(--ease) forwards}
@keyframes fkenburns{to{transform:scale(1)}}
.fhero-veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,10,14,.16) 0%,rgba(8,10,14,.04) 35%,rgba(8,10,14,.38) 72%,rgba(8,10,14,.66) 100%)}
.fhero-in{position:relative;padding:0 clamp(20px,5vw,64px) clamp(64px,10vh,120px);max-width:1180px;margin:0 auto;width:100%}
.fkick{display:inline-flex;align-items:center;gap:9px;font-size:.76rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;padding:8px 15px;border:1px solid rgba(255,255,255,.28);border-radius:999px;backdrop-filter:blur(6px);opacity:0;animation:frise .8s var(--ease) .1s forwards}
.fkick-dot{width:7px;height:7px;border-radius:50%;background:var(--accent,#fff);box-shadow:0 0 0 0 var(--accent,#fff);animation:fpulse 2.6s ease-in-out infinite}
@keyframes fpulse{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--accent,#fff) 70%,transparent)}50%{box-shadow:0 0 0 7px transparent}}
.fhead{font-family:'__DISPLAY__',Georgia,serif;font-weight:600;letter-spacing:-.025em;line-height:.98;font-size:clamp(2.9rem,7vw,6.2rem);margin:20px 0 0;max-width:16ch;text-wrap:balance;text-shadow:0 2px 28px rgba(0,0,0,.45);}
.fhead .w{display:inline-block;opacity:0;transform:translateY(1.1em) rotate(2deg);animation:fword .9s var(--ease) forwards;animation-delay:calc(.25s + var(--i) * .075s)}
@keyframes fword{to{opacity:1;transform:none}}
.fsub{font-size:clamp(1.05rem,1.6vw,1.35rem);line-height:1.5;max-width:52ch;margin:22px 0 0;color:rgba(255,255,255,.86);opacity:0;animation:frise .8s var(--ease) .7s forwards}
.fcta{display:flex;flex-wrap:wrap;gap:12px;margin-top:32px;opacity:0;animation:frise .8s var(--ease) .85s forwards}
.fbtn{display:inline-flex;align-items:center;gap:8px;font-weight:600;font-size:1rem;padding:15px 28px;border-radius:999px;background:#fff;color:#111;text-decoration:none;transition:transform .2s var(--ease),box-shadow .2s,background .2s}
.fbtn:hover{transform:translateY(-3px);box-shadow:0 16px 40px -12px rgba(0,0,0,.5)}
.fbtn.ghost{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.4)}
.fbtn.ghost:hover{background:rgba(255,255,255,.12)}
.ftrust{list-style:none;display:flex;flex-wrap:wrap;gap:10px 26px;margin:34px 0 0;padding:0;opacity:0;animation:frise .8s var(--ease) 1s forwards}
.ftrust li{position:relative;font-size:.9rem;color:rgba(255,255,255,.8);padding-left:22px}
.ftrust li::before{content:"✓";position:absolute;left:0;color:var(--accent,#fff);font-weight:700}
.fscroll{position:absolute;left:50%;bottom:26px;translate:-50% 0;width:26px;height:42px;border:2px solid rgba(255,255,255,.45);border-radius:14px;z-index:2}
.fscroll span{position:absolute;left:50%;top:8px;translate:-50% 0;width:4px;height:8px;border-radius:2px;background:#fff;animation:fscrolldot 1.8s var(--ease) infinite}
@keyframes fscrolldot{0%{opacity:0;transform:translate(-50%,0)}30%{opacity:1}70%{opacity:1}100%{opacity:0;transform:translate(-50%,14px)}}
@keyframes frise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.fhead .w,.fkick,.fsub,.fcta,.ftrust{animation:none!important;opacity:1!important;transform:none!important}.fhero-media img,.fhero-media video{animation:none;transform:none}}

/* scrolling marquee band */
.fmarquee{overflow:hidden;background:linear-gradient(100deg,color-mix(in srgb,var(--brand) 32%,#14161b),color-mix(in srgb,var(--brand) 14%,#0e1014));color:#fff;padding:20px 0;white-space:nowrap;user-select:none}
.fmarquee-t{display:inline-block;animation:fmarq 32s linear infinite;font-family:'__DISPLAY__',Georgia,serif;font-weight:600;font-size:1.5rem;letter-spacing:-.01em}
.fmarquee-t span{padding:0 26px;opacity:.96}.fmarquee-t .mstar{opacity:.5}
@keyframes fmarq{to{transform:translateX(-50%)}}
@media(prefers-reduced-motion:reduce){.fmarquee-t{animation:none}}

/* elevated section rhythm */
.arch-flagship .sec{padding:clamp(64px,9vw,120px) 0}
.arch-flagship .sec-k{display:inline-block;font-size:.74rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--brand);margin-bottom:14px}
.arch-flagship .sec h2{font-family:'__DISPLAY__',Georgia,serif;font-weight:600;letter-spacing:-.02em;line-height:1.05;font-size:clamp(2rem,4vw,3.2rem);max-width:20ch;text-wrap:balance}
.arch-flagship .cardgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;margin-top:44px}
.arch-flagship .card{position:relative;background:var(--surf);border:1px solid var(--line);border-radius:20px;padding:30px 26px;overflow:hidden;transition:transform .3s var(--ease),box-shadow .3s,border-color .3s}
.arch-flagship .card::before{content:"";position:absolute;inset:0 0 auto 0;height:3px;background:linear-gradient(90deg,var(--brand),transparent);transform:scaleX(0);transform-origin:left;transition:transform .4s var(--ease)}
.arch-flagship .card:hover{transform:translateY(-6px);box-shadow:0 30px 60px -30px rgba(0,0,0,.28);border-color:color-mix(in srgb,var(--brand) 40%,var(--line))}
.arch-flagship .card:hover::before{transform:scaleX(1)}
.arch-flagship .card h3{font-family:'__DISPLAY__',Georgia,serif;font-weight:600;font-size:1.22rem;margin:0 0 6px}
.arch-flagship .card p{color:var(--mut);line-height:1.55}
/* stagger the reveals within a grid */
.arch-flagship .cardgrid .reveal{transition-delay:calc(var(--n,0) * .08s)}
/* reviews as pull-quotes */
.arch-flagship .reviews{background:color-mix(in srgb,var(--brand) 6%,var(--bg))}
.arch-flagship .rvgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:22px;margin-top:40px}
.arch-flagship .rv{background:var(--bg);border:1px solid var(--line);border-radius:20px;padding:30px;font-size:1.12rem;line-height:1.6;font-family:'__DISPLAY__',Georgia,serif;font-weight:500}
.arch-flagship .rv cite{display:block;margin-top:16px;font-family:var(--body);font-style:normal;font-size:.88rem;color:var(--mut);font-weight:600}
/* offer band = full-bleed brand gradient */
.arch-flagship .band{background:linear-gradient(120deg,color-mix(in srgb,var(--brand) 42%,#12151b),color-mix(in srgb,var(--brand) 16%,#0b0d11));color:#fff;border-radius:28px;margin:0 clamp(16px,4vw,40px)}
.arch-flagship .band .sec-k,.arch-flagship .band h2{color:#fff}
.arch-flagship .band .btn,.arch-flagship .band .fbtn{background:#fff;color:var(--brand)}

/* ═══════════════════════════════════════════════════════════════════════════
   STATEMENT — high-energy split-price offer hero (ported from the old bold
   template; its plum/vermilion palette maps onto var(--brand)/var(--accent)).
   ═══════════════════════════════════════════════════════════════════════════ */
.sthero{position:relative;background:linear-gradient(160deg,color-mix(in srgb,var(--brand) 36%,#131118),color-mix(in srgb,var(--brand-d) 26%,#0d0c11));color:#fff;
  padding:clamp(7.5rem,15vh,10rem) 0 clamp(3.5rem,6vw,5.5rem);overflow:hidden;isolation:isolate}
.sthero::before{content:"";position:absolute;z-index:-2;width:70vw;height:70vw;max-width:900px;max-height:900px;top:-24%;right:-14%;border-radius:50%;
  background:radial-gradient(circle at center,color-mix(in srgb,var(--accent) 48%,transparent),transparent 62%);filter:blur(6px);pointer-events:none}
.sthero::after{content:"";position:absolute;z-index:-2;width:60vw;height:60vw;max-width:760px;max-height:760px;bottom:-30%;left:-18%;border-radius:50%;
  background:radial-gradient(circle at center,color-mix(in srgb,var(--brand) 55%,transparent),transparent 60%);pointer-events:none}
.st-media{position:absolute;inset:0;z-index:-3;background-size:cover;background-position:center;opacity:.2;mix-blend-mode:luminosity}
/* the giant price numerals — a graphic watermark, real offers only */
.st-big{position:absolute;z-index:-1;right:-2%;top:-6%;font-family:'__DISPLAY__',Georgia,serif;font-weight:800;font-size:min(38vw,30rem);line-height:.7;
  color:rgba(255,255,255,.08);letter-spacing:-.05em;pointer-events:none;user-select:none;font-variant-numeric:tabular-nums}
.st-grid{display:grid;grid-template-columns:1.25fr .75fr;gap:clamp(2rem,5vw,4rem);align-items:center}
.st-grid.solo{grid-template-columns:1fr;max-width:920px}
.sthero .kick{font-size:.78rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.85)}
.st-head{font-size:clamp(2.6rem,7.5vw,5.2rem);line-height:.98;letter-spacing:-.03em;font-weight:700;margin:.28em 0 .22em;text-wrap:balance;max-width:16ch}
.st-sub{max-width:48ch;font-size:clamp(1rem,1.7vw,1.2rem);color:rgba(255,255,255,.88);margin:0 0 26px}
/* chunky white primary CTA so it never blends into the brand-tinted ground */
.sthero .cta-row .btn:not(.ghost){background:#fff;color:var(--brand-d)}
.sthero .cta-row .btn:not(.ghost):hover{background:#fff;box-shadow:0 14px 34px -10px rgba(0,0,0,.5)}
.st-card{background:var(--surf);color:var(--ink);border-radius:calc(var(--rad)*1.4px);padding:26px 24px;max-width:360px;margin-left:auto;
  box-shadow:0 40px 80px -30px rgba(0,0,0,.6)}
.st-tag{font-size:.72rem;letter-spacing:.2em;text-transform:uppercase;color:var(--brand);font-weight:700;margin:0}
.st-price{font-family:'__DISPLAY__',Georgia,serif;font-weight:800;font-size:clamp(3.2rem,7vw,4.6rem);line-height:.9;letter-spacing:-.04em;margin:.22em 0 .12em;font-variant-numeric:tabular-nums}
.st-price sup{font-size:.42em;vertical-align:.7em;color:var(--accent);font-weight:700}
.st-desc{color:var(--mut);font-size:.95rem;line-height:1.5;margin:.4em 0 0}.st-desc b{color:var(--ink);font-weight:600}
.st-card .btn{display:block;text-align:center;margin-top:16px}
@media(max-width:860px){.st-grid{grid-template-columns:1fr;gap:2.2rem}.st-card{margin-left:0;max-width:none}.st-big{font-size:52vw;top:1.5%;right:-8%}}
/* chunky type + strong brand blocks across statement sections */
.arch-statement .sec h2{font-weight:700;letter-spacing:-.025em;font-size:clamp(1.9rem,3.8vw,2.9rem)}
.arch-statement .band{background:linear-gradient(120deg,var(--brand),var(--brand-d))}
.arch-statement .fmarquee{background:linear-gradient(100deg,var(--brand),var(--brand-d));padding:22px 0}
.arch-statement .fmarquee-t{font-size:1.65rem;font-weight:700;letter-spacing:-.02em}
.arch-statement .card .cn{border-radius:12px}

/* ═══════════════════════════════════════════════════════════════════════════
   HEARTH — warm, homey, gathered (ported from the old hearth church template).
   Cream ground, pill buttons + chips, tilted squircle number tiles, an organic
   curved hero edge, warm radial "glow blobs" on the dark bands, paper grain.
   All colour derives from engine props (brand/accent/bg mixed with neutrals) —
   the old template's terracotta/cream/forest arrive via theme or captured
   palette, never hardcoded here.
   ═══════════════════════════════════════════════════════════════════════════ */
.arch-hearth{--ease:cubic-bezier(.34,1.4,.44,1);background:color-mix(in srgb,var(--accent) 7%,var(--bg))}
/* warm paper grain (pointer-transparent, sits under the concierge) */
.arch-hearth::after{content:"";position:fixed;inset:0;z-index:45;pointer-events:none;opacity:.04;mix-blend-mode:multiply;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
/* pill everything */
.arch-hearth .btn{border-radius:100px;box-shadow:0 12px 30px -8px rgba(var(--brand-rgb),.45)}
.arch-hearth .btn.lg{padding:16px 30px}
.arch-hearth .btn:hover{transform:translateY(-3px) scale(1.02);box-shadow:0 20px 40px -8px rgba(var(--brand-rgb),.5)}
.arch-hearth .btn.ghost{border:2px solid rgba(255,255,255,.55);box-shadow:none}
.arch-hearth .btn.ghost:hover{border-color:#fff;background:rgba(255,255,255,.12)}
/* ghost on light grounds (watch section) flips to a warm outline */
.arch-hearth .watch .btn.ghost{color:var(--brand-d);border-color:color-mix(in srgb,var(--accent) 45%,var(--line))}
.arch-hearth .watch .btn.ghost:hover{border-color:var(--brand);background:transparent;color:var(--brand)}
/* nav: transparent brandmark over the photo, white pill CTA */
.arch-hearth .nav .brandmark{background:transparent;box-shadow:none;padding:0;color:#fff}
.arch-hearth .navlinks a{text-transform:none;font-size:.92rem;font-weight:500}
.arch-hearth .nav .btn.sm{background:#fff;color:var(--brand-d);box-shadow:none}
.arch-hearth .nav .btn.sm:hover{background:#fff;color:var(--brand-d)}
.arch-hearth .announce{background:color-mix(in srgb,var(--brand) 55%,#160f0a)}
/* hero: warm gathered gradient + pill eyebrow + big friendly type */
.arch-hearth .scrim{background:
  radial-gradient(110% 80% at 12% 108%,color-mix(in srgb,var(--brand) 62%,transparent),transparent 58%),
  radial-gradient(90% 70% at 92% -10%,color-mix(in srgb,var(--accent) 34%,transparent),transparent 55%),
  linear-gradient(178deg,rgba(24,16,10,.42) 0%,rgba(24,16,10,.08) 34%,rgba(24,16,10,.28) 66%,rgba(20,13,8,.84) 100%)}
.arch-hearth .hero-in{padding-bottom:clamp(96px,12vw,150px)}
.arch-hearth .hero .kick{display:inline-flex;align-items:center;gap:10px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);
  backdrop-filter:blur(6px);padding:9px 18px;border-radius:100px;letter-spacing:.02em;text-transform:none;font-size:.85rem}
.arch-hearth .hero .kick::before{content:"";width:9px;height:9px;border-radius:50%;background:var(--accent)}
.arch-hearth .hero h1{font-weight:700;letter-spacing:-.035em;line-height:.97;font-size:clamp(2.7rem,7.5vw,5.6rem);text-shadow:0 6px 50px rgba(0,0,0,.35)}
/* organic curved edge from photo into the cream ground */
.arch-hearth .hero::after{content:"";position:absolute;left:-8%;right:-8%;bottom:-2px;height:clamp(26px,6vw,70px);z-index:2;pointer-events:none;
  background:color-mix(in srgb,var(--accent) 7%,var(--bg));border-radius:50% 50% 0 0/100% 100% 0 0}
/* kicker with a little warm rule; heavier friendlier headings */
.arch-hearth .sec-k{display:inline-flex;align-items:center;gap:9px;text-transform:none;letter-spacing:.03em;font-size:.85rem;color:var(--brand-d)}
.arch-hearth .sec-k::before{content:"";width:24px;height:2px;border-radius:2px;background:var(--brand)}
.arch-hearth .sec-k.light{color:rgba(255,255,255,.92)}.arch-hearth .sec-k.light::before{background:var(--accent)}
.arch-hearth .sec h2{font-weight:700;letter-spacing:-.025em;font-size:clamp(2rem,4.6vw,3.4rem)}
/* alternate ground = lighter warm paper, not grey (.times excluded — it is
   hearth's dark closing band and must never pick up the light tint) */
.arch-hearth .sec:nth-of-type(even):not(.band):not(.cta):not(.upgrade):not(.times){background:color-mix(in srgb,#fff 55%,color-mix(in srgb,var(--accent) 8%,var(--bg)))}
/* rounded homey cards + tilted squircle number tiles */
.arch-hearth .card,.arch-hearth .step{border-radius:24px;padding:30px 26px;border:1px solid color-mix(in srgb,var(--accent) 24%,var(--line));background:var(--surf)}
.arch-hearth .card:hover,.arch-hearth .step:hover{transform:translateY(-6px);box-shadow:0 26px 46px -24px rgba(var(--brand-rgb),.5);border-color:color-mix(in srgb,var(--accent) 40%,var(--line))}
.arch-hearth .step{transition:transform .3s var(--ease),box-shadow .3s}
.arch-hearth .card .cn{width:52px;height:52px;border-radius:16px;background:color-mix(in srgb,var(--accent) 20%,var(--surf));color:var(--brand-d);transform:rotate(-4deg);margin-bottom:16px}
.arch-hearth .step .stepn{display:grid;place-items:center;width:52px;height:52px;border-radius:16px;background:color-mix(in srgb,var(--accent) 20%,var(--surf));
  color:var(--brand-d);font-family:inherit;font-size:1.1rem;font-weight:700;transform:rotate(-4deg);margin-bottom:14px}
.arch-hearth .steparrow{color:var(--accent);font-weight:700}
/* chips as warm outlined pills */
.arch-hearth .chip{border:2px solid color-mix(in srgb,var(--accent) 40%,var(--line));padding:10px 20px}
.arch-hearth .chip:hover{border-color:var(--brand);color:var(--brand-d);transform:translateY(-2px)}
/* bands (serve/giving) = rounded inset warm-dark blocks with glow blobs */
.arch-hearth .band{position:relative;overflow:hidden;border-radius:28px;margin:clamp(10px,2vw,22px) clamp(14px,3vw,36px);
  background:linear-gradient(135deg,color-mix(in srgb,var(--brand) 88%,#100b07),color-mix(in srgb,var(--brand) 66%,#100b07))}
.arch-hearth .band::before{content:"";position:absolute;width:520px;height:520px;border-radius:50%;top:-200px;right:-140px;
  background:radial-gradient(circle,color-mix(in srgb,var(--accent) 30%,transparent),transparent 68%)}
.arch-hearth .band::after{content:"";position:absolute;width:440px;height:440px;border-radius:50%;bottom:-190px;left:-120px;
  background:radial-gradient(circle,color-mix(in srgb,var(--accent) 22%,transparent),transparent 70%)}
.arch-hearth .band-in{position:relative;z-index:1}
.arch-hearth .band.alt{background:linear-gradient(135deg,color-mix(in srgb,var(--brand) 52%,#12100c),color-mix(in srgb,var(--brand) 32%,#0d0b08))}
.arch-hearth .band .btn.light{background:var(--surf);color:var(--brand-d)}
/* times = the warm dark closing band. Selector stacked to (0,5,1) so it beats
   the base even-section tint (0,5,0) at ANY section parity — never rely on the
   band landing at an odd index. */
body.arch-hearth .sec.times.times.times{position:relative;overflow:hidden;color:#fff;
  background:linear-gradient(160deg,color-mix(in srgb,var(--brand) 42%,#14100b),color-mix(in srgb,var(--brand) 24%,#0e0b08))}
.arch-hearth .times::before{content:"";position:absolute;width:560px;height:560px;border-radius:50%;top:-200px;right:-120px;
  background:radial-gradient(circle,color-mix(in srgb,var(--accent) 26%,transparent),transparent 68%)}
.arch-hearth .times .wrap{position:relative;z-index:1}
.arch-hearth .times .sec-k{color:rgba(255,255,255,.9)}.arch-hearth .times .sec-k::before{background:var(--accent)}
.arch-hearth .times .times-list li{border-bottom:1px solid rgba(255,255,255,.16)}
.arch-hearth .times .lead{color:rgba(255,255,255,.85)}
/* events: brand date pills + soft hover slide */
.arch-hearth .ev{border-top:2px solid color-mix(in srgb,var(--accent) 22%,var(--line));border-radius:16px;align-items:center;
  transition:padding-left .3s var(--ease),background .25s}
.arch-hearth .ev:hover{padding-left:20px;background:var(--surf)}
.arch-hearth .ev-when{background:var(--brand);color:#fff;border-radius:14px;padding:10px 16px;min-width:110px;text-align:center;font-size:.95rem;line-height:1.25}
/* care form: rounded warm fields */
.arch-hearth .care-form input,.arch-hearth .care-form textarea{border:2px solid color-mix(in srgb,var(--accent) 35%,var(--line));background:var(--surf)}
.arch-hearth .care-form input{border-radius:100px}
.arch-hearth .care-form textarea{border-radius:22px}
.arch-hearth .care-form input:focus,.arch-hearth .care-form textarea:focus{outline:none;border-color:var(--brand)}
/* watch frame like a framed family photo */
.arch-hearth .watch-frame{border-radius:28px;border:4px solid var(--surf);outline:1px solid color-mix(in srgb,var(--accent) 30%,var(--line));
  box-shadow:0 34px 60px -28px rgba(var(--brand-rgb),.6)}
/* closing CTA: big friendly type over a soft accent glow */
.arch-hearth .cta{position:relative;overflow:hidden}
.arch-hearth .cta::before{content:"";position:absolute;width:640px;height:640px;border-radius:50%;top:50%;left:50%;transform:translate(-50%,-50%);
  background:radial-gradient(circle,color-mix(in srgb,var(--accent) 16%,transparent),transparent 70%);pointer-events:none}
.arch-hearth .cta .wrap{position:relative}
.arch-hearth .cta h2{font-size:clamp(2.4rem,6vw,4.4rem);font-weight:700;letter-spacing:-.03em}
/* warm-dark footer */
.arch-hearth .foot{background:color-mix(in srgb,var(--brand) 32%,#120d09)}
@media(prefers-reduced-motion:reduce){.arch-hearth .btn:hover,.arch-hearth .card:hover,.arch-hearth .step:hover,.arch-hearth .ev:hover{transform:none}}

/* ── ABOUT: editorial split ───────────────────────────────────────────────── */
.about-in{display:grid;grid-template-columns:1.05fr .95fr;gap:clamp(32px,5vw,72px);align-items:center}
@media(max-width:820px){.about-in{grid-template-columns:1fr;gap:28px}}

/* ── ABOUT SPLIT variant: serif narrative beside a framed portrait photo
     (ported from the old editorial template's about band) ──────────────────── */
.abs-in{display:grid;grid-template-columns:1.05fr .95fr;gap:clamp(32px,5vw,72px);align-items:center}
.abs-body{font-size:1.08rem;line-height:1.75;color:color-mix(in srgb,var(--ink) 82%,var(--mut));max-width:58ch;margin:1.1em 0 1.4em}
.abs-loc{color:var(--brand);font-weight:600;font-size:.92rem;letter-spacing:.04em;margin:0 0 22px}
.abs-media{position:relative;margin:0;border-radius:calc(var(--rad)*2px);overflow:hidden;aspect-ratio:4/5;max-height:560px;box-shadow:0 30px 70px -30px rgba(0,0,0,.35)}
.abs-media img{width:100%;height:100%;object-fit:cover;transition:transform .6s var(--ease,ease)}
.abs-media:hover img{transform:scale(1.04)}
.abs-media::after{content:"";position:absolute;inset:0;box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);border-radius:inherit;pointer-events:none}
.abs-panel{display:grid;place-items:center;background:linear-gradient(145deg,color-mix(in srgb,var(--brand) 55%,#171a20),color-mix(in srgb,var(--brand) 25%,#0e1014))}
.abs-mark{font-family:'__DISPLAY__',Georgia,serif;font-size:clamp(4rem,9vw,7rem);font-weight:600;color:rgba(255,255,255,.9);letter-spacing:.04em}
@media(max-width:820px){.abs-in{grid-template-columns:1fr;gap:28px}.abs-media{aspect-ratio:16/10;max-height:340px}}

/* ── FAQ COLUMNS variant: editorial two-column, sticky heading rail ────────── */
.faqcols-in{display:grid;grid-template-columns:.85fr 1.15fr;gap:clamp(28px,5vw,64px);align-items:start}
.faqcols-h{position:sticky;top:96px}
.faqcols-h .lead a{color:var(--brand);font-weight:600;text-decoration:none}
.qa{border-bottom:1px solid var(--line)}
.qa summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:18px;
  padding:20px 2px;font-weight:600;font-size:1.06rem;font-family:'__DISPLAY__',Georgia,serif}
.qa summary::-webkit-details-marker{display:none}
.qplus{flex:none;position:relative;width:22px;height:22px}
.qplus::before,.qplus::after{content:"";position:absolute;background:var(--brand);inset:10px 2px;transition:transform .25s var(--ease,ease)}
.qplus::after{transform:rotate(90deg)}
.qa[open] .qplus::after{transform:rotate(0)}
.qa p{margin:0 0 22px;color:var(--mut);line-height:1.65;max-width:60ch}
.qa summary:hover{color:var(--brand)}
@media(max-width:820px){.faqcols-in{grid-template-columns:1fr}.faqcols-h{position:static}}

/* ── SERVICES rail: per-archetype personality ─────────────────────────────────
   Each archetype's below-fold inherits its hero character through the numeral
   and the row rule — modest, non-breaking, no layout change. */
.arch-flagship .svc-row{border-top-color:transparent;background-image:linear-gradient(90deg,color-mix(in srgb,var(--brand) 55%,transparent),transparent 70%);
  background-repeat:no-repeat;background-size:100% 1px;background-position:0 0}
.arch-flagship .svc-row:last-of-type{border-bottom-color:var(--line)}
.arch-flagship .svc-row .si{color:var(--accent);font-size:.82rem;letter-spacing:.14em}
.arch-flagship .svc-body h3{letter-spacing:-.02em}
.arch-statement .svc-row .si{font-family:'__DISPLAY__',Georgia,serif;font-size:1.35rem;font-weight:800;letter-spacing:-.03em;color:var(--brand)}
.arch-statement .svc-body h3{font-weight:700;letter-spacing:-.025em}
.arch-hearth .svc-row .si{display:grid;place-items:center;width:46px;height:46px;border-radius:14px;
  background:color-mix(in srgb,var(--accent) 20%,var(--surf));color:var(--brand-d);font-family:inherit;font-size:.95rem;transform:rotate(-4deg)}
.arch-hearth .svc-row{border-top:2px solid color-mix(in srgb,var(--accent) 22%,var(--line));align-items:center}
.arch-hearth .svc-row:last-of-type{border-bottom:2px solid color-mix(in srgb,var(--accent) 22%,var(--line))}
.arch-editorial .svc-row .si{color:var(--mut)}
.arch-editorial .svc-body h3{font-style:italic}
.arch-minimal .svc-row .si{color:var(--mut);font-weight:500}
.arch-minimal .svc-row{border-top-color:color-mix(in srgb,var(--ink) 8%,transparent)}
.arch-split .svc-row .si{color:var(--brand-d)}

/* ── WHY-US: check pillars ────────────────────────────────────────────────── */
.whygrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:22px;margin-top:38px}
.why{display:flex;gap:16px;align-items:flex-start;padding:24px;border-radius:calc(var(--rad)*1.4px);background:var(--surf);border:1px solid var(--line);transition:transform .25s var(--ease,ease),box-shadow .25s}
.why:hover{transform:translateY(-4px);box-shadow:0 20px 44px -24px rgba(0,0,0,.25)}
.whycheck{flex:none;display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:color-mix(in srgb,var(--brand) 12%,var(--bg));color:var(--brand);font-weight:800}
.why h3{font-size:1.06rem;margin:0 0 4px}.why p{color:var(--mut);font-size:.94rem;line-height:1.55;margin:0}

/* ── FAQ list (shared by the accordion renderer) ──────────────────────────── */
.faqlist{display:flex;flex-direction:column}

/* ── mobile nav: hamburger + dropdown panel (≤720px only) ─────────────────── */
.navburger{display:none;flex-direction:column;justify-content:center;gap:5px;width:42px;height:42px;padding:10px;margin-left:auto;background:transparent;border:0;color:inherit;cursor:pointer;border-radius:calc(var(--rad)*.6px)}
.navburger span{display:block;height:2px;border-radius:2px;background:currentColor;transition:transform .22s var(--ease,ease),opacity .18s}
.navburger[aria-expanded="true"] span:nth-child(1){transform:translateY(7px) rotate(45deg)}
.navburger[aria-expanded="true"] span:nth-child(2){opacity:0}
.navburger[aria-expanded="true"] span:nth-child(3){transform:translateY(-7px) rotate(-45deg)}
.navlinks-m{display:none}
@media(max-width:720px){
.navburger{display:flex}
.navlinks.navlinks-m.open{display:flex;position:absolute;top:calc(100% + 6px);left:14px;right:14px;z-index:60;flex-direction:column;align-items:stretch;gap:0;margin:0;padding:8px;background:var(--bg);border:1px solid var(--line);border-radius:calc(var(--rad)*1px);box-shadow:0 18px 44px rgba(0,0,0,.2)}
/* dropdown sits on the light --bg ground on every theme — links must be ink
   (!important outranks per-archetype .navlinks colour overrides, e.g. flagship's white) */
.nav .navlinks-m a{color:var(--ink)!important;opacity:1!important;padding:12px 14px;border-radius:calc(var(--rad)*.6px);text-align:left}
.nav .navlinks-m a::after{display:none}
.nav .navlinks-m a:hover{background:color-mix(in srgb,var(--brand) 8%,var(--bg));color:var(--brand)!important}
}
`; }

// injected at end of <body> — nav-solid-on-scroll + scroll-reveal (a11y-safe)
const RUNTIME = `<script>
(function(){var n=document.querySelector('.nav');
 if(n)addEventListener('scroll',function(){n.classList.toggle('scrolled',scrollY>40)},{passive:true});
 // mobile nav: hamburger toggles the dropdown; closes on link click + Escape
 var mb=document.querySelector('.navburger'),mm=document.getElementById('navmenu');
 if(mb&&mm){
   var setNav=function(open){mb.setAttribute('aria-expanded',open?'true':'false');mm.classList.toggle('open',open)};
   mb.addEventListener('click',function(){setNav(mb.getAttribute('aria-expanded')!=='true')});
   mm.addEventListener('click',function(e){if(e.target.closest('a'))setNav(false)});
   addEventListener('keydown',function(e){if(e.key==='Escape'&&mb.getAttribute('aria-expanded')==='true'){setNav(false);mb.focus()}});
 }
 var els=document.querySelectorAll('.sec');
 if(!matchMedia('(prefers-reduced-motion:reduce)').matches&&'IntersectionObserver'in window){
   els.forEach(function(e){e.classList.add('reveal')});
   var io=new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target)}})},{threshold:.12});
   els.forEach(function(e){io.observe(e)});
 }
 // live form submit → /api/contact (lead capture during the sales window)
 document.querySelectorAll('form.care-form').forEach(function(f){
   f.addEventListener('submit',function(ev){
     ev.preventDefault();
     var btn=f.querySelector('button[type=submit]'), note=f.querySelector('.form-note');
     var body={cname:f.cname.value.trim(),cemail:f.cemail.value.trim(),cmsg:f.cmsg.value.trim(),source:f.dataset.source||'demo'};
     if(!body.cname||!body.cemail||!body.cmsg)return;
     btn.disabled=true;var old=btn.textContent;btn.textContent='Sending…';
     fetch('/api/contact',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
       .then(function(r){if(!r.ok)throw 0;return r.json();})
       .then(function(){note.hidden=false;note.textContent='✓ Sent — a real person will get back to you soon.';f.reset();btn.textContent=old;btn.disabled=false;})
       .catch(function(){note.hidden=false;note.textContent='Something went wrong — please call or email us directly.';btn.textContent=old;btn.disabled=false;});
   });
 });})();
</script>`;

// ── auto-recommend a recipe from the captured brand ──────────────────────────
// Hue logic is the POOL CHOOSER; the profile seed spreads within the pool
// (primary ×2 + 2 mood-adjacent alternates ×1 — the recommendBusinessDesign
// pattern), so same-hue neighbours no longer collide on one archetype+theme.
// Alternates respect the hard-won constraints below: captured palettes never
// get arch-modern's brand poster, greens never flood a hero.
export function recommendRecipe(profile){
  const p = profile.palette;
  const b = rgb(p.brand); const s = sat(b), l = lum(b);
  const isBlueNavy = b[2] > b[0] && b[2] > b[1] && l < .3;
  const isWarm = b[0] >= b[2] && s > .3;             // red/orange/gold lead
  const isGreen = b[1] >= b[0] && b[1] >= b[2] && s > .25;
  let themePool, archPool;
  // luxe rides only in the muted/neutral-hue theme pools below (navy + low-sat):
  // its whole signature is tone restraint — dropping a didone champagne theme
  // on a hot vivid brand reads costume, not luxury.
  // hearth rides only in the warm/neutral CHURCH-side archetype pools: business
  // renders always overwrite recipe.archetype via variety.chooseArchetype
  // (pipeline isBiz path), so archPool additions here reach church/tradition
  // profiles only.
  if (isBlueNavy)      { themePool=['heritage','heritage','quiet','sanctuary','luxe']; archPool=['editorial','editorial','minimal','split']; }
  // greens get the editorial frame, never the brand-poster: a green-flooded
  // hero reads like a monochrome wash (murky, unattractive) — as an accent on
  // a light editorial ground the same green reads fresh and professional.
  else if (isGreen)    { themePool=['evergreen','evergreen','quiet','sanctuary'];    archPool=['editorial','editorial','minimal','split']; }
  // arch-modern's brand-tinted poster is reserved for DESIGNED palettes
  // (variants' --theme-palette). Captured brand colors flooding a photo reads
  // as a monochrome wash — the art critic flags it every time. Vivid captured
  // brands get split (warm) or editorial (cool) leads instead.
  // statement (the high-energy split-price look) lives in the warm/vivid pools
  // only — its brand-saturated hero and marquee fit hot brands, never the
  // muted/professional (navy, green, low-sat) pools.
  else if (s > .6)     { themePool = isWarm ? ['community','community','evergreen','sanctuary'] : ['heritage','heritage','quiet','sanctuary'];
                         archPool  = isWarm ? ['split','split','statement','editorial','hearth'] : ['editorial','editorial','split','minimal']; }
  else if (isWarm)     { themePool=['community','community','evergreen','heritage']; archPool=['split','split','statement','editorial','hearth']; }
  else if (s < .2)     { themePool=['quiet','quiet','evergreen','heritage','luxe'];  archPool=['minimal','minimal','editorial','split']; }  // muted → quiet/minimal lead
  else                 { themePool=['sanctuary','sanctuary','evergreen','heritage']; archPool=['cathedral','cathedral','editorial','split','hearth']; }
  const seed = seedOf(profile);
  const archetype = archPool[pick(seed, 5, archPool.length)];
  const theme = themePool[pick(seed, 7, themePool.length)];
  // auto recipes get subtle Ken-Burns drift ONLY. The godrays/candle glow
  // effects read as a flashing light over real photos — they're opt-in now,
  // never auto-assigned.
  const mood = 'drift';
  const recipe = { archetype, theme, mood, useCapturedPalette:true,
    why:`brand ${p.brand} — saturation ${(s*100)|0}%, ${isBlueNavy?'navy':isWarm?'warm':isGreen?'green':'neutral'} → pools [${archPool[0]}+alts]×[${themePool[0]}+alts], seed-spread → ${archetype} + ${theme}` };
  return applyRecipeVariety(recipe, profile);
}

// Seeded font pack + shape jitter for a recipe's FINAL theme. Idempotent and
// deterministic — the pipeline re-runs it after --theme overrides. A captured
// brand font (profile.fonts.head) ALWAYS wins: variety fonts apply only when
// no brand font was captured. Theme default face is kept ~1/3 of the time.
export function applyRecipeVariety(recipe, profile={}){
  const seed = seedOf(profile);
  const t = THEMES[recipe.theme] || THEMES.evergreen;
  recipe.fontPack = (profile.fonts && profile.fonts.head) ? null : pickFontPack(seed, recipe.theme);
  recipe.rad = pickRad(seed, t.rad);
  return recipe;
}

// ── the guest concierge (the 0/7 white-space) ───────────────────────────────
// Answers practical guest questions from the church's OWN captured data. Hard rule:
// anything pastoral/spiritual (prayer, grief, crisis) routes to a REAL person — the
// concierge never plays pastor. Works client-side now; a Claude-backed /api/concierge
// can be swapped in for open-ended Q&A when ANTHROPIC_API_KEY is set.
function conciergeWidget(profile, opts={}){
  const business = !!opts.business;
  const advice = opts.vertical === 'law' ? 'legal' : 'medical';   // guardrail domain
  const svc = (profile.sections?.services?.items||[]).map(i=>i.h).filter(Boolean).slice(0,6);
  const data = {
    biz: business, adv: advice, name: profile.name || (business?'us':'our church'),
    times: profile.serviceTimes || [], location: profile.location || '', phone: profile.phone || '',
    services: svc,
    // church-only fields stay out of business page source — no church copy
    // (kids check-in, giving, watch) may appear in a business render, even unused
    ...(business ? {} : {
      kids: (profile.sections?.services?.items||[]).some(i=>/kid|child/i.test(i.h)) ? 'Yes — safe, secure check-in for kids at every service.' : 'Yes — kids are welcome and cared for at every service.',
      giving: !!profile.sections?.giving, watch: !!profile.sections?.sermons,
    }),
    money: !!profile.sections?.money, book: business,
  };
  const head = business ? ['Front desk','Quick answers — hours, booking, insurance'] : ['Welcome desk','Quick answers for your first visit'];
  const ph = business ? 'Ask about hours, booking, insurance…' : 'Ask about times, kids, parking…';
  return `
<button class="cx-bubble" aria-label="Ask a question" id="cxOpen">💬</button>
<div class="cx-panel" id="cxPanel" role="dialog" aria-label="${head[0]}" hidden>
  <div class="cx-head"><b>${head[0]}</b><span>${head[1]}</span><button class="cx-x" id="cxClose" aria-label="Close">×</button></div>
  <div class="cx-log" id="cxLog"></div>
  <div class="cx-chips" id="cxChips"></div>
  <form class="cx-in" id="cxForm"><input id="cxText" placeholder="${ph}" autocomplete="off"><button type="submit" aria-label="Send">→</button></form>
</div>
<script>(function(){
  var D=${JSON.stringify(data).replace(/</g,'\\u003c')};
  var log=document.getElementById('cxLog'), chips=document.getElementById('cxChips');
  function push(who,html){var d=document.createElement('div');d.className='cx-msg '+who;d.innerHTML=html;log.appendChild(d);log.scrollTop=log.scrollHeight;}
  function callCta(){return D.phone?['Call '+D.phone,'tel:'+D.phone.replace(/[^0-9]/g,'')]:['Send a message','#connect'];}
${business ? `  function answer(q){q=q.toLowerCase();
    // GUARDRAIL: never give medical or legal advice — route to a booked professional
    if(D.adv==='legal' && /should i (sue|settle|sign|plead)|is (it|this) legal|can i sue|lawsuit|will i win|charged with|my (case|charges)|legal advice|do i have a case/.test(q))
      return {t:"I can’t give legal advice — but our attorneys can, in a consultation. Want me to point you to booking one?",cta:['Request a consult','#book']};
    if(D.adv!=='legal' && /is (this|it) (normal|serious|ok|infected)|should i (be worried|see|worry)|diagnos|what does it mean|symptom|my (pain|tooth|skin) (is|hurts)|swelling|is it an emergency|urgent/.test(q))
      return {t:"I can’t give medical advice. If it’s urgent, please call the office now (or 911 for an emergency). Otherwise the best next step is a quick visit — want to book?",cta:['Book a visit','#book']};
    if(/hour|open|when|close|today|available/.test(q))
      return {t: D.times.length? "Our hours:<ul>"+D.times.map(function(x){return '<li>'+x+'</li>'}).join('')+"</ul>" : "See our hours on this page — or call and we’ll help.",cta:callCta()};
    if(/book|appoint|schedul|reserve|see (someone|the)/.test(q)) return {t:"Booking takes under a minute — new patients &amp; clients welcome.",cta:['Book now','#book']};
    if(/insuranc|cost|price|pay|financ|afford|how much|quote/.test(q)) return {t: D.money? "We accept most major insurance and offer financing. Exact cost depends on your visit — the best way to get a real number is a quick consult." : "Costs depend on your visit — we’ll give you a clear number up front. Want to book a consult?",cta:['Book a consult','#book']};
    if(/service|treat|do you|offer|help with|practice area/.test(q)) return {t: D.services.length? "We offer:<ul>"+D.services.map(function(x){return '<li>'+x+'</li>'}).join('')+"</ul>" : "See our services on this page — happy to help you find the right one.",cta:['Book','#book']};
    if(/where|address|direction|park|location|find you/.test(q)) return {t:"We’re at "+(D.location||'our office')+". There’s parking on-site — call if you need directions.",cta:callCta()};
    if(/new|first (time|visit)/.test(q)) return {t:"Welcome! New patients &amp; clients are what we love. Book your first visit and we’ll take great care of you.",cta:['Book your first visit','#book']};
    return {t:"Happy to help — the fastest way is to book online or give us a call.",cta:['Book now','#book']};
  }
  var seeds=['Hours','Book an appointment','Services','Insurance &amp; pricing'];
  var greet='👋 Hi! I’m the front desk for '+D.name+'. I can help with hours, booking, services, and insurance. What do you need?';`
  // church branch is emitted ONLY for tradition renders — church copy must
  // never ship in a business page, not even inside unreachable script branches
  : `  function answer(q){q=q.toLowerCase();
    if(/pray|prayer|grie|griev|hurt|struggl|depress|anxious|suicid|crisis|died|death|sick|hospital|counsel|marriage|divorce/.test(q))
      return {t:"I'm just the welcome desk, so I'm not the right one for that — but a real person on our care team is. If you share a note below, someone will reach out personally.",cta:['Reach our care team','#connect']};
    if(/time|when|service|mass|worship|sunday|saturday|hour/.test(q))
      return {t: D.times.length? "Here’s when we gather:<ul>"+D.times.map(function(x){return '<li>'+x+'</li>'}).join('')+"</ul>" : "We’d love to see you — check the service times on this page."};
    if(/park|where|address|direction|location|find|campus/.test(q))
      return {t:"We’re in "+(D.location||'your area')+". There’s free parking with reserved first-time spots near the main doors — look for the Welcome signs."};
    if(/kid|child|nursery|baby|family|youth/.test(q)) return {t:D.kids};
    if(/give|giving|donate|tithe|money|offering/.test(q)) return D.giving?{t:"Giving is simple and secure — one-time or recurring.",cta:['Give online','#give']}:{t:"You can give at any service, or ask our team about online giving."};
    if(/watch|online|stream|live|video/.test(q)) return D.watch?{t:"Every service streams live, and past messages are always available.",cta:['Watch','#watch']}:{t:"Ask our team about watching online."};
    if(/visit|new|first|expect|come|attend/.test(q)) return {t:"So glad you’re thinking of coming! Come as you are — walk in, grab coffee, and stay as long as you like. Want to let us know you’re coming?",cta:['Plan your visit','#visit']};
    return {t:"Great question — the best person to answer that is our team. Leave a note and we’ll get right back to you.",cta:['Message us','#connect']};
  }
  var seeds=['Service times','Where do I park?','Are kids welcome?','Watch online'];
  var greet='👋 Welcome to '+D.name+'! I can help with service times, parking, kids, and planning your first visit. What can I help you find?';`}
  function ask(q){push('me',q);var a=answer(q);setTimeout(function(){push('bot',a.t+(a.cta?'<br><a class="cx-cta" href="'+a.cta[1]+'">'+a.cta[0]+' →</a>':''));},260);}
  chips.innerHTML=seeds.map(function(s){return '<button class="cx-chip" type="button">'+s+'</button>'}).join('');
  chips.onclick=function(e){var b=e.target.closest('.cx-chip');if(b)ask(b.textContent.replace('&amp;','&'));};
  document.getElementById('cxForm').onsubmit=function(e){e.preventDefault();var t=document.getElementById('cxText');if(t.value.trim()){ask(t.value.trim());t.value='';}};
  var panel=document.getElementById('cxPanel'), first=true;
  document.getElementById('cxOpen').onclick=function(){panel.hidden=false;this.style.display='none';if(first){first=false;push('bot',greet);}};
  document.getElementById('cxClose').onclick=function(){panel.hidden=true;document.getElementById('cxOpen').style.display='';};
})();</script>`;
}

// ── SEO / schema head block ──────────────────────────────────────────────────
// JSON-LD type per business vertical (schema.org LocalBusiness subtypes) or Church.
const SCHEMA_TYPE = {
  dental:'Dentist', medical:'MedicalClinic', optometry:'Optician', law:'Attorney',
  accounting:'AccountingService', insurance:'InsuranceAgency', mortgage:'FinancialService',
  title:'FinancialService', medspa:'HealthAndBeautyBusiness', trades:'HomeAndConstructionBusiness',
  childcare:'ChildCare', business:'LocalBusiness',
};
const escAttr = s => (s||'').replace(/"/g,'&quot;');
function seoHead(profile, recipe, page=null){
  const origin = (recipe.origin || process.env.SITE_ORIGIN || 'https://sightline-studio.vercel.app').replace(/\/$/,'');
  const abs = u => !u ? null : /^https?:/i.test(u) ? u : origin + (u.startsWith('/')?'':'/') + u;
  const canonical = profile.slug ? `${origin}/demos/${profile.slug}/${page?.file||''}` : null;
  const desc = (profile.description||'').slice(0,300);
  const img = abs(profile.heroImage) || abs(profile.logo);
  const meta = [
    // demos are sales assets, not the client's real site — never let them
    // compete with (or leak into) search results. recipe.indexable=true for
    // delivered production sites.
    recipe.indexable ? '' : `<meta name="robots" content="noindex">`,
    canonical && `<link rel="canonical" href="${canonical}">`,
    profile.logo && `<link rel="icon" href="${escAttr(profile.logo)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escAttr(profile.name)}${profile.tagline?` — ${escAttr(profile.tagline)}`:''}">`,
    desc && `<meta property="og:description" content="${escAttr(desc)}">`,
    canonical && `<meta property="og:url" content="${canonical}">`,
    img && `<meta property="og:image" content="${escAttr(img)}">`,
    `<meta name="twitter:card" content="${img?'summary_large_image':'summary'}">`,
  ].filter(Boolean).join('\n');
  // structured data — only fields we actually captured; nothing invented
  const type = recipe.vertical ? (SCHEMA_TYPE[recipe.vertical]||'LocalBusiness') : recipe.tradition ? 'Church' : null;
  if (!type) return meta;
  const ld = { '@context':'https://schema.org', '@type':type, name: profile.name };
  if (canonical) ld.url = canonical;
  if (desc) ld.description = desc;
  if (profile.phone) ld.telephone = profile.phone;
  if (profile.location) ld.address = profile.location;
  if (abs(profile.logo)) ld.logo = abs(profile.logo);
  if (img) ld.image = img;
  const rv = profile.sections?.reviews;
  if (rv?.rating && rv?.count && /^\d+$/.test(String(rv.count)))
    ld.aggregateRating = { '@type':'AggregateRating', ratingValue: String(rv.rating), reviewCount: String(rv.count) };
  return meta + `\n<script type="application/ld+json">${JSON.stringify(ld).replace(/</g,'\\u003c')}</script>`;
}

// ── the assembler ─────────────────────────────────────────────────────────────
// page (optional): {order, title, lead} renders an interior page — compact
// pagehero instead of the full hero, solid nav, no auto gallery weave.
export function assemble(profile, recipe={}, page=null){
  const archetype = ARCHETYPES[recipe.archetype] || ARCHETYPES.cathedral;
  const theme = THEMES[recipe.theme] || THEMES.evergreen;
  const trad = TRADITIONS[recipe.tradition] || VERTICALS[recipe.vertical] || null;   // content pack: church tradition OR business vertical
  const mood = recipe.mood || 'godrays';
  const useCaptured = recipe.useCapturedPalette !== false;
  // Brand-font echo: if capture found a Google Font the prospect already
  // loads, use it as the display face (guaranteed available on Google Fonts).
  // sanitize: captures sometimes carry weight/variant suffixes ("Roboto Condensed:400,700|…")
  // Captured brand font > seeded variety font pack (recipe.fontPack) > theme default.
  const brandFont = profile.fonts && profile.fonts.head && profile.fonts.head.split(/[:|,]/)[0].trim();
  const packFont = !brandFont && recipe.fontPack && recipe.fontPack.font ? recipe.fontPack : null;
  const displayFont = brandFont || (packFont && packFont.font) || theme.font;
  const displayUrl = brandFont ? brandFont.replace(/ /g,'+') + ':wght@400;500;600;700'
    : (packFont && packFont.fontUrl) || theme.fontUrl;
  const css = stylesheet().replace(/__DISPLAY__/g, displayFont);
  const p = { ...profile, ...(trad ? { _t:trad } : {}), ...(page ? { _page:page } : {}), _vertical: recipe.vertical || null };
  let order = page?.order || (trad ? trad.order : archetype.order);
  if (!page && recipe.vertical && recipe.structure && STRUCTURES[recipe.structure])
    order = STRUCTURES[recipe.structure];
  // statement is offer-forward BY ORDER too (marquee early, offer prominent,
  // proof after) — business renders honor its punchy arc unless an explicit
  // structure was chosen. New-archetype rule only; others behave as before,
  // and church traditions keep their own content order (statement then styles
  // the hero/type only).
  else if (!page && !recipe.tradition && recipe.archetype === 'statement')
    order = ARCHETYPES.statement.order;
  // hearth is a CHURCH archetype with its own gathered order. It replaces the
  // generic contemporary spine only — catholic/mainline keep their tradition
  // orders (mass/sacraments/music must never be dropped) and hearth then
  // styles surfaces/type alone, the same rule statement follows for business.
  else if (!page && recipe.tradition === 'contemporary' && recipe.archetype === 'hearth')
    order = ARCHETYPES.hearth.order;
  // Demo-only upsell layer (business demos): teaser grid on the homepage,
  // upgrade band above the footer on EVERY page. Never on delivered sites
  // (recipe.indexable) and removable with recipe.upsells=false.
  if (recipe.vertical && recipe.upsells !== false && !recipe.indexable) {
    order = [...order];
    if (!page && !order.includes('upsell')) {
      const at = order.indexOf('cta');
      order.splice(at > 0 ? at : order.length - 1, 0, 'upsell');
    }
    if (!order.includes('upgradecta')) {
      const at = order.indexOf('footer');
      order.splice(at > 0 ? at : order.length, 0, 'upgradecta');
    }
  }
  // art direction: when we captured real photos, weave a gallery strip in
  // before the closing CTA (the renderer no-ops below 3 photos anyway)
  if (!page && (profile.gallery||[]).length >= 3 && !order.includes('gallerystrip') && !order.includes('gallery')) {
    order = [...order];
    const at = order.indexOf('cta');
    order.splice(at > 0 ? at : order.length - 1, 0, 'gallerystrip');
  }
  const bodyClass = archetype.body + (recipe.tradition ? ` trad-${recipe.tradition}` : '') + (recipe.vertical ? ` vert-${recipe.vertical}` : '') + (page ? ' subpage' : '');
  const body = order.map(name => (S[name] ? S[name](p, {mood, arch: recipe.archetype}) : '')).join('\n');
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(page?.title?`${page.title} — ${profile.name}`:`${profile.name}${profile.tagline?` — ${profile.tagline}`:''}`)}</title>
<meta name="description" content="${((profile.description||profile.hero?.sub||`${profile.name}${profile.tagline?` — ${profile.tagline}`:''}`)||'').replace(/"/g,'&quot;').slice(0,300)}">
${seoHead(profile, recipe, page)}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=${displayUrl}&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>:root{${themeVars(profile,recipe.theme,useCaptured,recipe.rad)}}
${css}</style></head>
<body class="${bodyClass}">
${body}
${recipe.concierge === false ? '' : conciergeWidget(p, {business:!recipe.tradition, vertical:recipe.vertical})}
${RUNTIME}
</body></html>`;
}

// ── multi-page site builder ───────────────────────────────────────────────────
// Same section system, real pages — a one-page demo reads "template", separate
// Services / About / Contact pages read "real site". Returns {filename: html}.
export function assembleSite(profile, recipe={}){
  const isBiz = !!recipe.vertical;
  const hasReviews = !!(profile.sections?.reviews?.items?.length);
  const manifests = isBiz ? [
    { file:'services.html', title:'Services', lead:'Everything we do, and how to get started.',
      order:['nav','pagehero','services','trust','results','offer','bizmoney','bookbar','cta','footer'] },
    { file:'about.html', title:'About us', lead:`Get to know ${profile.name}.`,
      order:['nav','pagehero','team','gallerystrip','trust',...(hasReviews?[]:['reviews']),'bizmoney','bookbar','cta','footer'] },
    // Reviews gets its own tab only when REAL reviews were captured — the
    // engine never fabricates social proof.
    ...(hasReviews ? [{ file:'reviews.html', title:'Reviews', lead:'What our patients and clients actually say.',
      order:['nav','pagehero','reviews','results','trust','bookbar','cta','footer'] }] : []),
    { file:'contact.html', title:'Contact', lead:'Hours, location, and the fastest ways to reach us.',
      order:['nav','pagehero','hours','bookbar','care','footer'] },
  ] : [
    { file:'visit.html', title:'Plan your visit', lead:'Everything you need to know before your first Sunday.',
      order:['nav','pagehero','times','nextsteps','services','cta','footer'] },
    { file:'about.html', title:'About us', lead:`The people and story of ${profile.name}.`,
      order:['nav','pagehero','team','gallerystrip','serve','groups','cta','footer'] },
    { file:'contact.html', title:'Contact', lead:'We\'d love to hear from you.',
      order:['nav','pagehero','times','care','footer'] },
  ];
  // real nav across every page
  const nav = [
    { label:'Home', href:'index.html' },
    ...manifests.map(m => ({ label:m.title.replace('Plan your visit','Visit').replace(' us',''), href:m.file })),
  ];
  const p = { ...profile, nav };
  const out = { 'index.html': assemble(p, recipe) };
  for (const m of manifests) out[m.file] = assemble(p, recipe, m);
  return out;
}
