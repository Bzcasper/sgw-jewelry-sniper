#!/usr/bin/env tsx
// Orchestrator: catalog → enrich → poller → scoring → sniper queue (M5 closed loop)
// Usage: npx tsx src/run_pipeline.ts --jewelry --max 30 --zip 46226

import { itemListingBody, api } from "./buyerapi.js";
import { insertWatched } from "./db.js";
import { shippingGate } from "./shipping.js";
import { demographicsBonus } from "./scoring.js";
import { closedMedian } from "./histogram.js";

async function main() {
  const maxArg = Number(process.env.MAX_BID || 30);
  const zip = process.env.ZIP || "46226";
  console.log("pipeline start jewelry max", maxArg, "zip", zip);

  // 1. Scan 1 page jewelry sample (category 87) to populate watched
  const body = itemListingBody({
    selectedCategoryIds: "87",
    categoryId: 87,
    lowPrice: "10",
    highPrice: "500",
    searchDescriptions: "true",
    page: "1",
  });
  const { data } = await api.post("Search/ItemListing", body);
  const items: any[] = data.searchResults.items.slice(0, 10);
  console.log(`found ${items.length} jewelry sample / total ${data.searchResults.itemCount}`);

  // 2. Shipping gate + demographics bonus (mock richTownScore 1.3 for demo)
  const richTownScore = 1.3;
  const bonus = demographicsBonus(richTownScore);
  const median = await closedMedian("87", 7);
  console.log(`closedMedian jewelry 87 = ${median}, bonus=${bonus}`);

  const queue: { itemId: number; sellerId: number; max: number }[] = [];
  for (const it of items) {
    const gate = await shippingGate(it.itemId, it.currentPrice, zip).catch(() => ({
      ok: true,
      cost: 0,
      ratio: 0,
    }));
    if (!gate.ok) {
      console.log(`skip ${it.itemId} shipping ${gate.cost} ratio ${gate.ratio} >30% or NOSERVICE`);
      continue;
    }
    const baseMax = maxArg;
    const adjMax = Math.round(baseMax * bonus * 100) / 100;
    // Insert watched
    insertWatched({
      itemId: it.itemId,
      sellerId: it.sellerId,
      categoryId: it.categoryId,
      title: it.title,
      startTime: it.startTime,
      endTime: it.endTime,
      currentPrice: it.currentPrice,
      minimumBid: it.minimumBid,
      bidIncrement: 1,
      imageURL: it.imageURL,
      catFullName: it.catFullName,
      categoryParentList: it.categoryParentList,
      pickupZip: zip,
      zcta: undefined, // demographics backfill M1.3 will populate; FK allows null
    });
    queue.push({ itemId: it.itemId, sellerId: it.sellerId, max: adjMax });
    console.log(
      `queue ${it.itemId} ${it.title.slice(0, 50)} cur ${it.currentPrice} max ${adjMax} ship ${gate.cost}`,
    );
    if (queue.length >= 5) break; // cap 1-5 per spec
  }

  console.log(`\n=== SNIPER QUEUE (1-5 cap) ===`);
  console.log(queue);
  console.log(
    `\nTo snipe: BEARER=... ITEMS=${queue.map((q) => `${q.itemId}:${q.max}`).join(",")} make snipe-ts`,
  );
  console.log(`Or MAX_BIDS_JSON='${JSON.stringify(queue)}' cargo run --release`);
  // Also emit scoring hint
  console.log(
    `\nDemographics: richTownScore ${richTownScore} → bonus ${bonus} applied. Closed median ${median} → 0.7*${median}=${median ? Math.round(median * 0.7 * 100) / 100 : "n/a"} baseline.`,
  );
}

main().catch((e) => {
  console.error(e.response?.data ?? e.message);
  process.exit(1);
});
