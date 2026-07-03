/* Sightline add-on intelligence — shared by the builder and checkout.
 * KITS: per-industry recommended add-on sets, derived from the attach-rate
 *   model (which add-ons each business type is most likely to choose).
 * KITMAP: prospect slug -> kit key, so a prospect lands with their likely
 *   add-ons pre-selected.
 * GROWTH: the Reviews + AI Assistant + Security bundle (the three
 *   highest-revenue add-ons) offered at a discount.
 * Exposed on window as SL_KITS / SL_KITMAP / SL_GROWTH. */
(function (w) {
  var KITS = {
    dental:     { label: "Dental",          ids: ["booking", "intake", "reviews", "security", "assistant"], hipaa: true },
    medical:    { label: "Medical",         ids: ["booking", "intake", "reviews", "security", "legal"],      hipaa: true },
    medspa:     { label: "Med Spa",         ids: ["booking", "reviews", "gallery", "payments", "intake"],    hipaa: true },
    law:        { label: "Law / Legal",     ids: ["booking", "intake", "legal", "reviews", "crm", "security"] },
    finance:    { label: "Finance / Pro",   ids: ["crm", "security", "legal", "booking", "reviews"] },
    home:       { label: "Home Services",   ids: ["booking", "reviews", "gallery", "payments", "crm"] },
    retail:     { label: "Retail / Shop",   ids: ["store", "payments", "shipping", "gallery", "reviews"] },
    faith:      { label: "Faith / Church",  ids: ["sermons", "payments", "gallery", "security"] },
    school:     { label: "School",          ids: ["booking", "gallery", "intake", "payments"] },
    restaurant: { label: "Restaurant",      ids: ["booking", "reviews", "gallery", "payments"] }
  };

  // The Growth bundle: three highest-revenue add-ons, discounted.
  var GROWTH = { id: "growth", ids: ["reviews", "assistant", "security"], price: 89, list: 117 };

  // slug -> kit, generated from data/prospects.json categories.
  var KITMAP = {"acaciadentalgroup-com":"dental","araoent-com":"medical","aspenfallslandscaping-com":"home","attorneysofhighlandsranch-com":"law","biondijewelry-com":"retail","buildabath-net":"home","castlerockcpa-com":"finance","cherryhillsdentist-com":"dental","clchr-org":"faith","coloradodermatology-com":"medical","coloradolendingteam-com":"finance","compfm-com":"medical","copelandfamilydental-com":"dental","cotitleescrow-com":"finance","denverfamilylawmatters-com":"law","elevatemyeyes-com":"medical","equippedchurch-net":"faith","firmmedspa-com":"medspa","griffithslawpc-com":"law","heidiosterobgyn-com":"medical","homesteadtc-com":"finance","hrcoc-org":"faith","kcmortgagecolorado-com":"finance","mckeanins-com":"finance","milehighsmilesandesthetics-com":"dental","missionhills-org":"faith","montessoriatlonetree-com":"school","myrkmhome-com":"home","new3c-org":"faith","niedermaninsurance-com":"finance","paramounttitle-com":"finance","paxchristi-org":"faith","rosslawcolorado-com":"law","smokyhillumc-org":"faith","southdenverobgyn-com":"medical","southwestheating-com":"home","stoneaspen-com":"home","summitchurch-online":"faith","thrivechurch-com":"faith","truebeautymedspa-com":"medspa","visitcrcc-org":"faith","wamboltwealth-com":"finance"};

  // Resolve a kit key from URL params: explicit ?industry= wins, else ?slug= lookup.
  function resolveKit(params) {
    var ind = (params.get("industry") || "").toLowerCase();
    if (KITS[ind]) return ind;
    var slug = params.get("slug") || "";
    return KITMAP[slug] || null;
  }

  w.SL_KITS = KITS;
  w.SL_KITMAP = KITMAP;
  w.SL_GROWTH = GROWTH;
  w.SL_resolveKit = resolveKit;
})(window);
