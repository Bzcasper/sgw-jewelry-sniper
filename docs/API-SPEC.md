# SGW Jewelry Sniper — Full API Spec (OpenAPI 3.1)

**Base:** `http://localhost:3000` — **Auth:** `Authorization: Bearer <buyerapi accessToken>` (proxied via `POST /api/auth/login` → `buyerapi SignIn/Login`).

## Endpoints

### Health

- `GET /api/health` → `{status:"ok", uptime, db:"ok", census:"ok|mock"}`

### Auth (proxy buyerapi)

- `POST /api/auth/login {username,password,clientIp}` → `{accessToken,refreshToken,buyerId}` (sets `Authorization` for sniper)
- `POST /api/auth/refresh {refreshToken,clientIp}` → `{accessToken}`
- `GET /api/auth/me` (Bearer) → `{buyerId, profile}` via `ManageProfile/Get`

### Search / Catalog (jewelry focus)

- `GET /api/search?text=gold&category=87&low=10&high=5000&desc=true&page=1&sort=1` → proxies `POST Search/ItemListing` (STRING booleans quirk hidden), returns `searchResults.items[]` + `maxTotalRecords`
- `GET /api/items/:id` → `GetItemDetail` + `ShowBidModal` merged + `views`, `bidIncrement`
- `GET /api/items/bulk?ids=1,2,3` → `GetItemsById` 50/batch
- `POST /api/items/shipping {itemId,zip}` → `CalculateShipping` HTML parsed `{cost,ratio,ok}`
- `GET /api/categories` → `GetAllCategoryPageList` jewelry tree
- `GET /api/sellers` → `GetActiveLocation` 163 rows

### Watchlist (local DB)

- `POST /api/watch {itemId}` → inserts `watched_auctions`, returns row
- `GET /api/watch?status=open&limit=50&sort=endTime` → from SQLite
- `DELETE /api/watch/:id` → soft delete
- `POST /api/watch/sync` → body sharded `ItemListing` → bulk watch (calls `catalog.ts`)

### Price & Bids

- `GET /api/ticks/:itemId?limit=100` → `price_ticks` ordered `ts`
- `GET /api/bids/:itemId` → `bids` + `bidders` expectation for active peers
- `GET /api/bidders/:username` → `bidders` row + `sellerAffinity` histogram
- `GET /api/history/closed?category=87&days=7` → `closedMedian` (uses `searchClosedAuctions=true`)

### Demographics (Census ACS 5yr 2023)

- `GET /api/demographics/:zcta` → `demographics` row or live fetch `geocodeAddress→ACS` (needs `CENSUS_API_KEY`, else mock)
- `GET /api/demographics/zip/:zip?city=Indianapolis&state=IN` → geocode → score `richTownScore`, `composite`, `bonus`
- `POST /api/demographics/score {z,county,state}` → `scoreDemographics` pure

### Scoring & Snipe

- `POST /api/score/flip {itemId,zip,closedMedian?, maxBid?}` → `jewelryFlipScore` → `{baseline,landed,rawFlip,adjFlip,maxSuggestion,shouldBid,reason}` (uses `shippingGate` + `demo` + `peer`)
- `POST /api/score/bidder {username,currentPrice}` → `bidderExpectation` → `{pWillBid,expectedMax,confidence}`
- `POST /api/snipe {items:[{itemId,sellerId?,max}], fireBeforeMs?:900}` → queues 1-5 snipes, spawns Rust or TS executor, returns `{runIds:[], fireAt[]}`
- `GET /api/snipe/runs?limit=20` → `sniper_runs` audit
- `POST /api/snipe/dry {itemId,max}` → `FIRE_BEFORE_MS=9000` dry, expects `-4/-5`

### Admin

- `GET /api/catalog/categories` same as above, cached

All responses JSON, errors `{error, message, status}`. Rate limit `60/min` per IP (in-memory). Swagger at `/docs`.

## Pure functions reused

- `ts/src/algorithm.ts: scoreDemographics, bidderExpectation, jewelryFlipScore`
- `ts/src/census.ts: geocodeAddress, fetchACSByZCTA/County/State, scoreDemographics`
- `ts/src/buyerapi.ts: itemListingBody (STRING booleans), showBidModal, placeBid`
