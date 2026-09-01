// Closed-price histogram: nightly searchClosedAuctions=true cadb=30 per category → closedMedian*0.7 baseline
import { api, itemListingBody } from "./buyerapi.js";

export async function closedMedian(categoryId: string, daysBack = 30): Promise<number | null> {
  const body = itemListingBody({
    selectedCategoryIds: categoryId,
    categoryId: Number(categoryId) || 0,
    searchClosedAuctions: "true",
    closedAuctionDaysBack: String(daysBack),
    sortColumn: "1",
    page: "1",
    pageSize: "40",
  });
  const { data } = await api.post("Search/ItemListing", body);
  const items: any[] = data?.searchResults?.items ?? [];
  if (!items.length) return null;
  const prices = items.map((i) => i.currentPrice).sort((a, b) => a - b);
  const mid = Math.floor(prices.length / 2);
  return prices[mid];
}
