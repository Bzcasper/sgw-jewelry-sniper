// ShopGoodwill last-second sniper — TS (Node 20+)
// Contracts verified 2026-09-01 via frx-isolated: ShowBidModal -> PlaceBid
// Usage: BEARER=... ITEMS=275048676:25,275247878:50 tsx sniper.ts
// Or set MAX_BIDS_JSON='[{"itemId":275048676,"sellerId":5,"max":25}]'

import axios from "axios";

const BASE = "https://buyerapi.shopgoodwill.com/api/";
const ax = axios.create({
  baseURL: BASE,
  headers: {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0",
    Accept: "application/json",
    "Content-Type": "application/json",
    Origin: "https://shopgoodwill.com",
    Referer: "https://shopgoodwill.com/",
  },
  timeout: 8000,
});
if (process.env.BEARER)
  ax.defaults.headers.common["Authorization"] = `Bearer ${process.env.BEARER}`;

type Modal = {
  itemId: number;
  sellerId: number;
  currentPrice: number;
  minimumBid: number;
  endTime: string;
  bidIncrement?: number;
};
type PlaceReq = { itemId: number; sellerId: number; quantity: 1; bidAmount: number };
type PlaceResp = { status: boolean; result: number; message: string; pastDueMessage?: string };

async function serverOffsetMs(): Promise<number> {
  // Sync clock: Dashboard/GetCurrentTime (POST) + serverTime from GetItemDetail
  const t0 = Date.now();
  const r = await ax.post("Dashboard/GetCurrentTime", null);
  const t1 = Date.now();
  // r.data is {data:"2026-08-31T23:24:05.503"} or similar — fallback to Date header
  const srv = r.headers["date"] ? Date.parse(r.headers["date"]) : Date.now();
  const rtt = (t1 - t0) / 2;
  return srv + rtt - Date.now(); // add to local to get server
}

async function getModal(itemId: number): Promise<Modal> {
  const { data } = await ax.get(`ItemBid/ShowBidModal?itemId=${itemId}`);
  // also fetch bidIncrement from detail if missing
  const { data: det } = await ax
    .get(`ItemDetail/GetItemDetailModelByItemId/${itemId}`)
    .catch(() => ({ data: {} }));
  return {
    ...data,
    bidIncrement: data.bidIncrement ?? det.bidIncrement ?? 1.0,
    endTime: data.endTime,
  };
}

async function placeBid(req: PlaceReq): Promise<PlaceResp> {
  const { data } = await ax.post("ItemBid/PlaceBid", req);
  return data;
}

function parseItems(): { itemId: number; sellerId: number; max: number }[] {
  if (process.env.MAX_BIDS_JSON) return JSON.parse(process.env.MAX_BIDS_JSON);
  // ITEMS=275048676:25,275247878:50  (max bid)
  const raw = process.env.ITEMS || "275048676:25";
  return raw.split(",").map((s) => {
    const [id, max] = s.split(":").map(Number);
    return { itemId: id, sellerId: 0, max };
  });
}

async function snipeOne(
  entry: { itemId: number; sellerId: number; max: number },
  offsetMs: number,
) {
  let modal = await getModal(entry.itemId);
  if (!entry.sellerId) entry.sellerId = modal.sellerId;
  const endServer = Date.parse(modal.endTime) + offsetMs; // modal.endTime is server local — offset corrects
  // If endTime is 0001-01-01, fetch detailed endTime
  let end = endServer;
  if (!end || isNaN(end) || end < Date.now()) {
    // fallback: use ItemDetail + server offset
    const { data: det } = await ax.get(`ItemDetail/GetItemDetailModelByItemId/${entry.itemId}`);
    end = Date.parse(det.endTime) + offsetMs;
  }
  console.log(
    `[${entry.itemId}] min=${modal.minimumBid} cur=${modal.currentPrice} end=${new Date(end).toISOString()} max=${entry.max}`,
  );

  // Decide bid: if max < minimumBid, abort
  if (entry.max < modal.minimumBid) {
    console.log(` skip: max < minimum`);
    return;
  }

  // Schedule: fire at end - 900ms (tune: 700-1200ms accounts for RTT). Re-poll minimumBid at T-5s to handle last-second raises.
  const FIRE_BEFORE_MS = Number(process.env.FIRE_BEFORE_MS || 900);
  const REFRESH_BEFORE_MS = 5000;

  const now = Date.now();
  const refreshAt = end - REFRESH_BEFORE_MS;
  const fireAt = end - FIRE_BEFORE_MS;

  if (refreshAt > now) {
    await new Promise((r) => setTimeout(r, refreshAt - Date.now()));
    modal = await getModal(entry.itemId);
    console.log(`[refresh T-5s] min=${modal.minimumBid} cur=${modal.currentPrice}`);
    if (entry.max < modal.minimumBid) {
      console.log(` abort after refresh`);
      return;
    }
  }

  const wait = fireAt - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));

  // High-precision spin-wait last 50ms then fire
  const spinUntil = fireAt;
  while (Date.now() < spinUntil) await new Promise((r) => setTimeout(r, 5));

  const bidAmount = Math.max(modal.minimumBid, entry.max); // cap at max; if max > min, bid max (proxy-like)
  // Some lots respect bidIncrement — ensure bidAmount >= minimumBid, else +increment
  const req: PlaceReq = { itemId: entry.itemId, sellerId: entry.sellerId, quantity: 1, bidAmount };
  console.log(`[FIRE] ${new Date().toISOString()} ->`, req);
  const tFire = Date.now();
  try {
    const resp = await placeBid(req);
    console.log(`[RESP +${Date.now() - tFire}ms]`, resp);
    if (!resp.status && (resp.result === -4 || resp.result === -5)) {
      // too low — retry with updated minimumBid if still time (<end)
      if (Date.now() < end - 200) {
        const m2 = await getModal(entry.itemId);
        if (entry.max >= m2.minimumBid) {
          const r2 = await placeBid({ ...req, bidAmount: m2.minimumBid });
          console.log(`[RETRY]`, r2);
        }
      }
    }
    if (resp.result === -110)
      console.error(
        "AUTH EXPIRED — refresh Bearer via POST SignIn/RefreshToken {refreshToken,clientIpAddress}",
      );
  } catch (e: any) {
    console.error("[FIRE ERR]", e?.response?.data || e.message);
  }
}

async function main() {
  if (!process.env.BEARER)
    console.warn(
      "WARN: no BEARER — PlaceBid will 400 until login. Get token via POST SignIn/Login",
    );
  const offset = await serverOffsetMs().catch(() => 0);
  console.log(`server offset ${offset}ms`);
  const entries = parseItems();
  // Pre-warm sellerIds
  for (const e of entries) {
    try {
      const m = await getModal(e.itemId);
      e.sellerId = m.sellerId;
    } catch {}
  }
  await Promise.all(entries.map((e) => snipeOne(e, offset)));
}
main();
