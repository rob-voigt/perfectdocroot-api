#!/usr/bin/env bash
set -euo pipefail

# -------- CONFIG --------
BASE=${BASE:-"http://127.0.0.1:3000"}
API_KEY=${PDR_API_KEY:-""}
COUNT=${1:-20}
SLEEP=${2:-0.05}
# ------------------------

if [ -z "$API_KEY" ]; then
  echo "ERROR: PDR_API_KEY not set"
  exit 1
fi

echo "=== PDR RUN STRESS TEST ==="
echo "API: $BASE"
echo "Runs: $COUNT"
echo

echo "Creating runs..."

for i in $(seq 1 $COUNT); do
  curl -s -X POST "$BASE/v1/runs" \
    -H "Content-Type: application/json" \
    -H "X-PDR-API-KEY: $API_KEY" \
    -d '{"working_payload":{"stress":true}}' \
    > /dev/null

  printf "."
  sleep $SLEEP
done

echo
echo
echo "Runs submitted."
echo

echo "Watching queue drain..."
echo

while true; do
  STATUS=$(curl -s "$BASE/v1/runs/worker-status" \
    -H "X-PDR-API-KEY: $API_KEY")

  echo "$STATUS" | jq '.counts'

  QUEUED=$(echo "$STATUS" | jq '.counts.queued')
  RUNNING=$(echo "$STATUS" | jq '.counts.running')

  if [ "$QUEUED" -eq 0 ] && [ "$RUNNING" -eq 0 ]; then
    echo
    echo "Queue drained."
    break
  fi

  sleep 1
done

echo
echo "Final DB counts:"

mysql -h 127.0.0.1 -u pdr_local -p -D pdr_api_dev \
  -e "SELECT status, COUNT(*) cnt FROM runs GROUP BY status;"