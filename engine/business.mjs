// ─────────────────────────────────────────────────────────────────────────────
// Business-Readiness rubric — the local-service-business analog of Congregation-
// Readiness. Scores what makes a local business site actually CONVERT a searcher
// into a booked customer: booking, phone, services, reviews/proof, trust, hours/map,
// a new-customer offer, results photos, financing, and technical solidity.
// Tuned for high-value local verticals (dental, law, medspa, home services).
// ─────────────────────────────────────────────────────────────────────────────
import { corpusFromPages } from './congregation.mjs';   // reuse the corpus builder

export const BUSINESS_RUBRIC = [
  { key:'book',    label:'Book / request appointment', weight:16, why:'The #1 conversion action — online booking or a request-appointment form turns a visitor into revenue.',
    any:[/book (now|online|an appointment|a consult)/,/request (an )?appointment/,/schedule (online|now|a )/,/make an appointment/,/book a (call|consult|visit)/,/online scheduling/] },
  { key:'call',    label:'Call / contact prominent',   weight:10, why:'A visible phone number + clear contact path captures the callers who won\'t fill a form.',
    any:[/\b(call|text) us\b/,/\(\d{3}\)\s?\d{3}-\d{4}/,/\d{3}-\d{3}-\d{4}/,/tel:/,/contact us/] },
  { key:'services',label:'Services / what we do',      weight:12, why:'Clear services (and for whom) is how a searcher confirms you solve their problem.',
    any:[/services/,/what we (do|offer|treat)/,/our (services|practice|treatments|practice areas)/,/procedures/,/specialties/,/practice areas/] },
  { key:'reviews', label:'Reviews & social proof',     weight:14, why:'~9 in 10 people read reviews before choosing a local business — star ratings/testimonials on-site convert.',
    any:[/reviews?\b/,/testimonials?/,/\d(\.\d)?\s?stars?/,/★|⭐/,/google reviews/,/what (our )?(patients|clients|customers) say/,/5[- ]star/] },
  { key:'trust',   label:'Team & credentials',         weight:10, why:'Meet-the-team, credentials, awards and an about story build the trust a service purchase requires.',
    any:[/meet (the|our) (team|doctor|dentist|attorney|staff)/,/our (team|doctors|attorneys|providers|staff)/,/about us/,/board[- ]certified/,/award|top (doctor|dentist|lawyer)|best of/,/credentials|experience/] },
  { key:'location',label:'Hours, location & map',      weight:8,  why:'Hours, address, and a map are table-stakes for a local visit.',
    any:[/hours/,/directions/,/\b(mon|tue|wed|thu|fri)[a-z]*\s*[-–]\s*(mon|tue|wed|thu|fri|sat|sun)/,/map|google maps/,/\d{1,5}\s+[A-Za-z].+(st|street|ave|avenue|rd|road|blvd|suite|ste)\b/i] },
  { key:'offer',   label:'New-customer offer',         weight:10, why:'A new-patient special / free consult is the hook that turns comparison-shoppers into bookings.',
    any:[/new (patient|client)s?\s*(special|offer|welcome)?/,/free (consult|consultation|exam|estimate|quote|case (review|evaluation))/,/\$\d+\s*(off|new patient|exam|cleaning)/,/first (visit|time)/,/special offer/] },
  { key:'photos',  label:'Photos / results',           weight:8,  why:'Real photos (office, team, before/after results) prove quality far better than stock.',
    any:[/before (and|&) after/,/gallery/,/results/,/smile gallery/,/case (results|studies)/,/our (office|work|results)/] },
  { key:'money',   label:'Financing / insurance / pricing', weight:6, why:'Insurance accepted, financing, or pricing transparency removes the biggest hesitation.',
    any:[/insurance/,/financing/,/payment (plans|options)/,/we accept/,/in[- ]network/,/pricing|fees|cost/,/care ?credit|affordable/] },
  { key:'access',  label:'Fast, mobile & secure',      weight:6,  why:'Mobile, HTTPS, and accessibility decide whether a phone searcher stays or bounces.',
    any:[/accessibility|userway|accessibe|audioeye/], tech:true },
];

export function scoreBusiness(corpus){
  const hay = ((corpus.labels||[]).join(' ')+' '+(corpus.hrefs||[]).join(' ')+' '+(corpus.text||'')).toLowerCase();
  const dims = BUSINESS_RUBRIC.map(d=>{
    let hits=(d.any||[]).filter(re=>re.test(hay)); let found=hits.length>0, partial=false, pts=0, evidence='';
    if(d.key==='access'){
      const a=corpus.a11y||/accessibility|userway|accessibe|audioeye/.test(hay);
      const parts=[a&&'accessibility',corpus.mobile&&'mobile',corpus.https&&'HTTPS'].filter(Boolean);
      pts=Math.round(d.weight*(parts.length/3)); found=parts.length>0; partial=parts.length<3&&parts.length>0; evidence=parts.join(', ')||'—';
    } else {
      const inNav=(corpus.labels||[]).concat(corpus.hrefs||[]).some(s=>(d.any||[]).some(re=>re.test(String(s).toLowerCase())));
      if(found&&inNav) pts=d.weight; else if(found){pts=Math.round(d.weight*0.5);partial=true;}
      evidence=hits.slice(0,2).map(re=>(hay.match(re)||[''])[0].trim()).filter(Boolean).join(' · ')||'—';
    }
    return {key:d.key,label:d.label,weight:d.weight,why:d.why,found,partial,pts,evidence};
  });
  const score=dims.reduce((s,d)=>s+d.pts,0);
  const grade=score>=80?'Converts well':score>=60?'Leaks leads':score>=40?'Real opportunity':'Wide open';
  return {score,grade,dims};
}
export { corpusFromPages };
