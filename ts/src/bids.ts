// Bid-history ingest → bids + bidders
// Probe: try GET ItemBid/GetBidHistory?itemId= → live via frx-isolated net_capture to confirm anon vs Bearer + masked a***b
import { api } from "./buyerapi.js";

export async function fetchBidHistory(itemId:number) {
  for (const path of [`ItemDetail/GetBidHistory?itemId=${itemId}`, `ItemBid/GetBidHistory?itemId=${itemId}`, `Search/GetBidHistory?itemId=${itemId}`]) {
    try {
      const { data } = await api.get(path);
      console.log(`hit ${path}`, JSON.stringify(data).slice(0,1200));
      return data;
    } catch (e:any) { /* 404 → next */ }
  }
  console.warn("no bid history endpoint anon — try with Bearer");
  return null;
}
// Aggregate bidders: lastSecondPct, avgMarkup
export function aggregate(bids:{bidderUsername:string; bidAmount:number; minimumBid:number; ts:string; endTime:string}[]) {
  const lastSecond = bids.filter(b=> Date.parse(b.endTime)-Date.parse(b.ts) < 60000).length / bids.length;
  const avgMarkup = bids.reduce((a,b)=> a + (b.bidAmount-b.minimumBid)/b.minimumBid, 0)/bids.length;
  return { lastSecondPct: lastSecond, avgMarkupOverMin: avgMarkup };
}
