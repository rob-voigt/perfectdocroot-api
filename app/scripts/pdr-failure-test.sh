#!/usr/bin/env bash
set -euo pipefail

BASE=${BASE:-"http://127.0.0.1:3000"}
API_KEY=${PDR_API_KEY:-""}
RUNS=${1:-20}

if [ -z "$API_KEY" ]; then
  echo "ERROR: PDR_API_KEY not set"
  exit 1
fi

echo
echo "=== FAILURE MODE TEST ==="
echo "Runs: $RUNS"
echo

echo "Submitting runs..."

for i in $(seq 1 $RUNS); do
  curl -s -X POST "$BASE/v1/runs" \
    -H "Content-Type: application/json" \
    -H "X-PDR-API-KEY: $API_KEY" \
    -d '{"working_payload":{"failure_test":true}}' \
    > /dev/null
done

echo "Runs queued."

echo
echo "Initial queue state:"
curl -s "$BASE/v1/runs/worker-status" -H "X-PDR-API-KEY: $API_KEY" | jq '.counts'

echo
echo "Waiting 5 seconds for worker to start processing..."
sleep 5

echo
echo "Stopping worker (simulating crash)..."
pm2 stop pdr-worker

echo
echo "Queue state after worker stopped:"
curl -s "$BASE/v1/runs/worker-status" -H "X-PDR-API-KEY: $API_KEY" | jq '.counts'

echo
echo "Waiting 5 seconds..."
sleep 5

echo
echo "Restarting worker..."
pm2 start pdr-worker

echo
echo "Watching queue recovery..."
while true; do
  STATUS=$(curl -s "$BASE/v1/runs/worker-status" \
    -H "X-PDR-API-KEY: $API_KEY")

  echo "$STATUS" | jq '.counts'

  QUEUED=$(echo "$STATUS" | jq '.counts.queued')
  RUNNING=$(echo "$STATUS" | jq '.counts.running')

  if [ "$QUEUED" -eq 0 ] && [ "$RUNNING" -eq 0 ]; then
    echo
    echo "Queue fully drained."
    break
  fi

  sleep 1
done

echo
echo "Final DB run states:"
mysql -h 127.0.0.1 -u pdr_local -p -D pdr_api_dev \
  -e "SELECT status, COUNT(*) FROM runs GROUP BY status;"