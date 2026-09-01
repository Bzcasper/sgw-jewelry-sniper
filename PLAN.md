# Build Plan — Jewelry Sniper (Hybrid TS + Rust)

**Spec:** `SPEC-JEWELRY.md` v0.1.0 + `DB-SPEC.md` + `API-CONTRACTS.md`  
**Goal:** 1–5 concurrent last-second snipes (T-900ms), shipping-gated 30%, jewelry-only, snipe-only v1, Census demographics + bidder behavior DB.

## Timeline (2 weeks, 5 milestones)

### M1 — DB + Census (Days 1–2) — Depends: spec locked ✓

- **M1.1** Apply `schema.sql` to `sgw_jewelry.db` (WAL), seed `shard_watermarks` for Jewelry `seller:*/cat:*`.
- **M1.2** Census client `ts/census.ts`: `Seller/GetSellerInfo` zip → `geocoding.geo.census.gov` → ZCTA/countyFips → `GET api.census.gov/data/2023/acs/acs5` (vars `B02001_002E`, `B01002_001E`, `B19013_001E`, `B19301_001E`, `B25077_001E`), cache 30d in `demographics`+`census_geo`.
- **M1.3** Backfill 163 sellers → ZCTAs (parallel 10, 500 qps limit, `CENSUS_API_KEY` env).
- **M1.4** Scoring: `richTownScore=z.medianHH/county`, `richSurrounding=county/state`, `whitePct`, `medianAge`, `pct65`. Expose `GET /demographics?zip=`.
- **Exit:** `demographics` 163 rows, query `SELECT richTownScore FROM demographics WHERE zcta='46226'` works.

### M2 — Scanner (Days 3–5) — Depends: M1

- **M2.1** `ts/catalog.ts`: sharded `POST Search/ItemListing` (STRING booleans!), `selectedCategoryIds="87"` + subs `88,2240` via `Category/GetAllCategoryPageList` + `GetCategoryDropdown`. Shard by `sellerId` (163) + `lowPrice/highPrice` to bypass `maxTotalRecords=10k`, throttle 0.6s, sortColumn 1 (EndingSoonest). Dual-pass `searchDescriptions` false→true diff.
- **M2.2** `ts/enrich.ts`: Bulk `GET Search/GetItemsById?itemIds=1,2` 50/batch → parse `description` HTML (`925/10K/14K`, `g` weight), `categoryParentList`, `bidIncrement`, `endTime`. Insert `watched_auctions` (INSERT OR IGNORE, status open).
- **M2.3** `ts/shipping.ts`: `POST ItemDetail/CalculateShipping {itemId, US, IN, zip, 1, clientIP}` gate; mark `skipped_shipping` if `>30% currentPrice` or `NOSERVICE`.
- **M2.4** NDJSON append `items.ndjson` per frx pattern + SQLite mirror.
- **Exit:** 20k jewelry `watched_auctions` open, e.g., `SELECT COUNT(*) > 15000`.

### M3 — Poller + Bidders (Days 6–8) — Depends: M2

- **M3.1** `ts/poller.ts`: 30s poll last 10m `watched_auctions` via `GET ItemBid/ShowBidModal` + `ItemDetail` → `price_ticks` + `items.ndjson`. 1–5 concurrent.
- **M3.2** `ts/bids.ts`: Bid-history ingest — probe `GET` bid history (grep `BidHistory` in chunks `540/813`) anon vs Bearer; if masked `a***b` store pattern else full username. Upsert `bids` + aggregate `bidders` (avgMarkup, lastSecondPct, sellerAffinity).
- **M3.3** Closed-price histogram: nightly `searchClosedAuctions=true cadb=30` per categoryId → `closedMedian*0.7` baseline for `max`.
- **Exit:** `price_ticks` >100k rows for 100 items, `bidders` >500 usernames.

### M4 — Rust Sniper Executor (Days 9–11) — Depends: M2

- **M4.1** Harden `rs/src/main.rs`: `serverOffset = Date + RTT/2 - local` via `POST Dashboard/GetCurrentTime`; parse `endTime` RFC3339 + offset; fallback `ItemDetail` endTime.
- **M4.2** `T-5000` refresh `minimumBid`, `T-900` spin 5ms → `POST PlaceBid {itemId,sellerId,quantity:1,bidAmount=max(minimumBid,max)}`; retry `-4/-5` if `now < end-200ms`; `-110` → `RefreshToken`.
- **M4.3** Integrate demographics bonus: `max *= (richTownScore>1.25 ? 1.10 : 1.0)`.
- **M4.4** Expectation hook: join `bidders.lastSecondPct` for active peers on same `itemId` (5m window) → `max += bidIncrement` if `score>0.6`.
- **M4.5** Audit `sniper_runs` + `latencyMs` metrics.
- **Exit:** Dry-run `FIRE_BEFORE_MS=9000` with `max=1` on Gallery low-views (<50) → `-4/-5` retry without win.

### M5 — Closed Loop + Hardening (Days 12–14) — Depends: M3+M4

- **M5.1** Wire `ITEMS` from query `SELECT itemId FROM watched_auctions WHERE status='open' AND endTime BETWEEN now AND now+1h ORDER BY richTownScore DESC LIMIT 5`.
- **M5.2** End-to-end on low-stakes jewelry `<$15` (3 wins) with Bearer from `frx-isolated` `SignIn/Login`.
- **M5.3** Observability: `price_ticks.ndjson` + `sniper_runs.ndjson` + `server_offset_ms` gauge; alert on `-110` or `NOSERVICE` spike.
- **Exit:** 5 concurrent snipes ending same minute, shipping gate respected, Census cache hit 95%.

## Dependencies

`M1 → M2 → M3 → M5` and `M2 → M4 → M5`. TS scanner unblocks Rust early (pre-warm sellerId).

## Risks

- Bid history usernames masked anon → degrade to velocity model (mitigated: auth probe in M3.2).
- `endTime` ET vs UTC → offset corrects via `Date` header.
- Census ZCTA 500 qps → backfill batched + cache.

## Estimates

M1 2d, M2 3d, M3 3d, M4 3d, M5 3d = 14d total. Buffer 2d for frx Bearer capture (`frx-isolated` Firefox 153).

## Deliverables

`sgw_jewelry.db`, `items.ndjson`, `SPEC-JEWELRY.md` lock, `ts/` + `rs/` binaries, `PLAN.md`/`PROGRESS.md`/`AGENTS.md`/`RULES.md` (this set).
