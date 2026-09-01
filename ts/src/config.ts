import 'dotenv/config';
export const cfg = {
  base: "https://buyerapi.shopgoodwill.com/api/",
  bearer: process.env.BEARER || "",
  refreshToken: process.env.REFRESH_TOKEN || "",
  clientIp: process.env.CLIENT_IP || "1.1.1.1",
  fireBeforeMs: Number(process.env.FIRE_BEFORE_MS || 900),
  lowPrice: process.env.LOW_PRICE || "10",
  highPrice: process.env.HIGH_PRICE || "5000",
  pageSize: Number(process.env.PAGE_SIZE || 40),
  throttleMs: Number(process.env.THROTTLE_MS || 600),
  censusKey: process.env.CENSUS_API_KEY || "DEMO_KEY",
  dbUrl: process.env.DATABASE_URL || "sqlite:./data/sgw_jewelry.db",
  items: process.env.ITEMS || "275585046:30",
  jewelryCatIds: (process.env.JEWELRY_CAT_IDS || "87").split(","),
  jewelrySubcats: (process.env.JEWELRY_SUBCATS || "88,2240").split(","),
};
export const headers = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0",
  "Accept": "application/json", "Content-Type": "application/json",
  "Origin": "https://shopgoodwill.com", "Referer": "https://shopgoodwill.com/",
};
