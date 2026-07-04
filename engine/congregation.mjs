// ─────────────────────────────────────────────────────────────────────────────
// Congregation-Readiness scorecard. Scores a church site on what actually serves
// the CONGREGATION (the person walking in), not the institution — grounded in what
// Mission Hills (our benchmark) does right. Pure JS: runs in Node or the browser.
//
// Score = Σ dimension points (100 total). Each dimension is present / partial /
// absent, detected from the site's nav labels + link hrefs + visible text, plus
// a few technical signals. Every hit records evidence so the score is defensible.
// ─────────────────────────────────────────────────────────────────────────────

export const RUBRIC = [
  { key:'visit',    label:'Plan Your Visit',        weight:14, why:'A first-timer needs a clear "I\'m new → here\'s what to expect" path — the #1 job of a church front door.',
    any:[/plan (a|your) visit/,/\bi'?m new\b/,/new here/,/first[- ]time/,/what to expect/,/planavisit|plan-a-visit/] },
  { key:'times',    label:'Service times & campus', weight:12, why:'43% of church-seekers come to find service times and where to go.',
    any:[/service times?/,/weekend service/,/join us this weekend/,/sunday (at|morning|service)/,/\b\d{1,2}(:\d\d)?\s?(am|pm)\b/,/campus(es)?\b/] },
  { key:'next',     label:'Next Steps pathway',     weight:10, why:'A defined "what now?" path turns a first visit into belonging.',
    any:[/next steps?/,/get connected/,/start here/,/take your next step/,/\/next-steps/] },
  { key:'groups',   label:'Groups & belonging',     weight:10, why:'People stay when they find their people — a group finder beats a static list.',
    any:[/group ?finder/,/find (a|your) group/,/small groups?/,/life groups?/,/community group/,/\/group/] },
  { key:'serve',    label:'Serve & volunteer',      weight:8,  why:'Serving is how attenders become members.',
    any:[/serve ?finder/,/\bserve\b/,/volunteer/,/get involved/,/join the team/,/\/serve/] },
  { key:'care',     label:'Care & Prayer',          weight:8,  why:'Pastoral care/prayer signals a church that meets you in the hard moments — not transactional.',
    any:[/prayer request/,/care ministry/,/need prayer/,/request prayer/,/counsel/,/\/care/] },
  { key:'giving',   label:'Online giving',          weight:10, why:'Digital givers give 33% more; giving must be one tap.',
    any:[/\bgive\b/,/giving/,/donate/,/\btithe/,/pushpay|planning ?center|givelify|tithe\.?ly/,/generosity/] },
  { key:'sermons',  label:'Sermons / Watch',        weight:10, why:'Watch online is the on-ramp — it lets someone sample before they step in.',
    any:[/sermons?/,/messages\b/,/watch (online|live|now)/,/live ?stream/,/past services/,/\bmedia\b/,/podcast/] },
  { key:'families', label:'Kids & Families',        weight:8,  why:'Parents decide on kids\' safety and programming first.',
    any:[/\bkids\b/,/children/,/nursery/,/students?\b/,/youth\b/,/middle school/,/high school/,/families\b/] },
  { key:'alive',    label:'Current & alive',        weight:5,  why:'Live announcements and dated upcoming events prove a real, active community.',
    any:[/this (weekend|sunday|week)/,/announcement/,/upcoming events?/,/register/,/\b(20\d\d)\b.*event|event.*\b20\d\d\b/] },
  { key:'access',   label:'Accessible & solid',     weight:5,  why:'Accessibility, mobile, and HTTPS say "everyone is welcome and we\'re legit."',
    any:[/accessibility|userway|accessibe|audioeye/] , tech:true },
];

// Catholic parishes are judged on a different life — sacraments & Mass, not group finders.
export const RUBRIC_CATHOLIC = [
  { key:'mass',       label:'Mass & confession times', weight:14, why:'The first thing a Catholic seeks: when is Mass, and when is Reconciliation.',
    any:[/mass times?/,/schedule of mass/,/weekend mass/,/daily mass/,/confession/,/reconciliation/,/\b\d{1,2}(:\d\d)?\s?(am|pm)\b/] },
  { key:'sacraments', label:'The Sacraments',          weight:14, why:'Baptism, Communion, Confirmation, Matrimony — the sacraments are the heart of parish life.',
    any:[/sacrament/,/baptism/,/first (communion|eucharist|holy communion)/,/confirmation/,/matrimony|marriage prep/,/anointing/,/holy orders/] },
  { key:'ocia',       label:'Becoming Catholic (OCIA)', weight:8, why:'A clear path for inquirers and converts (OCIA/RCIA) is how a parish grows.',
    any:[/ocia|rcia/,/becoming catholic/,/inquir(y|ers)/,/converts?/,/join the church/,/journey of faith/] },
  { key:'ministries', label:'Parish ministries',       weight:10, why:'Ministries and serving are how parishioners belong and contribute.',
    any:[/ministr/,/serving (our|the)/,/parish life/,/knights of columbus/,/st\.? vincent/,/volunteer/,/get involved/] },
  { key:'devotions',  label:'Prayer, worship & devotions', weight:8, why:'Adoration, rosary, and devotional life signal a praying parish.',
    any:[/adoration/,/rosary/,/novena/,/stations of the cross/,/eucharistic/,/devotion/,/prayer (ministr|group|request)/,/worship/] },
  { key:'giving',     label:'Online giving / stewardship', weight:10, why:'Online offertory and stewardship keep the parish sustained.',
    any:[/\bgive\b/,/giving/,/donate/,/offertory/,/stewardship/,/online giving/,/pushpay|faith ?direct|osv|paypal/] },
  { key:'homilies',   label:'Homilies / Mass online',  weight:8, why:'Livestreamed Mass and recorded homilies reach the homebound and the searching.',
    any:[/homil/,/watch (mass|online|live)/,/live ?stream/,/mass online/,/recorded mass/,/bulletin/] },
  { key:'formation',  label:'Faith formation & youth', weight:8, why:'Religious education, youth, and school are the parish’s future.',
    any:[/faith formation/,/religious education/,/\bccd\b/,/youth/,/children/,/catholic school/,/cateches|catechism/] },
  { key:'parishlife', label:'Parish life & events',    weight:5, why:'A living calendar shows an active parish community.',
    any:[/parish (life|events|calendar)/,/events?\b/,/calendar/,/register/,/fellowship/] },
  { key:'care',       label:'Pastoral care',           weight:8, why:'Anointing, funerals, and bereavement care meet people in their hardest moments.',
    any:[/anointing/,/funeral/,/pastoral care/,/prayer request/,/bereavement/,/homebound/,/counsel/] },
  { key:'access',     label:'Accessible & solid',      weight:7, why:'Accessibility, mobile, and HTTPS say everyone is welcome and the parish is legit.',
    any:[/accessibility|userway|accessibe|audioeye/], tech:true },
];

// Mainline / liturgical Protestant (Lutheran, Methodist, Presbyterian, Episcopal):
// judged on Worship, Ministries, Faith Formation, Mission & Music — not "group finder / next steps".
export const RUBRIC_MAINLINE = [
  { key:'worship',   label:'Worship times & welcome', weight:14, why:'When is worship, and is a first-time visitor welcomed and oriented?',
    any:[/worship (times?|service|with us)/,/service times?/,/sunday (worship|service|morning)/,/visit(ing|or)?\b/,/welcome/,/\b\d{1,2}(:\d\d)?\s?(am|pm)\b/] },
  { key:'sermons',   label:'Sermons / Watch',         weight:10, why:'Livestream and a sermon archive reach members and seekers alike.',
    any:[/sermons?/,/messages\b/,/watch (online|live|now)/,/live ?stream/,/past services/,/media/] },
  { key:'formation', label:'Faith formation & youth', weight:12, why:'Sunday school, confirmation, children & youth — the discipleship backbone of a mainline church.',
    any:[/faith formation/,/sunday school/,/christian ?ed/,/confirmation/,/children/,/\byouth\b/,/preschool/,/nursery/] },
  { key:'ministries',label:'Ministries & belonging',  weight:10, why:'Ministries and small groups are where members grow together.',
    any:[/ministr/,/small groups?/,/fellowship/,/adult (formation|ed)/,/women|men|seniors/,/connect/] },
  { key:'mission',   label:'Mission & outreach',      weight:10, why:'Local and global mission is central to mainline identity.',
    any:[/mission(s)? ?(and|&)? ?outreach/,/outreach/,/serve\b/,/volunteer/,/global (mission|partner)/,/food (bank|pantry)/] },
  { key:'music',     label:'Music & worship arts',    weight:6,  why:'Choir, organ, and worship arts are a hallmark of the mainline tradition.',
    any:[/\bmusic\b/,/choir/,/organ/,/worship arts/,/bell(s)?|handbell/,/cantor|hymn/] },
  { key:'giving',    label:'Online giving',           weight:10, why:'Simple online giving sustains the congregation.',
    any:[/\bgive\b/,/giving/,/donate/,/pledge|stewardship|offering/,/tithe/] },
  { key:'care',      label:'Care & prayer',           weight:8,  why:'Pastoral care, prayer, and support meet people in hard seasons.',
    any:[/prayer/,/care|caring/,/pastoral/,/counsel/,/support group/,/bereavement|grief/] },
  { key:'about',     label:'Beliefs & denomination',  weight:6,  why:'Mainline visitors look for denominational identity and what the church believes.',
    any:[/about us|who we are/,/our beliefs?|what we believe/,/elca|lcms|umc|pc\(usa\)|pcusa|episcopal|methodist|lutheran|presbyterian/,/history|mission statement/] },
  { key:'life',      label:'Congregational life',     weight:8,  why:'An active calendar and events show a living congregation.',
    any:[/calendar/,/events?\b/,/register/,/newsletter|bulletin/,/fellowship/] },
  { key:'access',    label:'Accessible & solid',      weight:6,  why:'Accessibility, mobile, and HTTPS say everyone is welcome and the site is legit.',
    any:[/accessibility|userway|accessibe|audioeye/], tech:true },
];

// corpus = { labels:[], hrefs:[], text:'', https:bool, mobile:bool, a11y:bool }
// opts.tradition: 'catholic' | 'mainline' picks that rubric; default = contemporary RUBRIC.
export function scoreCongregation(corpus, opts={}){
  const RUB = opts.tradition === 'catholic' ? RUBRIC_CATHOLIC
            : opts.tradition === 'mainline' ? RUBRIC_MAINLINE : RUBRIC;
  const hay = ((corpus.labels||[]).join(' ') + ' ' + (corpus.hrefs||[]).join(' ') + ' ' + (corpus.text||''))
    .toLowerCase();
  const dims = RUB.map(d => {
    let hits = (d.any||[]).filter(re => re.test(hay));
    let found = hits.length > 0, partial = false, pts = 0, evidence = '';
    if (d.key === 'access'){
      // technical dimension: a11y widget + mobile + https, each ~1/3
      const a = corpus.a11y || /accessibility|userway|accessibe|audioeye/.test(hay);
      const parts = [a && 'accessibility', corpus.mobile && 'mobile', corpus.https && 'HTTPS'].filter(Boolean);
      pts = Math.round(d.weight * (parts.length/3)); found = parts.length>0; partial = parts.length<3 && parts.length>0;
      evidence = parts.join(', ') || '—';
    } else {
      // present if ≥1 strong nav/href hit; partial if only mentioned in body text
      const inNav = (corpus.labels||[]).concat(corpus.hrefs||[]).some(s => (d.any||[]).some(re=>re.test(String(s).toLowerCase())));
      if (found && inNav) { pts = d.weight; }
      else if (found)     { pts = Math.round(d.weight*0.5); partial = true; }
      evidence = hits.slice(0,2).map(re => (hay.match(re)||[''])[0].trim()).filter(Boolean).join(' · ') || '—';
    }
    return { key:d.key, label:d.label, weight:d.weight, why:d.why, found, partial, pts, evidence };
  });
  const score = dims.reduce((s,d)=>s+d.pts, 0);
  const grade = score>=85 ? 'Has it together' : score>=65 ? 'Solid, gaps to close'
              : score>=40 ? 'Real opportunity' : 'Wide open';
  return { score, grade, dims };
}

// Build a corpus from captured pages ({name:html}) + technical signals.
export function corpusFromPages(pages, cheerio, { https=true, mobile=true } = {}){
  const labels=[], hrefs=[]; let text='';
  let a11y=false;
  for (const html of Object.values(pages)){
    if (!html) continue;
    const $ = cheerio.load(html);
    $('a,button').each((_,e)=>{ const t=$(e).text().replace(/\s+/g,' ').trim(); if(t&&t.length<40) labels.push(t);
      const h=$(e).attr('href'); if(h) hrefs.push(h); });
    text += ' ' + $('body').text().replace(/\s+/g,' ').slice(0, 20000);
    if (/accessibility|userway|accessibe|audioeye/i.test(html)) a11y = true;
    if (/viewport/.test(html)) mobile = true;
  }
  return { labels:[...new Set(labels)], hrefs:[...new Set(hrefs)], text, https, mobile, a11y };
}
