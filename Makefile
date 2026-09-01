.PHONY: setup db scan poll snipe-ts snipe-rs dry-run fmt lint test
setup:
	cp -n .env.example .env || true
	python3 -c "import sqlite3; con=sqlite3.connect('data/sgw_jewelry.db'); con.executescript(open('schema.sql').read()); print('db ok')"
	cd ts && npm i
	cargo --version >/dev/null 2>&1 && cd rs && cargo check || echo "install rustup"

db:
	python3 -c "import sqlite3; con=sqlite3.connect('data/sgw_jewelry.db'); cur=con.execute(\"SELECT name FROM sqlite_master WHERE type='table'\"); print(sorted([r[0] for r in cur]))"

scan:
	cd ts && npx tsx src/catalog.ts --jewelry --low 10 --high 5000 --desc true

poll:
	cd ts && npx tsx src/poller.ts --last 10m --concurrency 5

snipe-ts:
	cd ts && npx tsx sniper.ts

snipe-rs:
	cd rs && cargo run --release

dry-run:
	FIRE_BEFORE_MS=9000 ITEMS=275585046:1 BEARER=dry npx --prefix ts tsx sniper.ts; echo "expect -4/-5 no win"

fmt:
	cd ts && npx tsc --noEmit
	cd rs && cargo fmt --check || true

test:
	cd ts && npx tsc --noEmit
	python3 -c "import sqlite3; con=sqlite3.connect(':memory:'); con.executescript(open('schema.sql').read()); print('schema ok')"
