import assert from "node:assert/strict";
import { assessPeerSet, scorePeer } from "../api/_peer_quality.js";

// 1) Remodeling peers must reject storage, print/copy, and large retail contamination.
{
  const peers = [
    { name: "Front Range Construction", domain: "frontrangeconstruction.com" },
    { name: "Kitchen & Bath Design Build", domain: "kitchenbathdesignbuild.com" },
    { name: "Colorado Home Remodeling", domain: "coloradohomeremodeling.com" },
    { name: "Mini U Storage", domain: "miniustorage.com" },
    { name: "Print & Copy Centers", domain: "printcopycenters.com" },
    { name: "The Home Depot", domain: "homedepot.com" },
  ];
  const set = assessPeerSet("Kitchen and bath remodeling", peers);
  assert.equal(set.confidence, "medium");
  assert.equal(set.eligible_count, 3);
  assert.equal(set.suppressed_count, 3);
  assert.ok(set.eligible.every((p) => /construction|designbuild|remodeling/.test(p.domain)));
}

// 2) Optometry peers must reject dental, chiropractic, and lodging mismatches.
{
  const peers = [
    { name: "Highlands Ranch Vision Center", domain: "hrvision.com" },
    { name: "Clear View Eye Care", domain: "clearvieweyecare.com" },
    { name: "Mountain Optical", domain: "mountainoptical.com" },
    { name: "Peak Dental", domain: "peakdental.com" },
    { name: "South Metro Chiropractic", domain: "southmetrochiro.com" },
    { name: "Highlands Ranch Hotel", domain: "highlandsranchhotel.com" },
  ];
  const set = assessPeerSet("Optometry", peers);
  assert.equal(set.confidence, "medium");
  assert.equal(set.eligible_count, 3);
  assert.equal(set.suppressed_count, 3);
}

// 3) Discovery evidence can preserve a legitimate brand whose name is ambiguous.
{
  const set = assessPeerSet("Optometry", [
    {
      name: "LensCrafters",
      domain: "lenscrafters.com",
      peer_quality: {
        score: 88,
        confidence: "high",
        eligible: true,
        reasons: ["specific category tag"],
      },
    },
  ]);
  assert.equal(set.eligible_count, 1);
  assert.equal(set.eligible[0].peer_quality.score, 88);
}

// 4) A broad do-it-yourself retail tag is not enough to make a national retailer
// a remodeling peer.
{
  const quality = scorePeer(
    "Home remodeling",
    { name: "The Home Depot", domain: "homedepot.com", distance_km: 3 },
    { tags: { shop: "doityourself" }, filters: [["craft", "builder"], ["shop", "doityourself"]] },
  );
  assert.equal(quality.eligible, false);
  assert.equal(quality.confidence, "low");
}

// 5) Three credible peers are required before the set reaches medium confidence.
{
  const weak = assessPeerSet("Dental practice", [
    { name: "Smile Dental", domain: "smiledental.com" },
    { name: "Town Dentist", domain: "towndentist.com" },
  ]);
  assert.equal(weak.confidence, "low");
  assert.equal(weak.eligible_count, 2);
}

console.log("Peer-quality self-test passed: category relevance, contamination suppression, discovery evidence, and confidence thresholds.");
