import type { FastifyInstance } from "fastify";

import { getItemDetail } from "../../buyerapi.js";
import db, { insertWatched } from "../../db.js";

export default async function watchRoutes(f: FastifyInstance) {
  f.post("/", async (req, reply) => {
    const { itemId } = req.body as any;
    if (!itemId) return reply.code(400).send({ error: "itemId required" });
    const det: any = await getItemDetail(Number(itemId)).catch(() => null);
    if (!det) return reply.code(404).send({ error: "item not found" });
    insertWatched({
      itemId: Number(itemId),
      sellerId: det.sellerId ?? 0,
      categoryId: det.categoryId ?? 0,
      title: det.title ?? String(itemId),
      startTime: det.startTime ?? new Date().toISOString(),
      endTime: det.endTime ?? new Date().toISOString(),
      currentPrice: det.currentPrice ?? 0,
      minimumBid: det.minimumBid ?? 0,
      bidIncrement: det.bidIncrement ?? 1,
      imageURL: det.imageURL ?? undefined,
      catFullName: det.catFullName ?? undefined,
      categoryParentList: det.categoryParentList ?? undefined,
      pickupZip: undefined,
      zcta: undefined,
    });
    return { ok: true, itemId };
  });
  f.get("/", async (req) => {
    const q = req.query as any;
    const status = q.status || "open";
    const limit = Math.min(Number(q.limit || 50), 200);
    const rows = db
      .prepare(`SELECT * FROM watched_auctions WHERE status=? ORDER BY endTime ASC LIMIT ?`)
      .all(status, limit);
    return rows;
  });
  f.delete("/:id", async (req) => {
    const { id } = req.params as any;
    db.prepare(`UPDATE watched_auctions SET status='lost' WHERE itemId=?`).run(Number(id));
    return { ok: true };
  });
  f.post("/sync", async (req) => {
    // body: {category:"87", seller:"", low:"10", high:"500", desc:true} — calls catalog sharded sync (demo: single page)
    const { category, seller, low, high, desc } = (req.body as any) || {};
    const { api, itemListingBody } = await import("../../buyerapi.js");
    const body = itemListingBody({
      selectedCategoryIds: category || "87",
      categoryId: Number(category || 87),
      selectedSellerIds: seller || "",
      lowPrice: String(low || "10"),
      highPrice: String(high || "500"),
      searchDescriptions: desc ? "true" : "false",
      page: "1",
    });
    const { data } = await api.post("Search/ItemListing", body);
    let added = 0;
    for (const it of data.searchResults.items.slice(0, 20)) {
      try {
        insertWatched({
          itemId: it.itemId,
          sellerId: it.sellerId,
          categoryId: it.categoryId,
          title: it.title,
          startTime: it.startTime,
          endTime: it.endTime,
          currentPrice: it.currentPrice,
          minimumBid: it.minimumBid,
          imageURL: it.imageURL,
          catFullName: it.catFullName,
        });
        added++;
      } catch {}
    }
    return { added, total: data.searchResults.itemCount };
  });
}
