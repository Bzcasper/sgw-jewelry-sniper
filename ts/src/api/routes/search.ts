import type { FastifyInstance } from "fastify";

import {
  api,
  itemListingBody,
  getItemDetail,
  getItemsByIds,
  calculateShipping,
} from "../../buyerapi.js";

export default async function searchRoutes(f: FastifyInstance) {
  f.get("/search", async (req) => {
    const q = req.query as any;
    const body = itemListingBody({
      searchText: q.text || "",
      selectedCategoryIds: q.category || "87",
      categoryId: Number(q.category || 87),
      lowPrice: String(q.low || "10"),
      highPrice: String(q.high || "500"),
      searchDescriptions: q.desc || "true",
      page: String(q.page || "1"),
      pageSize: String(q.pageSize || "40"),
      sortColumn: String(q.sort || "1"),
      searchClosedAuctions: q.closed || "false",
      selectedSellerIds: q.seller || "",
    });
    const { data } = await api.post("Search/ItemListing", body);
    return data;
  });
  f.get("/items/:id", async (req) => {
    const { id } = req.params as any;
    const detail = await getItemDetail(Number(id));
    const modal = await api
      .get(`ItemBid/ShowBidModal?itemId=${id}`)
      .then((r) => r.data)
      .catch(() => null);
    return { detail, modal };
  });
  f.get("/items/bulk", async (req) => {
    const ids = ((req.query as any).ids || "").split(",").map(Number).filter(Boolean).slice(0, 50);
    return getItemsByIds(ids);
  });
  f.post("/items/shipping", async (req) => {
    const { itemId, zip } = req.body as any;
    const html = await calculateShipping(Number(itemId), String(zip || "46226"));
    const m = html.match(/\$([0-9.]+).*GROUND/i);
    const ship = m ? Number(m[1]) : 0;
    const handling = html.includes("$2.00") ? 2 : 0;
    return { cost: ship + handling, html: html.slice(0, 800), ok: !html.includes("NOSERVICE") };
  });
  f.get("/categories", async () => {
    const { data } = await api.get("Category/GetAllCategoryPageList");
    return data;
  });
  f.get("/sellers", async () => {
    const { data } = await api.get("Search/GetActiveLocation");
    return data;
  });
}
