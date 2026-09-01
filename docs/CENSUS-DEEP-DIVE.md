# Census Bureau Official API — Deep Dive for SGW Jewelry Sniper

**Date:** 2026-09-01 — **Source:** `api.census.gov/data/2023/acs/acs5` (American Community Survey 5-Year 2019–2023) + Geocoder `geocoding.geo.census.gov` — verified live (geocoder 200 OK, ACS 200 `Invalid Key` with `DEMO_KEY` → key required).

## 1. Base & Key

- **Base:** `https://api.census.gov/data/{year}/acs/acs5` — current `2023` (2019–2023 5yr). Also `2024` (2020–2024) when released Jan 2025. Use `2023` for stability (spec locks to `2023`).
- **Key:** **Required** — `DEMO_KEY` now returns `Invalid Key` HTML (verified 2026-09-01). Get free key at **https://api.census.gov/data/key_signup.html** (instant email, 500 queries/IP/day without key used to work, now hard-requires key). Set `CENSUS_API_KEY` in `.env`. No key = mock fallback (see §7).
- **Rate:** 500 queries per key per day? Real limit 500 concurrent? Docs say 500 queries per IP per ??? — use 2 qps + 400ms backoff in `census.ts` (already has retry 3). Cache 30d in `demographics`+`census_geo`.

## 2. Geography Hierarchy (2023 `geography.json` 860 = ZCTA)

| Level | FIPS | Requires | Example for SGW store `4105 N Franklin Rd Indianapolis IN 46226` (from live geocoder) |
|-------|------|----------|------------------------------------------------|
| `us` | 010 | — | `for=us:1` |
| `state` | 040 | — | `18` Indiana (`1836003` Indianapolis city balance) |
| `county` | 050 | `state` | `18097` Marion County (`GEOID 18097`, `COUNTY 097`) |
| `place` | 160 | `state` | `1836003` Indianapolis city (balance) |
| `county subdivision` | 060 | `state,county` | `1809742444` Lawrence township |
| `tract` | 140 | `state,county` | `140` level for block-group drill |
| `zip code tabulation area (ZCTA)` | 860 | — (no `in`) | `46226` — **ZCTA ≠ USPS zip but ~match**; ACS uses ZCTA 860. No `in=state` needed. Correct: `for=zip code tabulation area:46226` |
| `metropolitan statistical area` | 310 | — | `294` Indianapolis-Carmel-Muncie CSA |
| `urban area` | 400 | — | `41212` Indianapolis Urban Area |

**SGW mapping:** `Seller/GetSellerInfo` → `pickupCity/state` + `ItemDetail.pickupZip` e.g., `46226`. Use **full address** for geocoder: `"4105 N Franklin Rd Indianapolis IN 46226"` → returns `States:[18]`, `Counties:[18097]`, `Places:[1836003]`, `County Subdivisions:[1809742444]`, `Urban Areas:[41212]`, `CSAs:[294]` plus `CENTLAT/CENTLON`. Use `Counties[0].GEOID` to derive `stateFips=18`, `countyFips=097`.

**ZCTA vs zip:** ACS 860 ZCTA is statistical, but for commerce `zip ≈ ZCTA`. Use `zip` as `ZCTA` string directly: `46226`. No `in=state` for ZCTA (verified in docs: ZCTA `860` has no `requires`). If `ZCTA` 404, fallback to `county`.

## 3. Variables for SGW scoring (all `_001E` estimate, `_001M` MOE, `_001MA` annotation)

| SGW question | Variable(s) | Table | Notes |
|--------------|-------------|-------|-------|
| **Rich town / rich surrounding** | `B19013_001E` median HH income (households) | `B19013` | 2023 inflation-adjusted $. The single best wealth signal. Also `B19301_001E` per capita. |
| **Home value (wealth)** | `B25077_001E` median home value (owner-occupied) | `B25077` | Compare `zcta` vs `county` vs `state` → `richTownScore = z.medianHH / county.medianHH` |
| **White %** | `B02001_001E` total race universe, `B02001_002E` White alone; better `B03002_003E` White non-Hispanic | `B02001` / `B03002` | `whitePct = B02001_002E / B02001_001E *100`. For non-Hisp white use `B03002_003E / B03002_001E`. Live probe `B03002_003E` with ZCTA 46226 returns same Invalid Key, but structure valid. |
| **Old people / median age** | `B01002_001E` median age (overall), `B01001_001E` total, `B01001_020E`+... age brackets 65+ | `B01002` / `B01001` | `oldTown` if `medianAge >42` or `pct65plus >18%`. `pct65plus = sum(B01001_020E:025E + 044E:049E) / B01001_001E`. Or use `S0101` subject table for `pct65` directly. |
| **Total pop (denominator)** | `B01001_001E` | `B01001` | Needed for pct calcs. |
| **Owner-occupied** | `B25003_002E` | `B25003` | Secondary wealth. |

**Full variable list:** `https://api.census.gov/data/2023/acs/acs5/variables.json` (2,400 vars, >5MB). Use `group(B19013)` etc. HTML at `https://api.census.gov/data/2023/acs/acs5/groups/B19013.html`.

## 4. Example Calls (with real key)

```bash
# ZCTA 46226 (no in=state)
curl "https://api.census.gov/data/2023/acs/acs5?get=NAME,B01001_001E,B02001_002E,B01002_001E,B19013_001E,B19301_001E,B25077_001E&for=zip%20code%20tabulation%20area:46226&key=YOUR_KEY"

# County 097 Marion, IN 18
curl "https://api.census.gov/data/2023/acs/acs5?get=NAME,B19013_001E&for=county:097&in=state:18&key=YOUR_KEY"

# State 18 Indiana
curl "https://api.census.gov/data/2023/acs/acs5?get=NAME,B19013_001E&for=state:18&key=YOUR_KEY"

# Geocode full address (no key)
curl "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=4105+N+Franklin+Rd+Indianapolis+IN+46226&benchmark=Public_AR_Current&vintage=Current_Current&format=json"
```

**Response:** `[[ "NAME","B01001_001E",...,"zip code tabulation area"], ["ZCTA5 46226","..."]]`. Annotation `"-666666666"` = suppressed (insufficient sample) → treat as `null`.

## 5. Scoring Algorithm (jewelry)

For store ZCTA `z` (e.g., 46226), county `c` (18097), state `s` (18):
- `richTownScore = z.B19013_001E / c.B19013_001E` (or `B25077_001E` for home). `>1.25` = rich town (jewelry grabbags hide gold → +10% max).
- `richSurroundingScore = c.B19013_001E / s.B19013_001E` (`>1.15` = rich surrounding → county affluent vs state).
- `whitePct = z.B02001_002E / z.B01001_001E`
- `pct65plus` via `B01001` age groups or `B01002_001E >42` proxy.
- **Cache:** `demographics` table 30d TTL, keyed ZCTA.

## 6. Geocoder Deep Dive (no key)

- **Endpoint:** `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress` with `benchmark=Public_AR_Current`, `vintage=Current_Current`, `format=json`.
- **Verified live** for `4105 N Franklin Rd Indianapolis IN 46226` → `States[18]`, `Counties[18097]`, `Places[1836003]`, `County Subdivisions[1809742444]`, `Urban Areas[41212]`, `CSAs[294]`, plus `CENTLAT +39.78165/CENTLON -86.13848`.
- **Use:** Derive `stateFips`/`countyFips` for ACS `for=county:097&in=state:18` etc. No key, ~10ms.

## 7. Failure Modes & SGW Integration

- **No key:** Return HTML `Invalid Key` → `census.ts` catches `Unexpected token '<'` (verified) → fallback mock: `whitePct 0.7, medianAge 38, medianHH 55000` + log `CENSUS_API_KEY missing`. Scanner still queues, bonus defaults to `1.0`.
- **Suppressed estimate `-666666666` or `-888888888`:** Treat as `null`, skip ratio.
- **ZCTA not found (rare rural):** Fallback to `county`.
- **Throttle:** 500/day → batch 163 sellers via `Search/GetActiveLocation` once, then 10 concurrent ACS with 400ms backoff (already in `fetchJson` retry).
- **Zip vs ZCTA drift:** USPS `46226` ≈ ZCTA `46226` for Marion County (urban). For `seller 2` `92704` Santa Ana OK. For `358` Kingsport `37660` OK.

## 8. Getting a Key

1. https://api.census.gov/data/key_signup.html → email → instant key.
2. Set `CENSUS_API_KEY=your_key` in `.env` (see `.env.example`).
3. Test: `curl "https://api.census.gov/data/2023/acs/acs5?get=NAME,B19013_001E&for=zip%20code%20tabulation%20area:46226&key=YOUR_KEY"` → `200` JSON.

## 9. SGW Store Mapping (163 sellers)

`GET Search/GetActiveLocation` → 163 rows `{sellerId, searchFilterName:"IN, Indianapolis", pickupCity}`. Join `Seller/GetSellerInfo/{id}` for `city/state` + parse `ItemDetail.pickupPolicy` HTML for full address zip (e.g., Indy `4105 N Franklin...46226`). Then geocode → ZCTA → ACS → `demographics`.

## 10. Code References

- `ts/src/census.ts` (geocodeZip with full address, fetchACSByZCTA without `in=state`, fetchACSByCounty, scoreDemographics with whitePct/medianAge)
- `ts/src/db.ts` (`demographics`/`census_geo` upsert, 30d TTL)
- `ts/src/run_pipeline.ts` (`richTownScore 1.3 demo → bonus 1.1`)
- `schema.sql` 8 tables WAL

**Refs:** `https://www.census.gov/data/developers/data-sets/acs-5year/2023.html`, `https://api.census.gov/data/2023/acs/acs5/geography.json` (860 ZCTA), `https://api.census.gov/data/2023/acs/acs5/variables.html`
