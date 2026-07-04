// ─────────────────────────────────────────────────────────────────────────────
// Sightline Site Engine — turns a captured SiteProfile + a Recipe into a full,
// self-contained website. Variety comes from ARCHETYPE (structure) × THEME
// (palette/type/shape/motion) × FEATURES (which sections) × per-section treatment.
// No two recipes render the same site.
// ─────────────────────────────────────────────────────────────────────────────

// ── colour helpers ───────────────────────────────────────────────────────────
const hex = h => (h || '').trim().toLowerCase();
function rgb(h){ h=hex(h).replace('#',''); if(h.length===3) h=h.split('').map(c=>c+c).join('');
  return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
function lum([r,g,b]){ const f=v=>{v/=255; return v<=.03928?v/12.92:((v+.055)/1.055)**2.4}; return .2126*f(r)+.7152*f(g)+.0722*f(b); }
function sat([r,g,b]){ const mx=Math.max(r,g,b),mn=Math.min(r,g,b); return mx===0?0:(mx-mn)/mx; }
function darken(h,amt){ const [r,g,b]=rgb(h); const f=v=>Math.max(0,Math.round(v*(1-amt))); return `#${[f(r),f(g),f(b)].map(v=>v.toString(16).padStart(2,'0')).join('')}`; }
const rgbStr = h => rgb(h).join(',');

// Derive a coherent palette from the real captured colours.
function derivePalette(colors){
  const cs = (colors||[]).map(hex).filter(c=>/^#[0-9a-f]{6}$/.test(c));
  const vivid = cs.filter(c=>sat(rgb(c))>.35 && lum(rgb(c))>.06 && lum(rgb(c))<.7)
                  .sort((a,b)=>sat(rgb(b))-sat(rgb(a)));
  const brand = vivid[0] || '#1f6f5c';
  // accent: a second vivid hue distinct from brand, else a warm gold
  const accent = vivid.find(c=>Math.abs(lum(rgb(c))-lum(rgb(brand)))>.08 && c!==brand) || '#c0914c';
  const darks = cs.filter(c=>lum(rgb(c))<.14).sort((a,b)=>lum(rgb(a))-lum(rgb(b)));
  const lights = cs.filter(c=>lum(rgb(c))>.85).sort((a,b)=>lum(rgb(b))-lum(rgb(a)));
  return {
    brand, brandD: darken(brand,.18), accent,
    ink: darks[0] || '#1b1b1f',
    bg: lights[0] || '#faf8f4', surf:'#ffffff',
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
    .filter(t=>t.label && t.label.length<=22 && !/^(skip|search|menu)$/i.test(t.label))
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
    nav: tabs.length ? tabs : null,
    phrases,
    hero: over.hero || null,               // {kick, headline, sub, ctas:[{label,href,ghost}]}
    location: over.location || '',
    phone: over.phone || '',               // for click-to-call in the book bar
    serviceTimes: over.serviceTimes || [], // real captured service times
    gallery: over.gallery || [],           // real captured photo URLs
    sections: over.sections || {},         // {services, events, giving, team, ...}
    heroImage: over.heroImage || null,     // data URI or path
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
};

// motion moods (Living Light) reused from the church hero work
export const MOODS = {
  none:'', drift:'drift', godrays:'godrays', candle:'candle',
};

// ── the CSS foundation (shared) + theme injection ─────────────────────────────
function themeVars(profile, theme, useCaptured){
  const p = profile.palette;
  const t = THEMES[theme] || THEMES.evergreen;
  const brand  = useCaptured ? p.brand  : t.pal.brand;
  const brandD = useCaptured ? p.brandD : t.pal.brandD;
  const accent = useCaptured ? p.accent : t.pal.accent;
  return `--ink:${p.ink};--bg:${p.bg};--surf:${p.surf};--mut:${p.mut};--line:${p.line};
    --brand:${brand};--brand-d:${brandD};--accent:${accent};--brand-rgb:${rgbStr(brand)};--rad:${t.rad}px`;
}

// ── section renderers ────────────────────────────────────────────────────────
const S = {};

S.nav = (p) => `
<nav class="nav">
  <a class="brandmark" href="#top">${p.logo
    ? `<img src="${p.logo}" alt="${p.name}" class="logo">`
    : `<span class="wordmark">${p.name}</span>`}</a>
  ${p.nav ? `<div class="navlinks">${p.nav.map(t=>`<a href="${t.href}">${t.label}</a>`).join('')}</div>` : ''}
  <a class="btn sm" href="#visit">${p._t?.imNew || "I'm New"}</a>
</nav>`;

S.hero = (p, {mood}) => {
  const h = p.hero || {};
  // Video hero when the church gives us footage (their own, or AI for commercial demos);
  // the still image is the poster + instant fallback, so it degrades gracefully.
  const bg = p.heroVideo
    ? `<video class="hero-bg hero-video" autoplay muted loop playsinline preload="metadata" poster="${p.heroImage||''}"><source src="${p.heroVideo}" type="video/mp4"></video>`
    : p.heroImage ? `<div class="hero-bg" style="background-image:url('${p.heroImage}')"></div>` : '';
  const glow = mood && mood!=='none' ? `<div class="glow"></div>` : '';
  return `
<header class="hero mood-${mood||'none'}" id="top">
  ${bg}${glow}<div class="scrim"></div>
  <div class="hero-in">
    ${h.kick?`<span class="kick">${h.kick}</span>`:''}
    <h1>${h.headline || p.name}</h1>
    ${h.sub?`<p class="hero-sub">${h.sub}</p>`:''}
    <div class="cta-row">
      ${(h.ctas||[{label:'Plan Your Visit →',href:'#visit'},{label:'Watch Online',href:'#watch',ghost:true}])
        .map(c=>`<a class="btn lg${c.ghost?' ghost':''}" href="${c.href}">${c.label}</a>`).join('')}
    </div>
  </div>
</header>`;
};

S.services = (p) => { const s=p.sections.services; if(!s||!s.items) return ''; const tc=p._t?.copy?.services||{};
  return `
<section class="sec services" id="visit">
  <div class="wrap">
    <span class="sec-k">${s.kicker||tc.kicker||'New here?'}</span>
    <h2>${s.title||tc.title||'What to expect'}</h2>
    ${s.lead?`<p class="lead">${s.lead}</p>`:''}
    <div class="cardgrid">${s.items.map((it,i)=>`
      <article class="card"><span class="cn">${i+1}</span><h3>${it.h}</h3><p>${it.p}</p></article>`).join('')}
    </div>
  </div>
</section>`; };

S.events = (p) => { const s=p.sections.events; if(!s||!s.items) return '';
  return `
<section class="sec events" id="events">
  <div class="wrap">
    <span class="sec-k">${s.kicker||'This week'}</span>
    <h2>${s.title||"What's on"}</h2>
    <div class="evlist">${s.items.map(e=>`
      <div class="ev"><div class="ev-when">${e.when||''}</div>
        <div class="ev-body"><h3>${e.h}</h3><p>${e.p||''}</p></div></div>`).join('')}
    </div>
  </div>
</section>`; };

S.giving = (p) => { const s=p.sections.giving; if(!s) return '';
  return `
<section class="sec band" id="give">
  <div class="wrap band-in">
    <div><span class="sec-k light">${s.kicker||'Give'}</span><h2>${s.title||'Generosity, made simple.'}</h2>
      <p class="lead light">${s.lead||''}</p></div>
    <a class="btn lg light" href="${s.href||'#give'}">${s.cta||'Give online'}</a>
  </div>
</section>`; };

S.cta = (p) => `
<section class="sec cta" id="join">
  <div class="wrap">
    <h2>${(p.sections.cta&&p.sections.cta.title)||'We saved you a seat.'}</h2>
    <p class="lead">${(p.sections.cta&&p.sections.cta.lead)||'Come as you are — this Sunday.'}</p>
    <a class="btn lg" href="#visit">Plan Your Visit →</a>
  </div>
</section>`;

// live announcement bar — proof the church is current & alive
S.announce = (p) => p.announce ? `<div class="announce"><span class="adot"></span>${p.announce}</div>` : '';

// the visitor journey — the spine of a congregation-first site
S.nextsteps = (p) => { const s=p.sections.nextsteps; if(!s) return '';
  const steps = s.items || [
    {n:'01',h:'Plan your visit',p:'Tell us you’re coming — we’ll have someone ready to meet you.'},
    {n:'02',h:'Come as you are',p:'Grab coffee, find a seat, stay as long as you like. No pressure.'},
    {n:'03',h:'Get connected',p:'A quick connect card is all it takes to hear about what’s next.'},
    {n:'04',h:'Find your people',p:'A group is where a big church becomes a family.'},
  ];
  return `
<section class="sec steps" id="next-steps">
  <div class="wrap"><span class="sec-k">Your next step</span><h2>${s.title||'New here? Start here.'}</h2>
    <div class="steprail">${steps.map(x=>`<div class="step"><span class="stepn">${x.n}</span><h3>${x.h}</h3><p>${x.p}</p></div>`).join('<span class="steparrow">→</span>')}</div>
    <a class="btn lg" href="#connect">Plan my visit →</a>
  </div></section>`; };

S.groups = (p) => { const s=p.sections.groups; if(!s) return ''; const tc=p._t?.copy?.groups||{};
  const cats = s.cats || tc.cats || ['Life Groups','Men','Women','Young Adults','Students','Families'];
  return `
<section class="sec groups" id="groups">
  <div class="wrap"><span class="sec-k">${tc.kicker||'Belong'}</span><h2>${s.title||tc.title||'Find your people.'}</h2>
    <p class="lead">${s.lead||tc.lead||'A group is where Sunday becomes a family. Tell us your season of life and we’ll match you.'}</p>
    <div class="chips">${cats.map(c=>`<span class="chip">${c}</span>`).join('')}</div>
    <a class="btn lg" href="#connect">${s.cta||tc.cta||'Find your group →'}</a>
  </div></section>`; };

S.serve = (p) => { const s=p.sections.serve; if(!s) return ''; const tc=p._t?.copy?.serve||{};
  return `
<section class="sec band alt" id="serve">
  <div class="wrap band-in"><div><span class="sec-k light">${tc.kicker||'Serve'}</span>
    <h2>${s.title||tc.title||'There’s a place for you here.'}</h2>
    <p class="lead light">${s.lead||tc.lead||'Kids, worship, hospitality, tech, outreach — serving is how you go from attending to belonging.'}</p></div>
    <a class="btn lg light" href="#connect">${s.cta||tc.cta||'Find where to serve'}</a></div></section>`; };

S.music = (p) => { const s=p.sections.music; if(!s) return ''; const m=s;
  return `
<section class="sec music" id="music">
  <div class="wrap"><span class="sec-k">Worship & music</span><h2>${m.title||'A tradition of sung faith.'}</h2>
    <p class="lead">${m.lead||'Choir, organ, and worship arts — music that lifts the whole room, every week.'}</p>
    <a class="btn lg" href="#events">${m.cta||'Our music ministry'}</a></div></section>`; };

S.care = (p) => { const s=p.sections.care; if(!s) return '';
  return `
<section class="sec care" id="connect">
  <div class="wrap care-in">
    <div class="care-copy"><span class="sec-k">Care & prayer</span><h2>${s.title||'However you come, you don’t come alone.'}</h2>
      <p class="lead">${s.lead||'Need prayer, or just want someone to know you’re coming? Send a note — a real person reads every one.'}</p></div>
    <form class="care-form" onsubmit="return false">
      <input type="text" placeholder="Your name" aria-label="Your name">
      <input type="email" placeholder="Email" aria-label="Email">
      <textarea rows="3" placeholder="How can we pray for you, or how can we help?" aria-label="Message"></textarea>
      <button class="btn" type="submit">Send it →</button>
    </form>
  </div></section>`; };

// Watch / Livestream — universal among top churches (7/7); the sample-before-you-come on-ramp
S.sermons = (p) => { const s=p.sections.sermons; if(!s) return '';
  return `
<section class="sec watch" id="watch">
  <div class="wrap watch-in">
    <div class="watch-copy"><span class="sec-k">Watch</span><h2>${s.title||'Can’t make it in person? Worship with us online.'}</h2>
      <p class="lead">${s.lead||'Every service streams live — and the full message library is a tap away. A great way to sample before you step in.'}</p>
      <div class="cta-row"><a class="btn lg" href="${s.live||'#watch'}">Watch live →</a><a class="btn ghost lg" href="${s.archive||'#watch'}">Past messages</a></div>
    </div>
    <div class="watch-frame"><span class="playbtn">▶</span>${s.latest?`<div class="watch-meta"><b>${s.latest.title}</b><span>${s.latest.speaker||''}</span></div>`:''}</div>
  </div>
</section>`; };

S.times = (p) => { const t=p.serviceTimes; if(!t||!t.length) return '';
  const heading = p._t?.timesLabel || 'Service times';
  return `
<section class="sec times" id="times">
  <div class="wrap times-in">
    <div class="times-h"><span class="sec-k">Join us</span><h2>${heading}</h2></div>
    <ul class="times-list">${t.map(x=>`<li><span class="tdot"></span>${x}</li>`).join('')}</ul>
  </div>
</section>`; };

// ── Catholic tradition sections ──────────────────────────────────────────────
S.mass = (p) => { const t=p.serviceTimes||[]; const m=p.sections.mass||{};
  return `
<section class="sec times" id="times">
  <div class="wrap times-in">
    <div class="times-h"><span class="sec-k">Join us</span><h2>Mass times</h2></div>
    <ul class="times-list">${t.length?t.map(x=>`<li><span class="tdot"></span>${x}</li>`).join(''):'<li><span class="tdot"></span>Saturday Vigil · Sunday morning</li>'}</ul>
  </div>
  ${(m.confession||m.adoration)?`<div class="wrap devos">${m.confession?`<div class="devo"><b>Reconciliation</b><span>${m.confession}</span></div>`:''}${m.adoration?`<div class="devo"><b>Eucharistic Adoration</b><span>${m.adoration}</span></div>`:''}</div>`:''}
</section>`; };

S.sacraments = (p) => { const s=p.sections.sacraments; if(!s) return '';
  const items = s.items || ['Baptism','First Holy Communion','Reconciliation','Confirmation','Holy Matrimony','Anointing of the Sick'];
  return `
<section class="sec sacr" id="sacraments">
  <div class="wrap">
    <span class="sec-k">The Sacraments</span><h2>${s.title||'Encounter Christ in the sacraments.'}</h2>
    <p class="lead">${s.lead||'From Baptism to Marriage, the sacraments mark every season of a Catholic life. Here’s how to receive each one in our parish.'}</p>
    <div class="sacrgrid">${items.map(x=>`<article class="sacrcard"><span class="sx">✦</span><h3>${x}</h3></article>`).join('')}</div>
    <a class="btn lg" href="#connect">${s.cta||'New to the faith? Begin OCIA →'}</a>
  </div>
</section>`; };

S.team = (p) => { const s=p.sections.team; if(!s||!s.items||!s.items.length) return '';
  return `
<section class="sec team" id="team">
  <div class="wrap">
    <span class="sec-k">${s.kicker||'Our team'}</span>
    <h2>${s.title||'People you\'ll meet'}</h2>
    <div class="teamgrid">${s.items.map(m=>`
      <article class="tcard">${m.photo?`<img src="${m.photo}" alt="${m.name}">`:`<div class="tinitial">${(m.name||'?')[0]}</div>`}
        <h3>${m.name}</h3><span class="trole">${m.role||''}</span></article>`).join('')}
    </div>
  </div>
</section>`; };

S.footer = (p) => `
<footer class="foot"><div class="wrap">
  <div class="foot-brand">${p.name}</div>
  ${p.location?`<div class="foot-loc">${p.location}</div>`:''}
  <div class="foot-fine">Site by Sightline</div>
</div></footer>`;

// ── archetypes: section order + body class (drives layout treatment) ─────────
export const ARCHETYPES = {
  cathedral:{ order:['nav','hero','times','services','events','team','giving','cta','footer'], body:'arch-cathedral' },
  editorial:{ order:['nav','hero','services','times','giving','events','team','cta','footer'], body:'arch-editorial' },
  modern:{    order:['nav','hero','events','times','services','team','giving','cta','footer'], body:'arch-modern' },
  split:{     order:['nav','hero','times','services','events','team','giving','cta','footer'], body:'arch-split' },
  minimal:{   order:['nav','hero','services','times','events','giving','cta','footer'], body:'arch-minimal' },
  // congregation-first: ordered around the visitor's journey, not the institution
  journey:{   order:['announce','nav','hero','times','nextsteps','services','groups','serve','events','team','care','giving','sermons','cta','footer'], body:'arch-journey' },
};

// ── business sections (local high-value verticals: dental / law / medspa) ────
S.bookbar = (p) => { const b=p.sections.book||{};
  return `
<section class="sec bookbar">
  <div class="wrap bookbar-in">
    <div><b>${b.title||'Ready when you are.'}</b><span>${b.sub||'Book online in under a minute — or call and we’ll take care of the rest.'}</span></div>
    <div class="bookbtns"><a class="btn lg" href="${b.href||'#book'}">${p._t?.bookCta||'Book appointment →'}</a>${p.phone?`<a class="btn ghost lg" href="tel:${p.phone.replace(/[^0-9]/g,'')}">📞 ${p.phone}</a>`:''}</div>
  </div>
</section>`; };

S.reviews = (p) => { const s=p.sections.reviews; if(!s) return '';
  const items = s.items || [];
  return `
<section class="sec reviews" id="reviews">
  <div class="wrap">
    <span class="sec-k">${s.kicker||'What people say'}</span>
    <h2>${s.title||'Trusted by neighbors like you.'}</h2>
    ${s.rating?`<div class="rating"><span class="stars">★★★★★</span> <b>${s.rating}</b> from <b>${s.count||'hundreds of'}</b> reviews</div>`:''}
    <div class="rvgrid">${items.map(r=>`<blockquote class="rv">“${r.q}”<cite>— ${r.name||'Verified patient'}</cite></blockquote>`).join('')}</div>
  </div>
</section>`; };

S.offer = (p) => { const s=p.sections.offer; if(!s) return '';
  return `
<section class="sec band" id="offer">
  <div class="wrap band-in">
    <div><span class="sec-k light">${s.kicker||'New here?'}</span><h2>${s.title||'New-patient special.'}</h2>
      <p class="lead light">${s.lead||''}</p></div>
    <a class="btn lg light" href="${s.href||'#book'}">${s.cta||'Claim this offer →'}</a>
  </div></section>`; };

S.results = (p) => { const s=p.sections.results; if(!s) return '';
  const items = s.items || [];
  return `
<section class="sec results" id="results">
  <div class="wrap"><span class="sec-k">${s.kicker||'Results'}</span><h2>${s.title||'Real results, real people.'}</h2>
    <div class="cardgrid">${items.map(it=>`<article class="card"><h3>${it.h}</h3><p>${it.p||''}</p></article>`).join('')}</div>
  </div></section>`; };

S.bizmoney = (p) => { const s=p.sections.money; if(!s) return '';
  return `
<section class="sec money" id="money">
  <div class="wrap"><span class="sec-k">${s.kicker||'Affordable care'}</span><h2>${s.title||'Insurance & financing, made easy.'}</h2>
    <p class="lead">${s.lead||'We accept most major insurance and offer flexible financing so cost never stands between you and care.'}</p>
    ${s.logos?`<div class="chips">${s.logos.map(l=>`<span class="chip">${l}</span>`).join('')}</div>`:''}
  </div></section>`; };

S.hours = (p) => { const s=p.sections.hours||{};
  return `
<section class="sec times" id="contact">
  <div class="wrap times-in">
    <div class="times-h"><span class="sec-k">Visit us</span><h2>Hours & location</h2>${p.location?`<p class="lead">${p.location}</p>`:''}</div>
    <ul class="times-list">${(s.items||['Mon–Fri · 8:00 AM – 5:00 PM','Sat · By appointment']).map(x=>`<li><span class="tdot"></span>${x}</li>`).join('')}</ul>
  </div></section>`; };

// ── traditions: the CONTENT layer (which sections, vocabulary, tone) ─────────
// Separate from archetype (visual structure) and theme (palette/type). A Catholic
// parish and a non-denom church can share a visual archetype but differ completely
// in sections + language. Covers the sellable market with a few packs, not per-religion.
export const TRADITIONS = {
  contemporary:{ label:'Contemporary', imNew:"I'm New", timesLabel:'Service times',
    order:['announce','nav','hero','times','nextsteps','services','groups','serve','sermons','events','team','care','giving','cta','footer'] },
  catholic:{ label:'Catholic', imNew:'New to the Parish', timesLabel:'Mass times',
    order:['announce','nav','hero','mass','sacraments','services','serve','sermons','events','team','care','giving','cta','footer'] },
  mainline:{ label:'Mainline / Liturgical', imNew:'Visiting?', timesLabel:'Worship times',
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
    order:['announce','nav','hero','bookbar','services','reviews','offer','team','results','bizmoney','hours','cta','footer'] },
  law:{ label:'Law', imNew:'Free Consult', bookCta:'Request a free consult →',
    order:['announce','nav','hero','bookbar','services','reviews','team','offer','hours','cta','footer'] },
  medspa:{ label:'Med Spa', imNew:'Book Now', bookCta:'Book your visit →',
    order:['announce','nav','hero','bookbar','services','reviews','offer','results','team','bizmoney','hours','cta','footer'] },
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
  padding:18px clamp(20px,4vw,44px);color:#fff}
.nav .brandmark{display:inline-flex;align-items:center;background:#fff;border-radius:9px;padding:7px 12px;box-shadow:0 2px 12px rgba(0,0,0,.12);text-decoration:none}
.nav .logo{height:30px;width:auto;display:block}
.arch-split .nav .brandmark,.arch-minimal .nav .brandmark{box-shadow:none;background:transparent;padding:0}
.nav .wordmark{font-family:'__DISPLAY__',serif;font-size:1.4rem;font-weight:600}
.navlinks{display:flex;gap:20px;margin-left:auto;font-size:.82rem;font-weight:600;letter-spacing:.02em}
.navlinks a{color:#fff;text-decoration:none;opacity:.9;text-transform:uppercase}
.navlinks a:hover{opacity:1}.nav .btn{margin-left:12px}
/* hero */
.hero{position:relative;min-height:100svh;display:flex;align-items:flex-end;color:#fff;isolation:isolate;overflow:hidden}
.hero-bg{position:absolute;inset:0;z-index:-3;background-size:cover;background-position:center;transform:scale(1.06);transform-origin:60% 40%}
.hero-video{width:100%;height:100%;object-fit:cover}
.glow{position:absolute;z-index:-2;pointer-events:none;display:none;mix-blend-mode:screen}
.scrim{position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,0) 34%,rgba(0,0,0,.32) 66%,rgba(0,0,0,.8))}
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
.band{background:var(--brand);color:#fff}
.band-in{display:flex;gap:30px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.band h2{margin-top:.2em}
/* cta */
.cta{text-align:center}.cta h2{font-size:clamp(2rem,4vw,3rem)}.cta .lead{margin:.6em auto 24px}
/* footer */
.foot{background:var(--ink);color:#fff;padding:44px 0}
.foot-brand{font-family:'__DISPLAY__',serif;font-size:1.3rem;font-weight:600}
.foot-loc{color:rgba(255,255,255,.7);margin-top:6px}.foot-fine{color:rgba(255,255,255,.45);margin-top:18px;font-size:.85rem}
/* motion moods */
@keyframes drift{from{transform:scale(1.06)}to{transform:scale(1.16) translate(-2.4%,-2%)}}
@keyframes rays{0%{transform:translate(-4%,-3%) rotate(-1.1deg);opacity:.3}100%{transform:translate(4%,3%) rotate(1.1deg);opacity:.66}}
@keyframes flick{0%,100%{opacity:.48}20%{opacity:.72}36%{opacity:.44}54%{opacity:.66}70%{opacity:.52}86%{opacity:.78}}
.mood-drift .hero-bg,.mood-godrays .hero-bg,.mood-candle .hero-bg{animation:drift 26s ease-in-out infinite alternate}
.mood-godrays .glow{display:block;inset:-28%;filter:blur(9px);animation:rays 15s ease-in-out infinite alternate;
  background:radial-gradient(52% 46% at 70% 6%,color-mix(in srgb,var(--accent) 62%,transparent),transparent 72%),
  linear-gradient(101deg,transparent 20%,rgba(255,252,242,.11) 32%,transparent 46%),
  linear-gradient(101deg,transparent 50%,rgba(255,250,238,.07) 62%,transparent 78%)}
.mood-candle .glow{display:block;inset:0;animation:flick 5s ease-in-out infinite;
  background:radial-gradient(58% 60% at 50% 84%,color-mix(in srgb,var(--accent) 42%,#ffb066),transparent 66%)}
/* archetype tweaks */
.arch-editorial .hero{align-items:center}.arch-editorial .hero-in{margin:0 auto;text-align:center;max-width:900px}
.arch-editorial .cta-row{justify-content:center}
.arch-modern .nav .btn{border-radius:100px}.arch-modern .card{border:none;box-shadow:0 10px 40px rgba(0,0,0,.06)}
.arch-modern .btn{border-radius:100px}
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
/* rhythm: alternate section grounds so the page breathes */
.sec:nth-of-type(even):not(.band):not(.cta){background:color-mix(in srgb,var(--ink) 3%,var(--bg))}
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
`; }

// injected at end of <body> — nav-solid-on-scroll + scroll-reveal (a11y-safe)
const RUNTIME = `<script>
(function(){var n=document.querySelector('.nav');
 if(n)addEventListener('scroll',function(){n.classList.toggle('scrolled',scrollY>40)},{passive:true});
 var els=document.querySelectorAll('.sec');
 if(!matchMedia('(prefers-reduced-motion:reduce)').matches&&'IntersectionObserver'in window){
   els.forEach(function(e){e.classList.add('reveal')});
   var io=new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target)}})},{threshold:.12});
   els.forEach(function(e){io.observe(e)});
 }})();
</script>`;

// ── auto-recommend a recipe from the captured brand ──────────────────────────
export function recommendRecipe(profile){
  const p = profile.palette;
  const b = rgb(p.brand); const s = sat(b), l = lum(b);
  const isBlueNavy = b[2] > b[0] && b[2] > b[1] && l < .3;
  const isWarm = b[0] >= b[2] && s > .3;             // red/orange/gold lead
  const isGreen = b[1] >= b[0] && b[1] >= b[2] && s > .25;
  let theme, archetype, mood;
  if (isBlueNavy)      { theme='heritage';  archetype='editorial'; }
  else if (s > .6)     { theme='modern';    archetype='modern'; }      // vivid → modern
  else if (isWarm)     { theme='community'; archetype='split'; }
  else if (isGreen)    { theme='evergreen'; archetype='cathedral'; }
  else if (s < .2)     { theme='quiet';     archetype='minimal'; }     // muted → quiet/minimal
  else                 { theme='sanctuary'; archetype='cathedral'; }
  mood = (archetype==='minimal'||archetype==='split') ? 'drift'
       : (archetype==='cathedral') ? 'godrays' : 'candle';
  return { archetype, theme, mood, useCapturedPalette:true,
    why:`brand ${p.brand} — saturation ${(s*100)|0}%, ${isBlueNavy?'navy':isWarm?'warm':isGreen?'green':'neutral'} → ${archetype} + ${theme}` };
}

// ── the guest concierge (the 0/7 white-space) ───────────────────────────────
// Answers practical guest questions from the church's OWN captured data. Hard rule:
// anything pastoral/spiritual (prayer, grief, crisis) routes to a REAL person — the
// concierge never plays pastor. Works client-side now; a Claude-backed /api/concierge
// can be swapped in for open-ended Q&A when ANTHROPIC_API_KEY is set.
function conciergeWidget(profile){
  const data = {
    name: profile.name || 'our church',
    times: profile.serviceTimes || [],
    location: profile.location || '',
    kids: (profile.sections?.services?.items||[]).some(i=>/kid|child/i.test(i.h)) ? 'Yes — safe, secure check-in for kids at every service.' : 'Yes — kids are welcome and cared for at every service.',
    giving: !!profile.sections?.giving,
    watch: !!profile.sections?.sermons,
    visit: !!(profile.sections?.services||profile.sections?.nextsteps),
  };
  return `
<button class="cx-bubble" aria-label="Ask a question" id="cxOpen">💬</button>
<div class="cx-panel" id="cxPanel" role="dialog" aria-label="Welcome desk" hidden>
  <div class="cx-head"><b>Welcome desk</b><span>Quick answers for your first visit</span><button class="cx-x" id="cxClose" aria-label="Close">×</button></div>
  <div class="cx-log" id="cxLog"></div>
  <div class="cx-chips" id="cxChips"></div>
  <form class="cx-in" id="cxForm"><input id="cxText" placeholder="Ask about times, kids, parking…" autocomplete="off"><button type="submit" aria-label="Send">→</button></form>
</div>
<script>(function(){
  var D=${JSON.stringify(data)};
  var log=document.getElementById('cxLog'), chips=document.getElementById('cxChips');
  function push(who,html){var d=document.createElement('div');d.className='cx-msg '+who;d.innerHTML=html;log.appendChild(d);log.scrollTop=log.scrollHeight;}
  function answer(q){
    q=q.toLowerCase();
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
  function ask(q){push('me',q);var a=answer(q);setTimeout(function(){push('bot',a.t+(a.cta?'<br><a class="cx-cta" href="'+a.cta[1]+'">'+a.cta[0]+' →</a>':''));},260);}
  var seeds=['Service times','Where do I park?','Are kids welcome?','Watch online'];
  chips.innerHTML=seeds.map(function(s){return '<button class="cx-chip" type="button">'+s+'</button>'}).join('');
  chips.onclick=function(e){var b=e.target.closest('.cx-chip');if(b)ask(b.textContent);};
  document.getElementById('cxForm').onsubmit=function(e){e.preventDefault();var t=document.getElementById('cxText');if(t.value.trim()){ask(t.value.trim());t.value='';}};
  var panel=document.getElementById('cxPanel'), first=true;
  document.getElementById('cxOpen').onclick=function(){panel.hidden=false;this.style.display='none';if(first){first=false;push('bot','👋 Welcome to '+D.name+'! I can help with service times, parking, kids, and planning your first visit. What can I help you find?');}};
  document.getElementById('cxClose').onclick=function(){panel.hidden=true;document.getElementById('cxOpen').style.display='';};
})();</script>`;
}

// ── the assembler ─────────────────────────────────────────────────────────────
export function assemble(profile, recipe={}){
  const archetype = ARCHETYPES[recipe.archetype] || ARCHETYPES.cathedral;
  const theme = THEMES[recipe.theme] || THEMES.evergreen;
  const trad = TRADITIONS[recipe.tradition] || VERTICALS[recipe.vertical] || null;   // content pack: church tradition OR business vertical
  const mood = recipe.mood || 'godrays';
  const useCaptured = recipe.useCapturedPalette !== false;
  const css = stylesheet().replace(/__DISPLAY__/g, theme.font);
  const p = trad ? { ...profile, _t:trad } : profile;   // expose tradition labels to renderers
  const order = trad ? trad.order : archetype.order;    // tradition drives content IA when set
  const bodyClass = archetype.body + (recipe.tradition ? ` trad-${recipe.tradition}` : '') + (recipe.vertical ? ` vert-${recipe.vertical}` : '');
  const body = order.map(name => (S[name] ? S[name](p, {mood}) : '')).join('\n');
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${profile.name}${profile.tagline?` — ${profile.tagline}`:''}</title>
<meta name="description" content="${(profile.description||'').replace(/"/g,'&quot;').slice(0,300)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=${theme.fontUrl}&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>:root{${themeVars(profile,recipe.theme,useCaptured)}}
${css}</style></head>
<body class="${bodyClass}">
${body}
${recipe.concierge === false ? '' : conciergeWidget(p)}
${RUNTIME}
</body></html>`;
}
