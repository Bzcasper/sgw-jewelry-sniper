#!/usr/bin/env tsx
// Sharded jewelry catalog → watched_auctions + items.ndjson
// Usage: npx tsx src/catalog.ts --jewelry --low 10 --high 5000 --desc true

import { api, getActiveSellers, itemListingBody } from "./buyerapi.js";
import { cfg } from "./config.js";
import db, { insertWatched } from "./db.js";

type Item = {
  itemId: number;
  sellerId: number;
  categoryId: number;
  title: string;
  currentPrice: number;
  numBids: number;
  minimumBid: number;
  startTime: string;
  endTime: string;
  imageURL: string;
  catFullName: string;
  categoryParentList?: string;
};

async function fetchPage(over: Record<string, unknown>): Promise<{
  searchResults: { items: Item[]; itemCount: number };
  maxTotalRecords: number;
}> {
  const body = itemListingBody(over);
  const { data } = await api.post("Search/ItemListing", body);
  return data;
}

function parseArgs(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = process.argv[i + 1]?.startsWith("--") ? "true" : (process.argv[++i] ?? "true");
      out[k] = v;
    }
  }
  return out;
}

async function getJewelryCatIds(): Promise<string[]> {
  try {
    const { data } = await api.get("Category/GetAllCategoryPageList");
    const cats: any[] = data?.data?.categories ?? [];
    const j = cats.find((c) => c.categoryName === "Shop All Categories")?.childCategories ?? cats;
    const jw = j.find((c: any) => c.categoryName === "Jewelry & Gemstones");
    if (jw?.mappedCatId) return [jw.mappedCatId];
  } catch {}
  return cfg.jewelryCatIds;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const low = args.low ?? cfg.lowPrice;
  const high = args.high ?? cfg.highPrice;
  const descFlag = args.desc ?? "true";
  const jewelryOnly = args.jewelry !== "false";

  const sellers = await getActiveSellers(); // 163
  const catIds = jewelryOnly ? await getJewelryCatIds() : [""];
  console.log(
    `sellers=${sellers.length} cats=${catIds.join(",")} low=${low} high=${high} desc=${descFlag}`,
  );

  let totalInserted = 0;
  let pages = 0;

  for (const sid of sellers) {
    for (const cid of catIds) {
      for (const desc of descFlag === "true" ? ["false", "true"] : [descFlag]) {
        let page = 1;
        while (true) {
          const res = await fetchPage({
            selectedSellerIds: String(sid.sellerId),
            selectedCategoryIds: cid,
            categoryId: Number(cid) || 0,
            lowPrice: String(low),
            highPrice: String(high),
            searchDescriptions: desc,
            page: String(page),
            sortColumn: "1",
          });
          const items = res.searchResults.items;
          if (!items.length) break;
          for (const it of items) {
            insertWatched({
              itemId: it.itemId,
              sellerId: it.sellerId,
              categoryId: it.categoryId,
              title: it.title,
              startTime: it.startTime,
              endTime: it.endTime,
              currentPrice: it.currentPrice,
              minimumBid: it.minimumBid,
              bidIncrement: (it as any).bidIncrement ?? 1,
              imageURL: it.imageURL,
              catFullName: it.catFullName,
              categoryParentList: (it as any).categoryParentList ?? undefined,
              pickupZip: undefined,
              zcta: undefined,
            });
            totalInserted++;
          }
          pages++;
          // Update watermark
          db.prepare(
            `INSERT OR REPLACE INTO shard_watermarks(shardKey,lastPage,lastItemCount,updatedAt) VALUES (?,?,?,?)`,
          ).run(
            `seller:${sid.sellerId}:cat:${cid}:desc:${desc}:sort:1`,
            page,
            res.searchResults.itemCount,
            new Date().toISOString(),
          );
          console.log(
            `  shard seller=${sid.sellerId} cat=${cid} desc=${desc} page=${page} got=${items.length} total=${res.searchResults.itemCount} max=${res.maxTotalRecords}`,
          );
          if (items.length < cfg.pageSize || page * cfg.pageSize >= res.maxTotalRecords) break;
          page++;
          await new Promise((r) => setTimeout(r, cfg.throttleMs));
        }
        await new Promise((r) => setTimeout(r, cfg.throttleMs));
      }
    }
    // For demo, limit to 3 sellers unless --all
    if (!args.all && sellers.indexOf(sid) >= 2) {
      console.log("demo limit 3 sellers — pass --all for full 163");
      break;
    }
  }
  console.log(`done pages=${pages} inserted=${totalInserted} → data/items.ndjson + sgw_jewelry.db`);
}

main().catch((e) => {
  console.error(e.response?.data ?? e.message);
  process.exit(1);
});
