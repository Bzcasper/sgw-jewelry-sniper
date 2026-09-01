PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS watched_auctions (
  itemId INTEGER PRIMARY KEY,
  sellerId INTEGER NOT NULL,
  categoryId INTEGER NOT NULL,
  title TEXT NOT NULL,
  startTime TEXT NOT NULL,
  endTime TEXT NOT NULL,
  currentPrice REAL NOT NULL,
  minimumBid REAL NOT NULL,
  bidIncrement REAL NOT NULL DEFAULT 1.0,
  imageURL TEXT,
  galleryURL TEXT,
  categoryParentList TEXT,
  catFullName TEXT,
  pickupZip TEXT,
  zcta TEXT REFERENCES demographics(zcta),
  status TEXT NOT NULL CHECK(status IN ('open','closed','won','lost','skipped_shipping')) DEFAULT 'open',
  firstSeenAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  lastPolledAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_watched_seller_cat_end ON watched_auctions(sellerId, categoryId, endTime);
CREATE INDEX IF NOT EXISTS idx_watched_status_end ON watched_auctions(status, endTime);

CREATE TABLE IF NOT EXISTS price_ticks (
  tickId INTEGER PRIMARY KEY AUTOINCREMENT,
  itemId INTEGER NOT NULL REFERENCES watched_auctions(itemId),
  ts TEXT NOT NULL,
  serverTime TEXT,
  currentPrice REAL NOT NULL,
  minimumBid REAL NOT NULL,
  numBids INTEGER NOT NULL,
  views INTEGER,
  offsetMs INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ticks_item_ts ON price_ticks(itemId, ts);

CREATE TABLE IF NOT EXISTS bids (
  bidId INTEGER PRIMARY KEY AUTOINCREMENT,
  itemId INTEGER NOT NULL REFERENCES watched_auctions(itemId),
  bidderUsername TEXT NOT NULL,
  bidAmount REAL NOT NULL,
  ts TEXT NOT NULL,
  isWinning INTEGER DEFAULT 0,
  isLastSecond INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_bids_item_user_ts ON bids(itemId, bidderUsername, ts);

CREATE TABLE IF NOT EXISTS bidders (
  username TEXT PRIMARY KEY,
  firstSeen TEXT NOT NULL,
  lastSeen TEXT NOT NULL,
  bidsCount INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  avgMarkupOverMin REAL DEFAULT 0,
  lastSecondPct REAL DEFAULT 0,
  sellerAffinity TEXT,
  jewelryAffinity TEXT,
  maxBidHistogram TEXT,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS demographics (
  zcta TEXT PRIMARY KEY,
  countyFips TEXT NOT NULL,
  stateFips TEXT NOT NULL,
  whitePct REAL,
  medianAge REAL,
  pct65plus REAL,
  medianHHIncome REAL,
  perCapitaIncome REAL,
  medianHomeValue REAL,
  richTownScore REAL,
  richSurroundingScore REAL,
  fetchedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS census_geo (
  zip TEXT PRIMARY KEY,
  zcta TEXT,
  countyFips TEXT,
  stateFips TEXT,
  lat REAL,
  lng REAL,
  geoid TEXT,
  fetchedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sniper_runs (
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
CREATE INDEX IF NOT EXISTS idx_runs_item ON sniper_runs(itemId, createdAt);
CREATE TABLE IF NOT EXISTS shard_watermarks (
  shardKey TEXT PRIMARY KEY,
  lastPage INTEGER,
  lastItemCount INTEGER,
  updatedAt TEXT
);
