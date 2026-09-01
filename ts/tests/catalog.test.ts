import { itemListingBody } from "../src/buyerapi.js";
import { demographicsBonus, bidderScore } from "../src/scoring.js";
import assert from "assert";

// RULE #1: STRING booleans
const b = itemListingBody({ searchDescriptions: "true" } as any);
assert.strictEqual(b.searchDescriptions, "true");
assert.strictEqual(b.isSize, false); // false stays bool, "false" strings elsewhere
assert.strictEqual(typeof b.searchPickupOnly, "string");

// scoring
assert.strictEqual(demographicsBonus(1.3), 1.1);
assert.strictEqual(demographicsBonus(1.1), 1.0);
const s = bidderScore({
  lastSecondPct: 0.8,
  avgMarkup: 0.1,
  sellerAffinity: 0.5,
  jewelryAffinity: 0.7,
  recencyHours: 2,
});
assert(s > 0.5 && s < 0.9, "sigmoid range");

console.log("tests ok");
