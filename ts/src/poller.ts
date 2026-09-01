#!/usr/bin/env tsx
// Price poller: 30s last 10m for 1-5 watched auctions → price_ticks
// Usage: npx tsx src/poller.ts 275585046 275772810  (or --watched for DB)
import { getItemDetail, serverOffsetMs, showBidModal } from "./buyerapi.js";
import db, { insertPriceTick } from "./db.js";

async function pollIds(itemIds: number[], concurrency = 5): Promise<void> {
  const off = await serverOffsetMs().catch(() => 0);
  console.log(`offset ${off}ms, polling ${itemIds.length} ids`);
  // simple concurrency queue
  let idx = 0;
  async function worker(): Promise<void> {
    while (idx < itemIds.length) {
      const id = itemIds[idx++];
      try {
        const modal = await showBidModal(id);
        const det = await getItemDetail(id).catch(() => ({
          numberOfBids: 0,
          views: 0,
          serverTime: null,
        }));
        const tick = {
          itemId: id,
          ts: new Date(Date.now() + off).toISOString(),
          serverTime: det.serverTime ?? null,
          currentPrice: modal.currentPrice,
          minimumBid: modal.minimumBid,
          numBids: det.numberOfBids ?? 0,
          views: det.views ?? 0,
          offsetMs: off,
        };
        insertPriceTick(tick);
        console.log(tick);
      } catch (e: any) {
        console.error(`poll ${id}`, e.response?.data ?? e.message);
      }
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, itemIds.length) }, () => worker()));
}

function watchedIds(limit = 5): number[] {
  const rows = db
    .prepare(
      `SELECT itemId FROM watched_auctions WHERE status='open' AND endTime > datetime('now') ORDER BY endTime ASC LIMIT ?`,
    )
    .all(limit) as { itemId: number }[];
  return rows.map((r) => r.itemId);
}

const args = process.argv.slice(2);
if (args.includes("--watched")) {
  const ids = watchedIds(5);
  console.log("watched ids", ids);
  await pollIds(ids);
} else {
  const ids = args.map(Number).filter(Boolean);
  if (!ids.length) {
    console.log(
      "usage: npx tsx src/poller.ts 275585046 275772810  OR  npx tsx src/poller.ts --watched",
    );
    process.exit(0);
  }
  await pollIds(ids);
}
