#!/usr/bin/env bash
set -e

echo "PerfectDocRoot DB Bootstrap"

RESET_MODE=0

if [[ "$1" == "--reset" ]]; then
  RESET_MODE=1
  echo "RESET mode enabled: database will be dropped and recreated"
fi

# Locate repo root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"

cd "$REPO_ROOT"

# Load env variables
if [ -f ".env.local" ]; then
  export $(grep -v '^#' .env.local | xargs)
else
  echo "ERROR: .env.local not found in repo root."
  exit 1
fi

echo ""
echo "Using database: $DB_NAME"
echo "Host: $DB_HOST"

# Reset database if requested
if [[ "$RESET_MODE" == "1" ]]; then
  echo ""
  echo "Dropping database $DB_NAME ..."
  mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" -e \
  "DROP DATABASE IF EXISTS $DB_NAME;"
fi

# Create database
echo ""
echo "Ensuring database exists..."
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" -e \
"CREATE DATABASE IF NOT EXISTS $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "Database ready."

# Load schema
echo ""
echo "Importing schema..."
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < db/schema.sql

echo "Schema imported."

# Seed contracts
echo ""
echo "Seeding contracts..."
cd app
node scripts/seed-contracts.js

echo ""
echo "Bootstrap complete."
echo "Next step:"
echo "npm run start-api"