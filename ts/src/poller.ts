#!/usr/bin/env tsx
// Price poller: 30s last 10m for 1-5 watched auctions → price_ticks
import { showBidModal, getItemDetail, serverOffsetMs } from "./buyerapi.js";
import fs from "fs";

async function poll(itemIds:number[]) {
  const off = await serverOffsetMs().catch(()=>0);
  for (const id of itemIds) {
    const modal = await showBidModal(id);
    const det = await getItemDetail(id).catch(()=>({ views:0 }));
    const tick = { itemId:id, ts:new Date(Date.now()+off).toISOString(), currentPrice: modal.currentPrice, minimumBid: modal.minimumBid, numBids: (det as any).numberOfBids ?? modal.quantity, views: (det as any).views ?? 0, offsetMs: off };
    fs.appendFileSync("data/price_ticks.ndjson", JSON.stringify(tick)+"\n");
    console.log(tick);
    await new Promise(r=>setTimeout(r, 600));
  }
}
const ids = process.argv.slice(2).map(Number).filter(Boolean);
if (ids.length) poll(ids).catch(console.error);
else console.log("usage: npx tsx src/poller.ts 275585046 275772810");
