# AI Vibe-Coding Instructions — Jewelry Sniper

**Read first:** `SPEC-JEWELRY.md`, `RULES.md`, `API-CONTRACTS.md`, `DB-SPEC.md`, `PLAN.md` → `PROGRESS.md` checkbox before coding.

## Stack

- TS scanner: `ts/src/*` (`buyerapi.ts` handles STRING booleans!), `better-sqlite3`, `cheerio`, `axios`.
- Rust executor: `rs/src/*` (`tokio`), `reqwest`, `chrono`.
- DB: `schema.sql` WAL, `data/sgw_jewelry.db` + `data/*.ndjson` append.
- Auth: `frx-isolated` Firefox 153 via `HOME=isolated-home firefox --profile /tmp/p-$(date +%s)` → `currentUserObject` → `BEARER`.

## Vibe prompts (copy to opencode/claude)

- **Scanner:** "Implement `ts/src/catalog.ts` sharded `ItemListing` for jewelry `87/88/2240` dual-pass `searchDescriptions`, 0.6s throttle, `maxTotalRecords=10k` bypass via 163 sellers — see `buyerapi.ts:itemListingBody` and `SPEC §4.1`. Append `data/items.ndjson`."
- **Census:** "Finish `ts/src/census.ts` `geocodeZip→ACS` `B02001_002E/B01002_001E/B19013_001E` and `scoreDemographics` `richTownScore=z/county` per `SPEC §7.1`."
- **Sniper:** "Harden `rs/src/main.rs` + `clock.rs` to `T-5000` refresh and `T-900` spin, retry `-4/-5`, `-110→RefreshToken` per `RULES #5`."

## Guardrails (from RULES.md)

- STRING booleans or 500. Throttle 0.6s. Shipping gate 30% via `CalculateShipping`. Max 5 concurrent ±150ms. NDJSON append. Never commit `.env`.

## Test

`make test` → `tsc --noEmit` + `:memory:` schema. `make dry-run` → `FIRE_BEFORE_MS=9000` on Gallery `views<50` expects `-4/-5`.

## Opencode

See `.opencode/` — skills `agents-sdk` not needed; use `buyerapi` directly. Isolated profile per run, never default.
