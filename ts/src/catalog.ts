#!/usr/bin/env tsx
// Sharded jewelry catalog → watched_auctions + items.ndjson
// Usage: npx tsx src/catalog.ts --jewelry --low 10 --high 5000 --desc true
import fs from "fs";

import { api, itemListingBody, getActiveSellers } from "./buyerapi.js";
import { cfg } from "./config.js";

async function fetchPage(over: Record<string, unknown>) {
  const body = itemListingBody(over);
  const { data } = await api.post("Search/ItemListing", body);
  return data as { searchResults: { items: any[]; itemCount: number }; maxTotalRecords: number };
}

async function main() {
  const sellers = await getActiveSellers(); // 163
  const catIds = cfg.jewelryCatIds; // ["87"]
  // Example: shard by seller + cat to bypass 10k
  let total = 0;
  const out = fs.createWriteStream("data/items.ndjson", { flags: "a" });
  for (const sid of sellers.slice(0, 3).map((s) => s.sellerId)) {
    // demo 3 sellers; remove slice for all
    for (const cid of catIds) {
      for (const desc of ["false", "true"]) {
        const res = await fetchPage({
          selectedSellerIds: String(sid),
          selectedCategoryIds: cid,
          categoryId: Number(cid),
          searchDescriptions: desc,
          page: "1",
        });
        console.log(
          `seller ${sid} cat ${cid} desc=${desc} total=${res.searchResults.itemCount} got=${res.searchResults.items.length}`,
        );
        for (const it of res.searchResults.items) {
          out.write(JSON.stringify({ ...it, _shard: `${sid}:${cid}:${desc}` }) + "\n");
          total++;
        }
        await new Promise((r) => setTimeout(r, cfg.throttleMs));
      }
    }
  }
  out.end();
  console.log(`wrote ${total} items to data/items.ndjson (shard demo 3 sellers)`);
}
main().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
