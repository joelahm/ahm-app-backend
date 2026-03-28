#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MIGRATION_NAME="20260320120000_split_scans_by_keyword"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

DB_HOST="${MYSQL_HOST:-}"
DB_PORT="${MYSQL_PORT:-3306}"
DB_USER="${MYSQL_USER:-}"
DB_PASSWORD="${MYSQL_PASSWORD:-}"
DB_NAME="${MYSQL_DATABASE:-}"

if [[ -z "$DB_HOST" || -z "$DB_USER" || -z "$DB_NAME" ]]; then
  echo "Missing MYSQL_HOST, MYSQL_USER, or MYSQL_DATABASE."
  echo "Set them in .env or the shell before running this script."
  exit 1
fi

MYSQL_ARGS=(
  --host="$DB_HOST"
  --port="$DB_PORT"
  --user="$DB_USER"
  "$DB_NAME"
)

if [[ -n "$DB_PASSWORD" ]]; then
  MYSQL_ARGS+=(--password="$DB_PASSWORD")
fi

echo "Restoring original scan tables if the failed migration left _old tables behind..."
mysql "${MYSQL_ARGS[@]}" <<'SQL'
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `scan_results`;
DROP TABLE IF EXISTS `scan_runs`;
DROP TABLE IF EXISTS `scans`;

RENAME TABLE
  `scan_results_old` TO `scan_results`,
  `scan_runs_old` TO `scan_runs`,
  `scans_old` TO `scans`;

SET FOREIGN_KEY_CHECKS = 1;
SQL

echo "Marking failed migration as rolled back in Prisma..."
npx prisma migrate resolve --rolled-back "$MIGRATION_NAME"

echo "Reapplying migrations..."
npm run prisma:migrate:deploy

echo "Regenerating Prisma client..."
npm run prisma:generate

echo "Recovery finished."
