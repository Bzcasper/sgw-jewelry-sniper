import assert from "assert";
import {
  scoreDemographics,
  bidderExpectation,
  aggregatePeerThreat,
  jewelryFlipScore,
} from "../src/algorithm.js";

// Demographics: rich town
const demo = scoreDemographics({
  z: {
    medianHHIncome: 90000,
    perCapitaIncome: 40000,
    medianHomeValue: 300000,
    whitePct: 80,
    medianAge: 45,
    pct65plus: 20,
  },
  county: {
    medianHHIncome: 60000,
    perCapitaIncome: 30000,
    medianHomeValue: 180000,
    whitePct: 70,
    medianAge: 38,
    pct65plus: 14,
  },
  state: {
    medianHHIncome: 55000,
    perCapitaIncome: 28000,
    medianHomeValue: 170000,
    whitePct: 68,
    medianAge: 37,
    pct65plus: 13,
  },
});
assert(demo.flags.richTown, "richTown");
assert(demo.flags.oldTown, "oldTown");
assert(demo.bonus === 1.1, "bonus 1.1");
assert(demo.composite > 0.6, "composite high");
console.log("demo", demo);

// Bidder expectation: sniper
const exp = bidderExpectation(
  {
    bidsCount: 15,
    wins: 3,
    avgMarkup: 0.12,
    lastSecondPct: 0.8,
    sellerAffinity: 0.7,
    jewelryAffinity: 0.9,
    recencyHours: 2,
  },
  20,
  21,
);
assert(exp.pWillBid > 0.7, "pWillBid high for sniper");
assert(exp.confidence > 0.5, "confidence");
console.log("bidder", exp);

// Peer threat
const agg = aggregatePeerThreat([
  exp,
  { ...exp, pWillBid: 0.3, expectedMax: 22, expectedMarkup: 0.05, confidence: 0.4, reason: "" },
]);
assert(agg.threat === "high", "threat high");
console.log("peer", agg);

// Flip: undervalued jewelry in rich town, low peer
const flip = jewelryFlipScore({
  currentPrice: 15.99,
  minimumBid: 16.99,
  shippingCost: 5,
  closedMedian: 40,
  demo,
  peer: { maxP: 0.3, threat: "low" },
  numBids: 1,
  views: 30,
});
assert(flip.shouldBid, "shouldBid true when 28 -21=7 margin");
assert(flip.maxSuggestion > 15.99, "maxSuggestion");
console.log("flip", flip);

// High peer threat reduces flip
const flip2 = jewelryFlipScore({
  currentPrice: 15.99,
  minimumBid: 16.99,
  shippingCost: 5,
  closedMedian: 40,
  demo,
  peer: { maxP: 0.8, threat: "high" },
  numBids: 1,
  views: 30,
});
assert(flip2.adjFlip < flip.adjFlip, "peer penalty");

console.log("algorithm tests ok");
