// Demographics bonus + bidder expectation (SPEC §7)
export function demographicsBonus(richTownScore: number) {
  return richTownScore > 1.25 ? 1.1 : 1.0;
}
export function bidderScore(f: {
  lastSecondPct: number;
  avgMarkup: number;
  sellerAffinity: number;
  jewelryAffinity: number;
  recencyHours: number;
}) {
  const recencyDecay = Math.min(1, f.recencyHours / 72);
  const z =
    0.8 * f.lastSecondPct +
    0.6 * f.avgMarkup +
    0.5 * f.sellerAffinity +
    0.4 * f.jewelryAffinity -
    0.3 * recencyDecay;
  return 1 / (1 + Math.exp(-z)); // sigmoid
}
export function adjustMax(base: number, richScore: number, peerScore: number, bidIncrement = 1) {
  let m = base * demographicsBonus(richScore);
  if (peerScore > 0.6) m += bidIncrement;
  return Math.round(m * 100) / 100;
}
