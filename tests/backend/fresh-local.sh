#!/usr/bin/env bash
set -euo pipefail
# Creates a NEW cluster only, refuses existing path; never reads managed PG defaults.
test "$(id -u)" != 0 || { printf 'Run as a disposable non-root OS user\n'; exit 2; }
# Pin intentionally upgraded 17.9 -> 17.11 on 2026-11-04 (maintained patch release with security fixes;
# 17.9 was our own choice, not a challenge requirement). Earlier 17.9 runs/failed rehearsals stay historical.
# Official acquisition: https://ftp.postgresql.org/pub/source/v17.11/postgresql-17.11.tar.bz2
#   sha256 dd27f2b3c59e73ed14aa3324901242bf69a032a6347805f274e6260322d42979
# or container docker.io/library/postgres:17.11@sha256:3b0cda93be7c8dba2ed484d19393d93845dc3dafb88973e248ba8e6d99d784e1
PG_BIN=${TV_LOCAL_PG_BIN:?Set absolute bin path to pinned PostgreSQL 17.11 distribution}
test "$($PG_BIN/postgres --version)" = 'postgres (PostgreSQL) 17.11' || { printf 'PostgreSQL 17.11 required\n'; exit 2; }
test "$(bun --version)" = '1.4.4' || { printf 'Bun 1.4.4 required for this rehearsal\n'; exit 2; }
ROOT=$(mktemp -d /tmp/trustvault-fresh.XXXXXX)
trap '"$PG_BIN/pg_ctl" -D "$ROOT/data" -m immediate stop >/dev/null 2>&1 || true' EXIT
"$PG_BIN/initdb" -D "$ROOT/data" -A trust --no-locale > "$ROOT/init.log"
"$PG_BIN/pg_ctl" -D "$ROOT/data" -l "$ROOT/server.log" -o "-h 127.0.0.1 -p 55432 -k $ROOT" start
PGSSLMODE=disable "$PG_BIN/psql" -h 127.0.0.1 -p 55432 -U "$(id -un)" -d postgres -v ON_ERROR_STOP=1 -c 'CREATE DATABASE tv_test'
TV_TEST_DATABASE_URL="postgres://$(id -un)@127.0.0.1:55432/tv_test" bun tests/backend/run.mjs
