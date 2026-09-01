# Progress Checklist — Jewelry Sniper

**Spec:** `SPEC-JEWELRY.md` + `PLAN.md` M1–M5. Check `[x]` as you go. Owner in `AGENTS.md`.

## M1 — DB + Census (Days 1–2)

- [ ] M1.1 `schema.sql` applied to `sgw_jewelry.db` WAL, `sqlite3` or `sqlx` migrate, 8 tables visible
- [ ] M1.1a `shard_watermarks` seeded for Jewelry cats `87,88,2240`
- [ ] M1.2 `ts/census.ts` `geocoding.geo.census.gov` → ZCTA/countyFips for a test zip `46226`
- [ ] M1.2a ACS fetch `api.census.gov/data/2023/acs/acs5` `B02001_002E` etc for `46226` with `CENSUS_API_KEY`
- [ ] M1.2b `demographics` cache write + 30d TTL check
- [ ] M1.3 Backfill 163 sellers (from `Search/GetActiveLocation`) → `census_geo` + `demographics` (batch 10)
- [ ] M1.3a Verify `SELECT COUNT(*) FROM demographics` = 163 ± adjacent duplicates
- [ ] M1.4 Scoring: `richTownScore` + `richSurrounding` + `whitePct/medianAge/pct65` computed for `46226`
- [ ] M1.4a `GET /demographics?zip=46226` returns `richTownScore>1.0` for Indy
- [ ] M1 done: `demographics` populated, query by zcta works

## M2 — Scanner (Days 3–5)

- [ ] M2.1 `Category/GetAllCategoryPageList` → jewelry subcats `88,2240` parsed
- [ ] M2.1a `POST Search/ItemListing` with STRING booleans `"true"/"false"` returns 40 items (not 500)
- [ ] M2.1b Sharded by `sellerId` 163 + `selectedCategoryIds` bypasses `maxTotalRecords=10k`
- [ ] M2.1c Dual-pass `searchDescriptions` false→true diff yields +27% for `gold`
- [ ] M2.1d Throttle 0.6s enforced, no 429
- [ ] M2.2 `Search/GetItemsById?itemIds=50/batch` enriches `description` HTML parse `925/10K/g`
- [ ] M2.2a Insert `watched_auctions` 20k rows, `INSERT OR IGNORE` idempotent
- [ ] M2.2b NDJSON `items.ndjson` append per frx pattern
- [ ] M2.3 `ItemDetail/CalculateShipping` gate tested `46226=$13.70` vs `90210 NOSERVICE`
- [ ] M2.3a `skipped_shipping` marks where `shipping>30%`
- [ ] M2 done: `SELECT COUNT(*) FROM watched_auctions WHERE catFullName LIKE '%Jewelry%'` >15000

## M3 — Poller + Bidders (Days 6–8)

- [ ] M3.1 `ShowBidModal` poll 30s last 10m 1–5 concurrent → `price_ticks` rows
- [ ] M3.1a `price_ticks` >100k for 100 items after 1h
- [ ] M3.2 Bid-history endpoint confirmed anon vs Bearer (grep `BidHistory` in `540/813`, live probe)
- [ ] M3.2a `bids` ingest handles masked `a***b`
- [ ] M3.2b `bidders` aggregate `avgMarkup, lastSecondPct, sellerAffinity` upsert
- [ ] M3.2c `bidders` >500 usernames
- [ ] M3.3 Nightly closed `searchClosedAuctions=true cadb=30` histogram → `closedMedian*0.7` baseline
- [ ] M3 done: bidder expectation query `SELECT score FROM bidders WHERE username=?` works

## M4 — Rust Executor (Days 9–11)

- [ ] M4.1 `serverOffset = Date + RTT/2 - local` via `Dashboard/GetCurrentTime` tested offset within ±200ms
- [ ] M4.1a `endMs=parse(endTime)+offset` fallback `ItemDetail` for `0001-01-01`
- [ ] M4.2 `T-5000` refresh `minimumBid` + `T-900` spin 5ms → `PlaceBid` fires
- [ ] M4.2a Retry `-4/-5` if `now<end-200ms`
- [ ] M4.2b `-110` triggers `RefreshToken` log
- [ ] M4.3 Demographics bonus `max *=1.10` if `richTownScore>1.25` wired
- [ ] M4.4 Expectation hook `score>0.6` → `max+=bidIncrement`
- [ ] M4.5 `sniper_runs` audit logged with `latencyMs`
- [ ] M4.6 Dry-run `FIRE_BEFORE_MS=9000` on Gallery `views<50` → `-4/-5` no win
- [ ] M4 done: 5 concurrent dry-runs parallel no race

## M5 — Closed Loop (Days 12–14)

- [ ] M5.1 `ITEMS` from query `SELECT itemId FROM watched_auctions WHERE status='open' AND endTime BETWEEN now AND now+1h ORDER BY richTownScore DESC LIMIT 5`
- [ ] M5.2 Live low-stakes `<$15` 3 wins with frx Bearer
- [ ] M5.2a Shipping gate respected on live wins
- [ ] M5.3 `sniper_runs.ndjson` + offset gauge + `-110` alert
- [ ] M5.3a NDJSON mirrors SQLite, no token leakage
- [ ] M5 done: 5 concurrent snipes same minute, metrics dashboard

## Overall

- [ ] All 8 tables `SELECT name FROM sqlite_master` → bidders,bids,census_geo,demographics,price_ticks,shard_watermarks,sniper_runs,watched_auctions
- [ ] `API-CONTRACTS.md` 257 endpoints still valid (spot check 5)
- [ ] `SPEC-JEWELRY.md` lock, no drift
- [ ] `frx-isolated` Firefox 153 capture `/tmp/profile-*` `currentUserObject` → Bearer

**Progress:** 0/45 → update `[x]` per PR. Block moving to next M until exit criteria green.
