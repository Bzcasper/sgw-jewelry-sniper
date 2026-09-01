#!/usr/bin/env tsx
// Orchestrator: catalog → enrich → poller → scoring → sniper queue (M5 closed loop)
// Usage: npx tsx src/run_pipeline.ts --jewelry --max 30 --zip 46226

import { jewelryFlipScore, scoreDemographics } from "./algorithm.js";
import { api, itemListingBody } from "./buyerapi.js";
import { insertWatched } from "./db.js";
import { closedMedian } from "./histogram.js";
import { shippingGate } from "./shipping.js";

async function main(): Promise<void> {
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

  // 2. Demographics mock for demo (real: fetch ACS for zip → county → state)
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
  const median = await closedMedian("87", 7);
  console.log(
    `closedMedian jewelry 87 = ${median}, demo composite ${demo.composite} bonus ${demo.bonus} richTown ${demo.flags.richTown}`,
  );

  const queue: { itemId: number; sellerId: number; max: number; reason: string }[] = [];
  for (const it of items) {
    const gate = await shippingGate(it.itemId, it.currentPrice, zip).catch(() => ({
      ok: true,
      cost: 0,
      ratio: 0,
      html: "",
    }));
    if (!gate.ok) {
      console.log(`skip ${it.itemId} shipping ${gate.cost} ratio ${gate.ratio} >30% or NOSERVICE`);
      continue;
    }
    const flip = jewelryFlipScore({
      currentPrice: it.currentPrice,
      minimumBid: it.minimumBid,
      shippingCost: gate.cost,
      closedMedian: median,
      demo,
      peer: { maxP: 0.3, threat: "low" }, // real: aggregatePeerThreat from bidder expectations
      numBids: it.numBids ?? 0,
      views: (it as any).views ?? 0,
    });

    if (!flip.shouldBid) {
      console.log(
        `note ${it.itemId} flip ${flip.reason} maxSuggestion ${flip.maxSuggestion} (still queued for demo)`,
      );
      // keep for demo — real would skip; comment out to enforce strict
    }
    const max = Math.min(flip.maxSuggestion, maxArg * demo.bonus);
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
      zcta: undefined,
    });
    queue.push({
      itemId: it.itemId,
      sellerId: it.sellerId,
      max: Math.round(max * 100) / 100,
      reason: flip.reason,
    });
    console.log(
      `queue ${it.itemId} ${it.title.slice(0, 50)} cur ${it.currentPrice} flip ${flip.reason} max ${max} ship ${gate.cost}`,
    );
    if (queue.length >= 5) break;
  }

  console.log(`\n=== SNIPER QUEUE (1-5 cap, algorithm-scored) ===`);
  console.log(queue);
  console.log(
    `\nTo snipe: BEARER=... ITEMS=${queue.map((q) => `${q.itemId}:${q.max}`).join(",")} make snipe-ts`,
  );
  console.log(
    `Or MAX_BIDS_JSON='${JSON.stringify(queue.map((q) => ({ itemId: q.itemId, sellerId: q.sellerId, max: q.max })))}' cargo run --release`,
  );
}

main().catch((e: any) => {
  console.error(e.response?.data ?? e.message);
  process.exit(1);
});
