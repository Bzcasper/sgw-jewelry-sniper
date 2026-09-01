# Rules — Jewelry Sniper Guardrails

**Applies to all work in `SPEC-JEWELRY.md` + `PLAN.md`. Violations block PR.**

1. **STRING booleans:** `POST Search/ItemListing` must send `"true"/"false"` strings, not JSON `true`. `500` = type drift → fix via `AGENTS.md` Scanner escalation.
2. **Throttle:** `0.6s` min per `ItemListing`, `40/page`, shard to bypass `maxTotalRecords=10k`. Never hammer `buyerapi` (163 sellers × 63 cats sequential).
3. **Auth:** `Authorization: Bearer <accessToken>` from `SignIn/Login`; rotate via `RefreshToken` on `result -110`. Bearer env only, `0600` perms, never commit.
4. **Clock:** Always `serverOffset = Date header + RTT/2 - local` via `POST Dashboard/GetCurrentTime`; `endTime` parse `RFC3339` + offset, fallback `ItemDetail` if `0001-01-01`.
5. **Fire window:** Default `FIRE_BEFORE_MS=900` (env), refresh `minimumBid` at `T-5000`, spin 5ms last 50ms. Retry `-4/-5` only if `now < end-200ms`.
6. **Shipping gate:** Before queueing, `POST CalculateShipping` with your zip; skip if `>30% currentPrice` or `NOSERVICE`. Tested `46226` vs `90210` in `AGENTS.md`.
7. **Jewelry scope:** Only `selectedCategoryIds` jewelry family (`87,88,2240` + subs via `GetCategoryDropdown`); dual-pass `searchDescriptions` false→true, diff is hidden value.
8. **NDJSON discipline:** Every scanner write appends NDJSON (`items.ndjson`, `price_ticks.ndjson`) like `frx` `fingerprint-flow.ndjson`, then SQLite mirror (`INSERT OR IGNORE`). No full JSON rewrites.
9. **Census cache:** `api.census.gov` 500 qps, `CENSUS_API_KEY` env, `demographics`+`census_geo` TTL 30d, ZCTA primary, county fallback.
10. **Bidder masking:** Store masked `a***b` as-is; aggregate `lastSecondPct` degrades to `numBids` velocity if anon.
11. **Concurrency cap:** Max 5 snipes parallel (spec locked), jitter `±150ms`, no thundering herd same `endTime`.
12. **Snipe-only:** No `Order/BuyNow`, `Checkout/process-payment`, `PickupScheduling` auto in v1 — manual win handling.
13. **No WASM/JSVMP:** Site plain Angular, no signing; `frx-isolated` only for Bearer capture, not payload trace.
14. **Observability:** Every `PlaceBid` logs `sniper_runs` {`fireAt`, `offsetMs`, `bidAmount`, `result`, `latencyMs`} + NDJSON, no token leakage.
15. **Legal:** Own account only, `AS IS` 7-day damage / 14-day pickup (`5` Indy `4105 N Franklin Rd`), respect `UseBuyerPrefs`.
16. **Schema:** `schema.sql` WAL, `PRAGMA foreign_keys=ON`, 8 tables validated `sqlite3 :memory:` before merge.
17. **Progress:** Check `[x]` in `PROGRESS.md` per PR; no milestone lift until exit criteria green (e.g., M2 `watched_auctions >15000`).
18. **frx hygiene:** `HOME=isolated-home` Firefox `153.0a1` via `run-isolated.sh`, `profile-$(date +%s)` per run, never touch default profile.
19. **Secrets:** `CENSUS_API_KEY`, `BEARER`, `REFRESH` in env, `.env` gitignored, `currentUserObject` never in NDJSON.
20. **Testing:** Dry-run `FIRE_BEFORE_MS=9000` on `Gallery views<50` `<$15` before any live `<5` USD win; no live bid without `PROGRESS.md` M4 dry-run checkbox.

**References:** `API-CONTRACTS.md:1` 257 endpoints, `DB-SPEC.md:1`, `SPEC-JEWELRY.md:1` §7.
