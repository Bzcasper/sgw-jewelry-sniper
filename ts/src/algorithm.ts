/**
 * Algorithm — Jewelry sniper core
 * - Demographics (rich town / surrounding / white / old / composite)
 * - Bidder expectation (price action + username history → P(will bid) + expectedMax)
 * - Jewelry flip scoring + max suggestion
 *
 * Pure functions, no I/O. Tested in tests/algorithm.test.ts.
 * Spec §7.1-7.3, docs/CENSUS-DEEP-DIVE.md
 */

export type DemoRaw = {
  medianHHIncome: number; // B19013
  perCapitaIncome: number; // B19301
  medianHomeValue: number; // B25077
  whitePct: number; // 0-100
  medianAge: number;
  pct65plus?: number; // 0-100
};

export type DemoInput = {
  z: DemoRaw;
  county: DemoRaw;
  state: DemoRaw;
};

export type DemoScore = {
  richTownScore: number;
  richSurroundingScore: number;
  homeValueRatio: number;
  whitePct: number;
  medianAge: number;
  pct65plus: number;
  flags: {
    richTown: boolean;
    richSurrounding: boolean;
    oldTown: boolean;
    whiteTown: boolean;
    highValueTown: boolean;
  };
  composite: number; // 0-1 jewelry appetite
  bonus: number; // 1.0, 1.05, 1.10
  fetchedAt: string;
};

export function scoreDemographics(input: DemoInput): DemoScore {
  const { z, county, state } = input;
  const richTownScore = county.medianHHIncome ? z.medianHHIncome / county.medianHHIncome : 1;
  const richSurroundingScore = state.medianHHIncome
    ? county.medianHHIncome / state.medianHHIncome
    : 1;
  const homeValueRatio = county.medianHomeValue ? z.medianHomeValue / county.medianHomeValue : 1;
  const whitePct = z.whitePct;
  const medianAge = z.medianAge;
  const pct65 = z.pct65plus ?? (medianAge > 42 ? 18 : 12);

  const richTown = richTownScore > 1.25 || homeValueRatio > 1.3;
  const richSurrounding = richSurroundingScore > 1.15;
  const oldTown = medianAge > 42 || pct65 > 18;
  const whiteTown = whitePct > 65;
  const highValueTown = z.medianHomeValue > 250000;

  // Composite jewelry appetite: rich + old + white + home value
  // Weights tuned for estate jewelry (rich+old most important)
  const normRich = Math.min(1, Math.max(0, (richTownScore - 0.8) / 0.6)); // 0.8..1.4 → 0..1
  const normSur = Math.min(1, Math.max(0, (richSurroundingScore - 0.9) / 0.4));
  const normWhite = whitePct / 100;
  const normAge = Math.min(1, medianAge / 60);
  const normHome = Math.min(1, Math.log(Math.max(1, z.medianHHIncome / 30000)) / Math.log(3)); // 30k→0, 90k→1

  const composite =
    0.35 * normRich + 0.2 * normSur + 0.15 * normWhite + 0.15 * normAge + 0.15 * normHome;

  let bonus = 1.0;
  if (composite > 0.75 || richTown) bonus = 1.1;
  else if (composite > 0.55) bonus = 1.05;

  return {
    richTownScore,
    richSurroundingScore,
    homeValueRatio,
    whitePct,
    medianAge,
    pct65plus: pct65,
    flags: { richTown, richSurrounding, oldTown, whiteTown, highValueTown },
    composite: Math.round(composite * 1000) / 1000,
    bonus,
    fetchedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
export type BidderFeatures = {
  bidsCount: number;
  wins: number;
  avgMarkup: number; // (bid - min)/min avg, 0.1 = 10%
  lastSecondPct: number; // 0-1
  sellerAffinity: number; // 0-1
  jewelryAffinity: number; // 0-1
  recencyHours: number;
  winRate?: number;
};

export type BidderExpectation = {
  pWillBid: number; // 0-1
  expectedMarkup: number;
  expectedMax: number; // currentPrice * (1+avgMarkup)
  confidence: number; // 0-1 based on bidsCount
  reason: string;
};

export function bidderExpectation(
  f: BidderFeatures,
  currentPrice: number,
  _currentMinimum: number,
): BidderExpectation {
  const winRate = f.winRate ?? (f.bidsCount ? f.wins / f.bidsCount : 0);
  const recencyDecay = Math.min(1, f.recencyHours / 72);
  const sampleConfidence = Math.min(1, f.bidsCount / 20); // 20 bids = full confidence

  // SPEC §7.2 but with winRate term
  const z =
    0.8 * f.lastSecondPct +
    0.6 * f.avgMarkup +
    0.5 * f.sellerAffinity +
    0.4 * f.jewelryAffinity -
    0.3 * recencyDecay +
    0.2 * winRate;

  const pWillBid = 1 / (1 + Math.exp(-z));
  const expectedMarkup = f.avgMarkup || 0.05;
  const expectedMax = currentPrice * (1 + expectedMarkup);

  // If high lastSecondPct but low recency, they are sniper — high threat in last 60s
  const confidence = sampleConfidence * (f.bidsCount > 5 ? 0.9 : 0.5 + f.bidsCount * 0.08);

  let reason = "";
  if (f.lastSecondPct > 0.6) reason += "sniper ";
  if (f.sellerAffinity > 0.5) reason += "seller-loyal ";
  if (f.jewelryAffinity > 0.6) reason += "jewelry-focused ";
  if (recencyDecay < 0.2) reason += "active ";
  if (!reason) reason = "baseline";

  return {
    pWillBid: Math.round(pWillBid * 1000) / 1000,
    expectedMarkup: Math.round(expectedMarkup * 1000) / 1000,
    expectedMax: Math.round(expectedMax * 100) / 100,
    confidence: Math.round(confidence * 1000) / 1000,
    reason: reason.trim(),
  };
}

// Aggregate multiple peers on same item
export function aggregatePeerThreat(expectations: BidderExpectation[]): {
  maxP: number;
  avgExpectedMax: number;
  threat: "low" | "med" | "high";
} {
  if (!expectations.length) return { maxP: 0, avgExpectedMax: 0, threat: "low" };
  const maxP = Math.max(...expectations.map((e) => e.pWillBid));
  const avgExpectedMax = expectations.reduce((a, e) => a + e.expectedMax, 0) / expectations.length;
  const threat = maxP > 0.7 ? "high" : maxP > 0.4 ? "med" : "low";
  return {
    maxP: Math.round(maxP * 1000) / 1000,
    avgExpectedMax: Math.round(avgExpectedMax * 100) / 100,
    threat,
  };
}

// ---------------------------------------------------------------------------
export type FlipInput = {
  currentPrice: number;
  minimumBid: number;
  shippingCost: number;
  closedMedian: number | null; // 0.7 baseline if null -> currentPrice*1.5
  demo: DemoScore;
  peer: { maxP: number; threat: string };
  numBids: number;
  views: number;
};

export type FlipScore = {
  baseline: number; // closedMedian*0.7 or fallback
  landedCost: number;
  rawFlip: number; // (baseline - landed)/baseline  0-1
  adjFlip: number; // * bonus - threat penalty
  maxSuggestion: number;
  reason: string;
  shouldBid: boolean;
};

export function jewelryFlipScore(input: FlipInput): FlipScore {
  const baseline = input.closedMedian ? input.closedMedian * 0.7 : input.currentPrice * 1.5;
  const landedCost = input.currentPrice + input.shippingCost;
  const rawFlip = baseline ? (baseline - landedCost) / baseline : 0;

  // Demographics bonus
  let adjFlip = rawFlip * input.demo.bonus;

  // Peer pressure penalty: high threat reduces flip by 15%
  if (input.peer.threat === "high") adjFlip *= 0.85;
  else if (input.peer.threat === "med") adjFlip *= 0.92;

  // Low competition bonus: <2 bids + low views (<50) + ending soon is good
  if (input.numBids < 2 && input.views < 50) adjFlip += 0.05;

  adjFlip = Math.round(adjFlip * 1000) / 1000;

  // Max suggestion: capped to baseline - shipping, floored to minimumBid, never exceed baseline
  let maxSuggestion = baseline - input.shippingCost;
  maxSuggestion = Math.max(input.minimumBid, Math.min(maxSuggestion, baseline));
  // Apply demo bonus to max but cap
  maxSuggestion = Math.min(maxSuggestion, input.currentPrice * 2); // safety
  maxSuggestion = Math.round(maxSuggestion * 100) / 100;

  const shouldBid = adjFlip > -0.05 && maxSuggestion >= input.minimumBid; // jewelry: allow near-median when richTown

  let reason = `raw ${Math.round(rawFlip * 100)}% adj ${Math.round(adjFlip * 100)}%`;
  if (input.demo.flags.richTown) reason += " richTown";
  if (input.peer.threat === "high") reason += " highPeer";
  if (!shouldBid) reason += " below threshold";

  return {
    baseline: Math.round(baseline * 100) / 100,
    landedCost: Math.round(landedCost * 100) / 100,
    rawFlip: Math.round(rawFlip * 1000) / 1000,
    adjFlip,
    maxSuggestion,
    reason,
    shouldBid,
  };
}
