# DB Spec — Jewelry Sniper

**Engine:** SQLite (`better-sqlite3` TS + `sqlx` Rust) or Postgres (swap DSN). File `sgw_jewelry.db` beside `items.ndjson` (frx NDJSON append discipline). WAL mode, `PRAGMA journal_mode=WAL`.

## Schema

```sql
-- Watched provenance: every jewelry auction we track (future endTime)
CREATE TABLE watched_auctions (
  itemId INTEGER PRIMARY KEY,
  sellerId INTEGER NOT NULL,
  categoryId INTEGER NOT NULL,
  title TEXT NOT NULL,
  startTime TEXT NOT NULL, -- ISO8601 server
  endTime TEXT NOT NULL,
  currentPrice REAL NOT NULL,
  minimumBid REAL NOT NULL,
  bidIncrement REAL NOT NULL DEFAULT 1.0,
  imageURL TEXT,
  galleryURL TEXT,
  categoryParentList TEXT, -- "6|Jewelry...|2240|..."
  catFullName TEXT,
  pickupZip TEXT,          -- from Seller/GetSellerInfo
  zcta TEXT REFERENCES demographics(zcta),
  status TEXT NOT NULL CHECK(status IN ('open','closed','won','lost','skipped_shipping')) DEFAULT 'open',
  firstSeenAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  lastPolledAt TEXT
);
CREATE INDEX idx_watched_seller_cat_end ON watched_auctions(sellerId, categoryId, endTime);
CREATE INDEX idx_watched_status_end ON watched_auctions(status, endTime);

-- Every poll tick (30s last 10m + pre-fire)
CREATE TABLE price_ticks (
  tickId INTEGER PRIMARY KEY AUTOINCREMENT,
  itemId INTEGER NOT NULL REFERENCES watched_auctions(itemId),
  ts TEXT NOT NULL, -- server-corrected ISO
  serverTime TEXT,
  currentPrice REAL NOT NULL,
  minimumBid REAL NOT NULL,
  numBids INTEGER NOT NULL,
  views INTEGER,
  offsetMs INTEGER
);
CREATE INDEX idx_ticks_item_ts ON price_ticks(itemId, ts);
CREATE INDEX idx_ticks_ts ON price_ticks(ts);

-- Raw bids (from bid-history endpoint; may be masked anon)
CREATE TABLE bids (
  bidId INTEGER PRIMARY KEY AUTOINCREMENT,
  itemId INTEGER NOT NULL REFERENCES watched_auctions(itemId),
  bidderUsername TEXT NOT NULL,
  bidAmount REAL NOT NULL,
  ts TEXT NOT NULL,
  isWinning INTEGER DEFAULT 0,
  isLastSecond INTEGER DEFAULT 0 -- ts within 60s of endTime
);
CREATE INDEX idx_bids_item_user_ts ON bids(itemId, bidderUsername, ts);
CREATE INDEX idx_bids_user ON bids(bidderUsername);

-- Aggregated bidder behavior
CREATE TABLE bidders (
  username TEXT PRIMARY KEY,
  firstSeen TEXT NOT NULL,
  lastSeen TEXT NOT NULL,
  bidsCount INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  avgMarkupOverMin REAL DEFAULT 0, -- avg (bid-min)/min
  lastSecondPct REAL DEFAULT 0,    -- bids in last 60s / total
  sellerAffinity TEXT,             -- JSON {sellerId: count}
  jewelryAffinity TEXT,            -- JSON {categoryId: count}
  maxBidHistogram TEXT,            -- JSON [buckets]
  updatedAt TEXT NOT NULL
);
CREATE INDEX idx_bidders_count ON bidders(bidsCount DESC);

-- Census demographics per ZCTA
CREATE TABLE demographics (
  zcta TEXT PRIMARY KEY, -- 5-digit
  countyFips TEXT NOT NULL,
  stateFips TEXT NOT NULL,
  whitePct REAL,
  medianAge REAL,
  pct65plus REAL,
  medianHHIncome REAL,
  perCapitaIncome REAL,
  medianHomeValue REAL,
  richTownScore REAL,       -- z / county income
  richSurroundingScore REAL,-- county / state
  fetchedAt TEXT NOT NULL
);

-- Geo cache: zip → ZCTA/county
CREATE TABLE census_geo (
  zip TEXT PRIMARY KEY,
  zcta TEXT,
  countyFips TEXT,
  stateFips TEXT,
  lat REAL,
  lng REAL,
  geoid TEXT,
  fetchedAt TEXT NOT NULL
);

-- Sniper run audit
CREATE TABLE sniper_runs (
  runId INTEGER PRIMARY KEY AUTOINCREMENT,
  itemId INTEGER NOT NULL REFERENCES watched_auctions(itemId),
  fireAt TEXT NOT NULL,
  fireBeforeMs INTEGER NOT NULL,
  offsetMs INTEGER NOT NULL,
  bidAmount REAL NOT NULL,
  responseResult INTEGER,
  responseMessage TEXT,
  pastDueMessage TEXT,
  latencyMs INTEGER,
  retryCount INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_runs_item ON sniper_runs(itemId, createdAt);

-- ItemListing shard watermark for 10k cap bypass
CREATE TABLE shard_watermarks (
  shardKey TEXT PRIMARY KEY, -- e.g., "seller:361:cat:2240:sort:1"
  lastPage INTEGER,
  lastItemCount INTEGER,
  updatedAt TEXT
);
```

## NDJSON companions (frx pattern)

- `items.ndjson` append per `ItemListing` item (mirrors `watched_auctions` insert)
- `price_ticks.ndjson` append per poll
- `sniper_runs.ndjson` append per fire

Scanner does `INSERT OR IGNORE` then `UPDATE` on `lastPolledAt`.

## Queries

- Jewelry due in 1h: `SELECT * FROM watched_auctions WHERE status='open' AND endTime BETWEEN now AND now+1h ORDER BY demographics.richTownScore DESC`
- Bidder expectation: `SELECT lastSecondPct, avgMarkupOverMin FROM bidders WHERE username=?`
- Price velocity: `SELECT (MAX(currentPrice)-MIN(currentPrice))/ (MAX(ts)-MIN(ts)) FROM price_ticks WHERE itemId=? AND ts > end-600s`

## Retention

- `price_ticks` >30d roll to `price_ticks_archive` (closed only median kept).
- `bids` forever for bidder model (low volume).
- Census 30d TTL.
