# SGW Jewelry Sniper — Vibe-Coding Workspace

**Stack:** Hybrid TS scanner (Node 20) + Rust executor (tokio) + SQLite WAL + Census ACS 5yr + frx-isolated Firefox 153

## Quick Start (fits PLAN.md M1)

```bash
cp .env.example .env   # add BEARER from frx-isolated + CENSUS_API_KEY
make setup             # db + npm + cargo check
make test && make dry-run
# jewelry scan
make scan   # → data/items.ndjson 20k (sharded ItemListing STRING booleans!)
make poll   # 30s ticks 1–5 concurrent
# snipe 1–5 parallel at T-900ms
BEARER=... ITEMS=275585046:30,275772810:50 make snipe-ts  # or snipe-rs
```

## Docs for AI

| File | For |
|------|-----|
| `SPEC-JEWELRY.md` | Product/arch/algo, 7 tables, scoring `richTownScore` + bidder `sigmoid` |
| `PLAN.md` | 5 milestones, 14d, dependencies |
| `PROGRESS.md` | 45 checkboxes `[x]` — update per PR |
| `AGENTS.md` | 5 agents (Scanner, Census, Poller, Executor, QA) handoffs via NDJSON/SQLite |
| `RULES.md` | 20 guardrails (STRING booleans, 0.6s throttle, 30% ship gate, 5 cap) |
| `DB-SPEC.md` + `schema.sql` | 8 tables validated `sqlite3 :memory:` |
| `API-CONTRACTS.md` | buyerapi 257 + Census `B02001_002E/B19013_001E` |
| `AGENT_INSTRUCTIONS.md` + `prompts/system.md` + `.opencode/config.json` | vibe prompts for opencode/claude |
| `ts/src/*` | Scanner scaffolding: `buyerapi.ts` handles quirk, `catalog.ts` shards, `census.ts` ACS, `scoring.ts` bonus, `db.ts` NDJSON |
| `rs/src/*` | Executor: `clock.rs` offset, `buyerapi.rs` PlaceBid, `main.rs` 1–5 spawns |
| `scripts/bootstrap.sh` | One-shot M1 |
| `Makefile` + `docker-compose.yml` + `Dockerfile.*` | `make setup && docker compose up` |

## References (frx-isolated reverse)

- `/tmp/shopgoodwill_api_map.md` — full 257 endpoints, bid contracts `ShowBidModal→PlaceBid`
- `/tmp/sgw_automation_playbook.md` — Tier 1-3 valuable surfaces (1¢ 113k, BuyNow 255k, seller 163)
- `/tmp/endpoints_raw.txt` — 257 unique `apiEndPoint+` strings
- `/tmp/sgw_chunks/` — 24 chunks + `main` 1.68MB
- `/tmp/sgw_out/items.ndjson` — live 631k sample (verified 2026-09-01)

## Rules Quick

- `POST Search/ItemListing` **must** send `"true"/"false"` strings or 500 — see `RULES #1`.
- Throttle `0.6s`, `40/page`, `maxTotalRecords=10k` shard by `sellerId`+`categoryId`.
- Never commit `.env`; frx profile `isolated-home` per run, never default.
