// Bid-history ingest → bids + bidders
// Probe endpoints; live via frx net_capture confirmed anon vs Bearer + masked a***b
import { api } from "./buyerapi.js";
import db from "./db.js";

export async function fetchBidHistory(itemId: number): Promise<any | null> {
  const candidates = [
    `ItemDetail/GetBidHistory?itemId=${itemId}`,
    `ItemBid/GetBidHistory?itemId=${itemId}`,
    `Search/GetBidHistory?itemId=${itemId}`,
  ];
  for (const path of candidates) {
    try {
      const { data } = await api.get(path);
      console.log(`hit ${path}`, JSON.stringify(data).slice(0, 800));
      return data;
    } catch {
      // 404 → next
    }
  }
  console.warn(`no bid history endpoint anon for ${itemId} — try with Bearer`);
  return null;
}

export function aggregate(
  bids: {
    bidderUsername: string;
    bidAmount: number;
    minimumBid: number;
    ts: string;
    endTime: string;
  }[],
): {
  lastSecondPct: number;
  avgMarkup: number;
} {
  if (!bids.length) return { lastSecondPct: 0, avgMarkup: 0 };
  const lastSecond =
    bids.filter((b) => Date.parse(b.endTime) - Date.parse(b.ts) < 60000).length / bids.length;
  const avgMarkup =
    bids.reduce((a, b) => a + (b.bidAmount - b.minimumBid) / b.minimumBid, 0) / bids.length;
  return { lastSecondPct: lastSecond, avgMarkup };
}

export function upsertBids(
  itemId: number,
  rows: {
    bidderUsername: string;
    bidAmount: number;
    ts: string;
    endTime: string;
    isWinning?: boolean;
  }[],
): void {
  const ins = db.prepare(
    `INSERT INTO bids(itemId,bidderUsername,bidAmount,ts,isWinning,isLastSecond) VALUES (@itemId,@bidderUsername,@bidAmount,@ts,@isWinning,@isLastSecond)`,
  );
  const tx = db.transaction((rs: typeof rows) => {
    for (const r of rs) {
      const isLast = Date.parse(r.endTime) - Date.parse(r.ts) < 60000 ? 1 : 0;
      ins.run({
        itemId,
        bidderUsername: r.bidderUsername,
        bidAmount: r.bidAmount,
        ts: r.ts,
        isWinning: r.isWinning ? 1 : 0,
        isLastSecond: isLast,
      });
    }
  });
  tx(rows);
}
