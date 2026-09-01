import fs from "fs";
import path from "path";

import sqlite3 from "better-sqlite3";

const DB_PATH =
  process.env.DATABASE_URL?.replace("sqlite:", "") ??
  new URL("../../data/sgw_jewelry.db", import.meta.url).pathname;
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(new URL("../../data", import.meta.url).pathname, { recursive: true });

// Ensure schema applied
const schema = fs.readFileSync(new URL("../../schema.sql", import.meta.url).pathname, "utf8");
const db: any = sqlite3(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(schema);

export function insertWatched(row: {
  itemId: number;
  sellerId: number;
  categoryId: number;
  title: string;
  startTime: string;
  endTime: string;
  currentPrice: number;
  minimumBid: number;
  bidIncrement?: number;
  imageURL?: string;
  catFullName?: string;
  categoryParentList?: string;
  pickupZip?: string;
  zcta?: string;
}): void {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO watched_auctions
     (itemId,sellerId,categoryId,title,startTime,endTime,currentPrice,minimumBid,bidIncrement,imageURL,catFullName,categoryParentList,pickupZip,zcta)
     VALUES (@itemId,@sellerId,@categoryId,@title,@startTime,@endTime,@currentPrice,@minimumBid,@bidIncrement,@imageURL,@catFullName,@categoryParentList,@pickupZip,@zcta)`,
  );
  stmt.run({
    ...row,
    bidIncrement: row.bidIncrement ?? 1,
    imageURL: row.imageURL ?? null,
    catFullName: row.catFullName ?? null,
    categoryParentList: row.categoryParentList ?? null,
    pickupZip: row.pickupZip ?? null,
    zcta: row.zcta ?? null,
  });
  // NDJSON companion (frx fingerprint NDJSON discipline)
  fs.appendFileSync(
    new URL("../../data/items.ndjson", import.meta.url).pathname,
    JSON.stringify(row) + "\n",
  );
}

export function upsertDemographics(d: {
  zcta: string;
  countyFips: string;
  stateFips: string;
  whitePct: number;
  medianAge: number;
  medianHHIncome: number;
  perCapitaIncome: number;
  medianHomeValue: number;
  richTownScore: number;
  richSurroundingScore: number;
  fetchedAt: string;
}): void {
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO demographics(zcta,countyFips,stateFips,whitePct,medianAge,medianHHIncome,perCapitaIncome,medianHomeValue,richTownScore,richSurroundingScore,fetchedAt)
     VALUES (@zcta,@countyFips,@stateFips,@whitePct,@medianAge,@medianHHIncome,@perCapitaIncome,@medianHomeValue,@richTownScore,@richSurroundingScore,@fetchedAt)`,
  );
  stmt.run(d);
}

export function upsertCensusGeo(g: {
  zip: string;
  zcta: string | null;
  countyFips: string | null;
  stateFips: string | null;
  lat: number | null;
  lng: number | null;
  geoid: string | null;
}): void {
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO census_geo(zip,zcta,countyFips,stateFips,lat,lng,geoid,fetchedAt) VALUES (@zip,@zcta,@countyFips,@stateFips,@lat,@lng,@geoid,@fetchedAt)`,
  );
  stmt.run({ ...g, fetchedAt: new Date().toISOString() });
}

export function insertPriceTick(t: {
  itemId: number;
  ts: string;
  serverTime?: string;
  currentPrice: number;
  minimumBid: number;
  numBids: number;
  views?: number;
  offsetMs?: number;
}): void {
  const stmt = db.prepare(
    `INSERT INTO price_ticks(itemId,ts,serverTime,currentPrice,minimumBid,numBids,views,offsetMs) VALUES (@itemId,@ts,@serverTime,@currentPrice,@minimumBid,@numBids,@views,@offsetMs)`,
  );
  stmt.run({
    serverTime: t.serverTime ?? null,
    views: t.views ?? null,
    offsetMs: t.offsetMs ?? null,
    ...t,
  });
  fs.appendFileSync(
    new URL("../../data/price_ticks.ndjson", import.meta.url).pathname,
    JSON.stringify(t) + "\n",
  );
}

export default db;
