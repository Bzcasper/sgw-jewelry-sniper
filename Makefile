.PHONY: setup db scan poll snipe-ts snipe-rs dry-run fmt lint test typecheck format format-check clippy deny audit
setup:
	cp -n .env.example .env || true
	python3 -c "import sqlite3; con=sqlite3.connect('data/sgw_jewelry.db'); con.executescript(open('schema.sql').read()); print('db ok')"
	cd ts && npm i
	cargo --version >/dev/null 2>&1 && cd rs && cargo check || echo "install rustup: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"

fmt:
	cd ts && npx prettier --write "src/**/*.ts" "*.ts" "tests/**/*.ts" "../*.md" 2>&1 | tail -n 5
	cargo fmt --manifest-path rs/Cargo.toml 2>&1 | head -n 20 || true

lint:
	cd ts && npx eslint src --ext .ts
	cargo clippy --manifest-path rs/Cargo.toml -- -D warnings 2>&1 | head -n 40 || echo "clippy needs cargo"

typecheck:
	cd ts && npx tsc --noEmit

format-check:
	cd ts && npx prettier --check "src/**/*.ts" "*.ts" "tests/**/*.ts"
	cargo fmt --manifest-path rs/Cargo.toml -- --check 2>&1 | head -n 20 || true
	@test -f .env.example && echo ".env.example ok" || (echo "missing .env.example"; exit 1)

test:
	cd ts && npx tsc --noEmit && npm test
	python3 -c "import sqlite3; con=sqlite3.connect(':memory:'); con.executescript(open('schema.sql').read()); print('schema ok')"

deny:
	cargo deny check --manifest-path rs/Cargo.toml 2>&1 | head -n 40 || echo "cargo deny not installed: cargo install cargo-deny"

audit:
	npm audit --prefix ts 2>&1 | tail -n 20
	cargo audit --manifest-path rs/Cargo.toml 2>&1 | tail -n 20 || echo "cargo audit not installed"

db: ; python3 -c "import sqlite3; con=sqlite3.connect('data/sgw_jewelry.db'); cur=con.execute(\"SELECT name FROM sqlite_master WHERE type='table'\"); print(sorted([r[0] for r in cur]))"
scan: ; cd ts && npx tsx src/catalog.ts --jewelry --low 10 --high 5000 --desc true
poll: ; cd ts && npx tsx src/poller.ts --last 10m --concurrency 5
snipe-ts: ; cd ts && npx tsx sniper.ts
snipe-rs: ; cd rs && cargo run --release
dry-run: ; FIRE_BEFORE_MS=9000 ITEMS=275585046:1 BEARER=dry npx --prefix ts tsx sniper.ts; echo "expect -4/-5 no win"
