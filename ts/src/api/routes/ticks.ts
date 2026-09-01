import type { FastifyInstance } from "fastify";

import db from "../../db.js";
export default async function ticksRoutes(f: FastifyInstance) {
  f.get("/ticks/:itemId", async (req) => {
    const { itemId } = req.params as any;
    const q = req.query as any;
    const limit = Math.min(Number(q.limit || 100), 500);
    const rows = db
      .prepare(`SELECT * FROM price_ticks WHERE itemId=? ORDER BY ts DESC LIMIT ?`)
      .all(Number(itemId), limit);
    return rows;
  });
  f.get("/bids/:itemId", async (req) => {
    const { itemId } = req.params as any;
    const rows = db
      .prepare(`SELECT * FROM bids WHERE itemId=? ORDER BY ts DESC LIMIT 100`)
      .all(Number(itemId));
    return rows;
  });
  f.get("/history/closed", async (req) => {
    const q = req.query as any;
    const { api, itemListingBody } = await import("../../buyerapi.js");
    const body = itemListingBody({
      selectedCategoryIds: q.category || "87",
      categoryId: Number(q.category || 87),
      searchClosedAuctions: "true",
      closedAuctionDaysBack: String(q.days || "7"),
      page: "1",
    });
    const { data } = await api.post("Search/ItemListing", body);
    const prices = data.searchResults.items
      .map((i: any) => i.currentPrice)
      .sort((a: number, b: number) => a - b);
    const mid = prices[Math.floor(prices.length / 2)] ?? null;
    return {
      count: data.searchResults.itemCount,
      sample: data.searchResults.items.slice(0, 5),
      median: mid,
    };
  });
}
