# Contributing

1. Read `SPEC-JEWELRY.md`, `RULES.md`, `AGENTS.md`.
2. Branch from `main`: `feat/<scope>` / `fix/<scope>`.
3. Update `PROGRESS.md` checkbox in same PR.
4. Run `make fmt lint test` before push (husky pre-commit runs `lint-staged` + `cargo fmt` + `clippy` + `gitleaks`).
5. Commit via `commitlint` conventional: `feat(scanner): sharded ItemListing`.
6. PR needs `schema.sql` + `tsc --noEmit` green; CI runs `ts` + `rs` + `docker` + `gitleaks` + `CodeQL`.
7. Never commit `.env`, `data/*.db`, or `currentUserObject` tokens.

## Setup

`cp .env.example .env && make setup`
