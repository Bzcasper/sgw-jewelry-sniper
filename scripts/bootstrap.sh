#!/usr/bin/env bash
set -euo pipefail
cp -n .env.example .env || true
mkdir -p data
python3 -c "import sqlite3; con=sqlite3.connect('data/sgw_jewelry.db'); con.executescript(open('schema.sql').read()); print('db ok')"
cd ts && npm i && npx tsc --noEmit && echo "ts ok"
# cargo check if installed
if command -v cargo >/dev/null; then (cd ../rs && cargo check && echo "rs ok"); fi
echo "bootstrap done — see PLAN.md M1"
