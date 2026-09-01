# Agents — Jewelry Sniper

**Project:** `SPEC-JEWELRY.md` v0.1.0, hybrid TS scanner + Rust executor, `sgw_jewelry.db` 8 tables. Run via `PLAN.md` M1–M5. Handoffs are NDJSON/SQLite, not in-memory.

## 1. Scanner Agent (TS, `ts/catalog.ts`, `enrich.ts`, `shipping.ts`)

- **Owns:** M2. Watches `Category/GetAllCategoryPageList`, shards `POST Search/ItemListing` (STRING booleans!), bulk `GetItemsById`, `CalculateShipping` gate, insert `watched_auctions` + `items.ndjson`.
- **Input:** `selectedCategoryIds="87"` jewelry subs `88,2240`, `sellerId` 163, `lowPrice/highPrice`, `searchDescriptions`.
- **Output:** `watched_auctions` 20k rows, `shard_watermarks` updated, respects `0.6s` throttle + `maxTotalRecords=10k`.
- **Handoff to:** Census Agent (needs `pickupZip`), Poller Agent, Executor Agent (provides `ITEMS`).
- **Escalate to:** Human if `500` → likely boolean type drift.

## 2. Census Agent (TS, `ts/census.ts`)

- **Owns:** M1.2–M1.4. Maps `Seller/GetSellerInfo zip` → `geocoding.geo.census.gov` → ZCTA/countyFips → `api.census.gov/data/2023/acs/acs5` (`B02001_002E/B01002_001E/B19013_001E/B19301_001E/B25077_001E`), scores `richTownScore=z/county`, caches `demographics`+`census_geo` 30d.
- **Input:** `pickupZip` from Scanner.
- **Output:** `demographics` 163 rows, `richTownScore>1.25` flag for `rich town`.
- **Handoff to:** Scanner (bonus `max`), Poller not needed.
- **Escalate:** `500 qps` → backoff batch 10.

## 3. Poller / Bidder Agent (TS, `ts/poller.ts`, `ts/bids.ts`)

- **Owns:** M3. Polls `ShowBidModal`/`ItemDetail` 30s last 10m (1–5 concurrent) → `price_ticks`; scrapes bid history (`BidHistory` grep `540/813`) → `bids`+`bidders` aggregate `lastSecondPct/avgMarkup/sellerAffinity`.
- **Input:** `watched_auctions` where `status=open` and `endTime` near.
- **Output:** `price_ticks` >100k, `bidders` >500, nightly `closedMedian*0.7` histogram.
- **Handoff to:** Executor Agent (provides `bidders` expectation scores).
- **Escalate:** Masked `a***b` usernames → velocity-only model.

## 4. Sniper Executor Agent (Rust, `rs/src/main.rs`)

- **Owns:** M4. Deterministic fire: `serverOffset` via `Dashboard/GetCurrentTime` + `Date`, `endMs=parse(endTime)+offset`, `T-5000` refresh `minimumBid`, `T-900` spin `yield_now`, `POST PlaceBid {itemId,sellerId,quantity:1,bidAmount}`, retry `-4/-5`, `RefreshToken` on `-110`.
- **Input:** `ITEMS=itemId:max` from query `SELECT itemId FROM watched_auctions WHERE endTime BETWEEN now AND now+1h ORDER BY richTownScore DESC LIMIT 5`, plus `bidders` scores + demographics bonus.
- **Output:** `sniper_runs` + `latencyMs` + `result`.
- **Handoff to:** Human (manual win handling v1), observability.
- **Escalate:** `ccNumRetries>=3` not applicable (snipe-only), but log `-3` reject.

## 5. QA / frx-isolated Agent (Ops)

- **Owns:** M5 + auth. Runs `HOME=isolated-home firefox --profile /tmp/p-$(date +%s)` (Firefox 153) via `frx-isolated/run-isolated.sh`, `net_capture` for `currentUserObject` Bearer, `cookies` tool for `RefreshToken` rotation, dry-run `FIRE_BEFORE_MS=9000` on `Gallery views<50`.
- **Input:** Live Bearer, test `275048676` etc.
- **Output:** `sniper_runs.ndjson` verified, `PROGRESS.md` checkboxes.
- **Escalate:** Block M lift if dry-run not green.

## Handoff Protocol

- **Files:** TS writes NDJSON append (`items.ndjson`, `price_ticks.ndjson`), Rust reads SQLite `watched_auctions`. No direct RPC.
- **Env:** `BEARER`, `CENSUS_API_KEY`, `ITEMS`/`MAX_BIDS_JSON`, `FIRE_BEFORE_MS`.
- **Meetings:** Daily standup per `PLAN.md` exit criteria; no PR merges without `schema.sql` check (`sqlite3 :memory:`).

## Ownership Matrix

| Milestone    | Lead         | Reviewer |
| ------------ | ------------ | -------- |
| M1 DB+Census | Census Agent | Scanner  |
| M2 Scanner   | Scanner      | Census   |
| M3 Poller    | Poller       | Executor |
| M4 Executor  | Executor     | Poller   |
| M5 Loop      | QA           | All      |

## Escalation

- `500` on `ItemListing` → Scanner checks STRING booleans.
- Masked usernames → Poller degrades to velocity.
- Census 429 → Census batch backoff.
- `-110` auth → QA triggers `RefreshToken`.
