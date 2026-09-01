# ShopGoodwill Jewelry Sniper — Spec (Hybrid TS Scanner + Rust Executor)

**Version:** 0.1.0 — 2026-09-01  
**Status:** Draft → Build  
**Authors:** frx-isolated v0.23.1 reverse (Firefox 153.0a1, `main.40b252c97d367cad.js` + 24 chunks, live buyerapi probes 2026-09-01)  
**Artifacts:** `/tmp/shopgoodwill_api_map.md`, `/tmp/sgw_automation_playbook.md`, `/tmp/endpoints_raw.txt` (257), `/tmp/sgw_chunks/`, `/tmp/sgw_sniper/ts/sniper.ts`, `/tmp/sgw_sniper/rs/src/main.rs`

---

## 1. Overview

Build a **jewelry-only, last-second, snipe-only** system that watches ShopGoodwill auctions, scores store demographics (Census), tracks every price tick and bidder, and places bids at `end - 900ms` with `±150ms` jitter across **1–5 concurrent** targets. Hybrid: **TypeScript scanner** (deal finding, enrichment, demographics, DB) + **Rust executor** (deterministic fire). Shipping-gated (`CalculateShipping >30% → skip`). No checkout/BuyNow in v1.

Jewelry = highest flip margin per gram, seller skill variance is largest (e.g., `seller 12` gold vs `seller 361` costume grabbags `2.41g` lot vs `seller 5` Indy tools).

---

## 2. Goals / Non-Goals

**Goals:**
- Watch all Jewelry & Gemstones that will flip: Rings (88), Necklaces, Bracelets, Earrings, Costume Grabbags (2240), Gold/Silver lots; include `searchDescriptions=true` (+27% recall for `gold 100-5000` 70→89).
- Collect **every** watched auction + **all** price ticks (30s last 10m) + **all** bidder usernames + demographics for store ZCTA.
- Predict `P(peer will outbid in last 5s)` per username and adjust `max` or skip.
- Snipe 1–5 items ending within same window at `T-900ms` (tunable 700–1200), refresh `minimumBid` at `T-5s`, retry on `-4/-5` if `now < end-200ms`.
- Landed-cost gate via `ItemDetail/CalculateShipping` (FedEx `GROUND_HOME_DELIVERY` vs `RATE.LOCATION.NOSERVICE`).

**Non-Goals (v1):**
- No auto `Order/BuyNow`, `Checkout/process-payment`, `PickupScheduling` (manual win handling).
- No ML training; heuristic expectation only.
- No WASM/JSVMP (site is plain Angular, no signing); `frx-isolated` only for initial Bearer capture via `frx` `net_capture`/`cookies`.
- No spam beyond `0.6s` per `ItemListing` throttle and `maxTotalRecords=10k` cap respected via category/seller sharding.

---

## 3. Product Decisions (locked)

| Decision | Value | Rationale |
|---|---|---|
| Stack hybrid | TS scanner, Rust executor | TS wins for JSON/HTML/NDJSON/ACS; Rust wins for `<10ms` jitter |
| Concurrency | 1–5 parallel snipes, stagger ±150ms | Thundering herd avoidance; Tokio + Promise.all both capped |
| Shipping gate | skip if `shipping > 30% currentPrice` or `NOSERVICE` | Verified `46226=$13.70` vs `90210` fail |
| Fire time | `FIRE_BEFORE_MS=900` default (env override) | RTT 120 + p95 300 = 420, 900 gives buffer; Indy `700`, coastal `1200` |
| Refresh | `T-5s` re-fetch `ShowBidModal` | Handles last-second raises |
| Jewelry slice | `Jewelry & Gemstones` family, `lowPrice 10–5000`, `searchDescriptions` dual-pass | Balances recall vs noise; `mappedCatId 87` yields 1878 but family yields ~20k across subs |
| Census geo | ZCTA via `Seller/GetSellerInfo/{id}` city→zip→ZCTA, fallback county | ZCTA precise for `rich town` vs `rich surrounding` |
| Expectation | Heuristic `sigmoid(w·features)` | No training data yet; log all ticks for v2 ML |

---

## 4. External Contracts

### 4.1 ShopGoodwill buyerapi `https://buyerapi.shopgoodwill.com/api/` (production:true, `92340`)

**Auth:** `Authorization: Bearer <accessToken>` from `POST SignIn/Login {username,password,clientIpAddress}` → `{data:{accessToken, refreshToken:{token,createdByIp}, buyer:{buyerId}}}`. Refresh via `POST SignIn/RefreshToken {refreshToken,clientIpAddress}`. Headers always `Origin: https://shopgoodwill.com`, `Referer`, `User-Agent: Mozilla/5.0 ... rv:153.0`, `Content-Type: application/json`. Anon works for search/detail/gallery; PlaceBid/Order* require Bearer.

**Critical quirk:** `POST Search/ItemListing` **requires STRING booleans** `"true"/"false"` and numeric strings `"1"/"40"` (Angular `buildSearchQueryString` in `main`). Boolean `true` → `500`.

**Endpoints used (v1):**

*Search/Catalog:*
- `POST Search/ItemListing` — bulk dump, `searchResults:{items:[40],itemCount:631233}`, `maxTotalRecords=10000`. Body fields: `isSize=false, isWeddingCatagory:"false", isMultipleCategoryIds:false, layout:"", searchText:"gold", selectedCategoryIds:"87", selectedSellerIds:"", lowPrice:"10", highPrice:"5000", searchBuyNowOnly:"", searchPickupOnly:"false", searchOneCentShippingOnly:"false", searchDescriptions:"false"/"true", searchClosedAuctions:"false"/"true", closedAuctionEndingDate:"9/1/2026", closedAuctionDaysBack:"7", searchCanadaShipping:"false", searchInternationalShippingOnly:"false", sortColumn:"1"(EndingSoonest)/"2"/"3", page:"1", pageSize:"40", sortDescending:"false", savedSearchId:0, useBuyerPrefs:"true", categoryLevel:1, categoryId:0. `sortColumn 1=EndingSoonest`.
- `GET Search/GetItemById/{id}` / `GET Search/GetItemsById?itemIds=1,2,3` (up to 50/batch, tested 3) — bulk enrich `description`, `categoryParentList`, `weight`, `dimensions`, `bidIncrement`.
- `GET Search/GetActiveLocation` — 163 sellers → `{sellerId, searchFilterName, pickupCity}`.
- `GET Category/GetAllCategoryPageList` — tree, `Jewelry & Gemstones` → children `Rings(88)`, `Costume Grabbags(2240)`, etc.

*Detail/Bid (executor):*
- `GET ItemDetail/GetItemDetailModelByItemId/{id}` — `description HTML`, `categoryParentList:"114|Tools|2228|Power Tools"`, `currentPrice`, `endTime`, `bidIncrement:1.00`, `reserve`, `quantity`, `imageUrlString;`-joined, `sellerId`, `sellerItemProfile`.
- `GET ItemBid/ShowBidModal?itemId={id}` — pre-bid: `{itemId,sellerId,currentPrice,minimumBid,quantity:1,pickupOnly,pickupCity/pickupState,azureFilePath,listingType}`. Anon 200 verified `275048676` `minimumBid:15.99`.
- `GET ItemBid/ItemQuantity?itemId={id}` — stock int.
- `POST ItemBid/PlaceBid` — ` {itemId:number, sellerId:number, quantity:1, bidAmount:number}` → `{status:bool, result:int, message:string, pastDueMessage?:string}`. `result -110` && `!status` → auth expired → `logOut`+redirect; `-4/-5` → below min → retry; `-3` → rejected header; `true` → win + `PlaceBidEmarsysPush`. Anon → `400`.
- Bid history (to confirm anon visibility): `GET` variant like `ItemDetail/GetBidHistory?itemId=` or `ShowBidModal` paginated — grep `BidHistory/bidders/numberOfBids` in chunks `540.595`, `813.4d`; live probe required. Assume masked `a***b` if anon, full if auth.

*Shipping/Oracle:*
- `POST ItemDetail/CalculateShipping {itemId,country,province,zipCode,quantity,clientIP}` → HTML `FedEx GROUND_HOME_DELIVERY $11.70 + $2.00` or `ERROR CODE:RATE.LOCATION.NOSERVICE`.

*Dashboard/Time:*
- `POST Dashboard/GetCurrentTime` (bypass loader) + `Date` header → server clock sync; fallback `serverTime` from `GetItemsById` (`2026-08-31T23:24:05.503`).

**174 other endpoints in `/tmp/endpoints_raw.txt` not used v1 but documented in `api_map`:** `Favorite/*`, `SaveSearches/*`, `ShopperReminder/*`, `OpenOrders/*`, `ShippedOrders/*`, `CustomerService/*`, `PickupScheduling/*`, `ManageProfile/*`, `Shopper/*`, `Common/*`.

### 4.2 Census Bureau `https://api.census.gov/data/2023/acs/acs5`

**Auth:** `key=DEMO_KEY` (or env `CENSUS_API_KEY`), 500 qps limit.  
**Variables (ACS 5yr):** `NAME`, `B02001_002E` (white alone), `B01002_001E` (median age), `B01001_010E`+etc 65+, `B19013_001E` (median HH income), `B19301_001E` (per capita), `B25077_001E` (median home value), `B083...` commute not needed.  
**Geos:** `for=zip code tabulation area:{ZCTA}` + `in=state:{FIPS}` or `for=county:{FIPS} in=state:{FIPS}`.  
**Geocoding:** `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address={pickupZip+city}&benchmark=Public_AR_Current&vintage=Current_Current&format=json` → `GEOID`, county FIPS, ZCTA. Fallback `TIGERweb` adjacent ZCTAs for surrounding score.

---

## 5. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ TS Scanner (Node 20, cron 15m)                                  │
│  Category/GetAllCategoryPageList → Jewelry subcats              │
│  Search/ItemListing sharded by selectedCategoryIds +            │
│    selectedSellerIds (163) + lowPrice/highPrice +               │
│    searchDescriptions dual-pass → searchResults.items (40/pg)   │
│  Bulk GetItemsById 50/batch → parse description HTML (925/10K) │
│  CalculateShipping gate (30%) → insert watched_auctions         │
│  Census client: Seller/GetSellerInfo zip → ZCTA → ACS cache     │
│  Price poller 30s last 10m (1-5 concurrent) → price_ticks       │
│  Bid-history poller → bidders/bids                              │
│  Writes NDJSON append + SQLite (frx fingerprint pattern)        │
│                             │                                   │
│                             ▼                                   │
│                       sqlite sgw_jewelry.db                     │
│   watched_auctions | price_ticks | bids | bidders | demographics│
│   sniper_runs | census_geo cache                                │
└──────────────────────────────┬──────────────────────────────────┘
                               │ ITEMS=itemId:max csv
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ Rust Executor (tokio, 1-5 spawns)                               │
│  serverOffset = Date header + RTT/2 - local                     │
│  get ShowBidModal (pre-warm sellerId)                           │
│  endMs = parse(endTime)+offset (fallback ItemDetail)            │
│  sleep end-5000 → refresh minimumBid                            │
│  sleep end-900 spin 5ms → PlaceBid {itemId,sellerId,1,bid}     │
│  retry -4/-5 if now < end-200ms                                 │
│  log PlaceResp + latency → sniper_runs                          │
└─────────────────────────────────────────────────────────────────┘
                                │
               frx-isolated Firefox 153.0a1 (HOME=isolated-home)
               net_capture + cookies → Bearer capture/RefreshToken
```

---

## 6. Data Model

See `schema.sql` + `DB-SPEC.md` (companion). Summary:

- `watched_auctions(itemId PK, sellerId, categoryId, title, startTime, endTime, currentPrice, minimumBid, bidIncrement, imageURL, pickupZip, zcta FK, status ENUM open/closed/won/lost)`
- `price_ticks(tickId PK, itemId FK, ts, currentPrice, minimumBid, numBids, views, serverTime)`
- `bids(bidId PK, itemId FK, bidderUsername, bidAmount, ts, isWinning BOOL, isLastSecond BOOL)`
- `bidders(username PK, firstSeen, bidsCount, wins, avgMarkupOverMin, lastSecondPct, sellerAffinity JSON, jewelryAffinity JSON, maxBidHistogram JSON)`
- `demographics(zcta PK, countyFips, stateFips, whitePct, medianAge, pct65plus, medianHHIncome, perCapitaIncome, medianHomeValue, richTownScore, richSurroundingScore, fetchedAt)`
- `census_geo(zip PK, zcta, countyFips, lat, lng, geoid, fetchedAt)`
- `sniper_runs(runId PK, itemId FK, fireAt, fireBeforeMs, offsetMs, bidAmount, responseResult, responseMessage, latencyMs, retryCount, createdAt)`

Indexes: `watched_auctions(sellerId, categoryId, endTime)`, `price_ticks(itemId, ts)`, `bids(itemId, bidderUsername, ts)`, `bidders(bidsCount)`.

---

## 7. Algorithms

### 7.1 Demographics scoring
For store ZCTA `z`:
- Fetch ACS for `z`, for `countyFips`, for `stateFips`, and for up to 8 adjacent ZCTAs (TIGER adjacency).
- `richTownScore = medianHHIncome(z) / medianHHIncome(county)`; `richSurroundingScore = medianHHIncome(county) / medianHHIncome(state)`; similarly `homeValue` ratio.
- `whitePct = B02001_002E / totalPop`; `oldTown = medianAge > 42 OR pct65plus > 18%`.
- Flag `rich town` if `richTownScore >1.25` or `medianHomeValue(z) >1.3×county`; `rich surrounding` if `county/state >1.15`.
- Persist 30d TTL, surface as `demographics.richTownScore` in sniper `max` adjustment (e.g., +10% max for rich town jewelry grabbags where costume lots hide gold).

### 7.2 Bidder expectation (v1 heuristic)
Features per `username` on `itemId`:
- `bidsCount_item`, `avgMarkup=(bidAmount-minimumBid)/minimumBid`, `lastSecondPct` (bids within 60s of end), `sellerAffinity = bids on sellerId / total`, `jewelryAffinity = jewelry bids / total`, `recency` (hours since last bid).
- `score = sigmoid(0.8*lastSecondPct + 0.6*avgMarkup + 0.5*sellerAffinity + 0.4*jewelryAffinity -0.3*recencyDecay)`.
- If peer `score>0.6` active on same `itemId` within 5m, raise own `bidAmount` by `bidIncrement` (capped at `max`) or skip if `max` already near.

### 7.3 Snipe policy
- `offset = server Date + RTT/2 - local` per `Dashboard/GetCurrentTime`.
- Pre-warm `sellerId` via `ShowBidModal` (1 RTT).
- `max` initially `closedMedian*0.7` (from `searchClosedAuctions` 735k histogram per categoryId) or user `ITEMS` csv override.
- Adjust `max *= demographicsBonus` (`richTownScore>1.25 → ×1.10`).

---

## 8. Component Specs

### 8.1 TS Scanner (`/tmp/sgw_sniper/ts/`)
- `package.json` `axios`, `typescript`, `tsx`, `cheerio` (HTML parse), `better-sqlite3`/`prisma`.
- Modules: `catalog.ts` (sharded ItemListing), `enrich.ts` (bulk GetItemsById), `shipping.ts` (CalculateShipping), `census.ts` (ACS + geocode + scoring), `poller.ts` (price_ticks), `bids.ts` (bid-history), `db.ts` (NDJSON append `items.ndjson` style per `frx` fingerprint), `main.ts` cron.
- Throttle `0.6s` per ItemListing, `40/page`, `maxTotalRecords=10k` shard.

### 8.2 Rust Executor (`/tmp/sgw_sniper/rs/`)
- `Cargo.toml` `tokio full`, `reqwest json rustls`, `chrono`, `anyhow`, `serde`.
- Already implements `server_offset_ms`, `get_modal`, `place_bid`, `1-5` spawns with `end-5000` refresh and `end-900` spin. Add `demographics` read and `bidder` expectation join.
- ENV: `BEARER`, `ITEMS`/`MAX_BIDS_JSON`, `FIRE_BEFORE_MS`, `CENSUS_API_KEY`.

### 8.3 frx-isolated auth
- `HOME=/home/bobby/frx-isolated/isolated-home firefox --profile /tmp/p-$(date +%s)` → login → `cookies` tool or `page_eval localStorage` → `currentUserObject` → `accessToken`/`refreshToken`. `SignIn/RefreshToken` auto on `-110`.

---

## 9. Observability & Files

- `sgw_jewelry.db` + `items.ndjson` (append), `price_ticks.ndjson`, `sniper_runs.ndjson`.
- Metrics: `snipe_latency_ms`, `offset_ms`, `minimumBid` delta `T-5s`, `result` histogram.
- Logs: every `PlaceBid` request/response + `pastDueMessage`.

---

## 10. Security & Compliance

- Bearer in `env` only, `0600` SQLite, no commit of `currentUserObject`.
- Throttle `0.6s`, respect `UseBuyerPrefs`, `AS IS` (seller 5/361) 7-day damage return only.
- Census key env, 500 qps limit, 30d cache.
- Only own account; no seller endpoint abuse.

---

## 11. Testing

- Unit: ACS scoring, shipping gate, bidder sigmoid.
- Integration (dry-run): `FIRE_BEFORE_MS=9000` fires 9s early with `max=1` → expect `-4/-5` retry, no win.
- Live low-stakes: Gallery `views<50` jewelry `<$15` with `max=5`.
- Load: 5 concurrent snipes ending same minute.

---

## 12. Milestones

1. **M1 DB + Census** — schema + ACS client + ZCTA mapping for 163 sellers.
2. **M2 Scanner** — jewelry `ItemListing` sharded + bulk + shipping gate → `watched_auctions` 20k.
3. **M3 Poller + bidders** — price_ticks + bid-history ingest + heuristic.
4. **M4 Rust snipe** — offset + refresh + retry, 1–5 parallel, metrics.
5. **M5 closed loop** — demographics bonus + expectation adjusts `max`.

---

## 13. Open Risks

- Bid history usernames may be masked anon (`a***b`) — need auth probe to confirm; if masked, bidder model degrades to `numBids` velocity only.
- `endTime` timezone is server-local (likely ET) — verify via `serverTime` vs `Date` header delta; offset corrects.
- Census ZCTA vs county: ZCTA finer but 500 ZCTAs API cost; default ZCTA, fallback county.
- `searchClosedAuctions` `cadb` max 30 — need daily scrape to build histogram.

