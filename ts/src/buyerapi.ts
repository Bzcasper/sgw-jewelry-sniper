import axios from "axios";

import { cfg, headers } from "./config.js";

export const api = axios.create({ baseURL: cfg.base, headers, timeout: 8000 });
if (cfg.bearer) api.defaults.headers.common["Authorization"] = `Bearer ${cfg.bearer}`;

// Axios retry on 429/5xx with jitter
api.interceptors.response.use(undefined, async (err) => {
  const c: any = err.config;
  c.__retries = c.__retries ?? 0;
  if (c.__retries >= 3) throw err;
  const status = err.response?.status;
  if (status === 429 || (status >= 500 && status < 600)) {
    c.__retries++;
    const delay = 400 * c.__retries ** 2 + Math.random() * 200;
    await new Promise((r) => setTimeout(r, delay));
    return api(c);
  }
  throw err;
});

// RULE #1: STRING booleans! Real payload uses "true"/"false" strings (540.595 quirk). Boolean true → 500.
export function itemListingBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    isSize: false,
    isWeddingCatagory: "false",
    isMultipleCategoryIds: false,
    isFromHeaderMenuTab: false,
    layout: "",
    isFromHomePage: false,
    searchText: "",
    selectedGroup: "",
    selectedCategoryIds: "",
    selectedSellerIds: "",
    lowPrice: cfg.lowPrice,
    highPrice: cfg.highPrice,
    searchBuyNowOnly: "",
    searchPickupOnly: "false",
    searchNoPickupOnly: "false",
    searchOneCentShippingOnly: "false",
    searchDescriptions: "false",
    searchClosedAuctions: "false",
    closedAuctionEndingDate: "9/1/2026",
    closedAuctionDaysBack: "7",
    searchCanadaShipping: "false",
    searchInternationalShippingOnly: "false",
    sortColumn: "1",
    page: "1",
    pageSize: String(cfg.pageSize),
    sortDescending: "false",
    savedSearchId: 0,
    useBuyerPrefs: "true",
    searchUSOnlyShipping: "false",
    categoryLevelNo: "1",
    partNumber: "",
    catIds: "",
    categoryLevel: 1,
    categoryId: 0,
    ...over,
  };
}

export type Modal = {
  itemId: number;
  sellerId: number;
  currentPrice: number;
  minimumBid: number;
  endTime: string;
  quantity: number;
};

export async function showBidModal(itemId: number): Promise<Modal> {
  const { data } = await api.get(`ItemBid/ShowBidModal?itemId=${itemId}`);
  return data as Modal;
}

export async function placeBid(req: {
  itemId: number;
  sellerId: number;
  quantity: 1;
  bidAmount: number;
}): Promise<{ status: boolean; result: number; message: string; pastDueMessage?: string }> {
  const { data } = await api.post("ItemBid/PlaceBid", req);
  return data;
}

export async function getItemDetail(itemId: number): Promise<any> {
  const { data } = await api.get(`ItemDetail/GetItemDetailModelByItemId/${itemId}`);
  return data;
}

export async function getItemsByIds(ids: number[]): Promise<any[]> {
  const { data } = await api.get(`Search/GetItemsById?itemIds=${ids.join(",")}`);
  return data as any[];
}

export async function calculateShipping(itemId: number, zip: string): Promise<string> {
  const { data } = await api.post("ItemDetail/CalculateShipping", {
    itemId,
    country: "US",
    province: "IN",
    zipCode: zip,
    quantity: 1,
    clientIP: cfg.clientIp,
  });
  return data as string; // HTML
}

export async function getActiveSellers(): Promise<{ sellerId: number; pickupCity: string }[]> {
  const { data } = await api.get("Search/GetActiveLocation");
  return data;
}

export async function serverOffsetMs(): Promise<number> {
  const t0 = Date.now();
  const r = await api.post("Dashboard/GetCurrentTime", null);
  const t1 = Date.now();
  const srv = r.headers["date"] ? Date.parse(r.headers["date"] as string) : Date.now();
  return srv + (t1 - t0) / 2 - Date.now();
}

export async function refreshToken(): Promise<string | null> {
  if (!cfg.refreshToken) return null;
  try {
    const { data } = await api.post("SignIn/RefreshToken", {
      refreshToken: cfg.refreshToken,
      clientIpAddress: cfg.clientIp,
    });
    const tok = data?.data?.accessToken ?? data?.accessToken;
    if (tok) {
      api.defaults.headers.common["Authorization"] = `Bearer ${tok}`;
      return tok;
    }
  } catch {}
  return null;
}
