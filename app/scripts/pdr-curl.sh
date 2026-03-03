#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-https://api-dev.perfectdocroot.com}"
PDR_API_KEY="${PDR_API_KEY:-}"

need_key() {
  if [[ -z "${PDR_API_KEY}" ]]; then
    echo "ERROR: PDR_API_KEY is not set" >&2
    exit 1
  fi
}

json_pretty() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -m json.tool
  elif command -v python >/dev/null 2>&1; then
    python -m json.tool
  elif command -v jq >/dev/null 2>&1; then
    jq .
  else
    cat
  fi
}

cmd="${1:-}"
shift || true

case "${cmd}" in
  health)
    curl -sS "${BASE}/v1/health" | json_pretty
    ;;

  worker-status)
    need_key
    # show HTTP status + body if parsing fails
    curl -sS "${BASE}/v1/worker/status" \
      -H "X-PDR-API-KEY: ${PDR_API_KEY}" \
      | json_pretty
    ;;

  run-get)
    need_key
    RUN_ID="${1:?RUN_ID required}"
    curl -sS "${BASE}/v1/runs/${RUN_ID}" \
      -H "X-PDR-API-KEY: ${PDR_API_KEY}" \
      | json_pretty
    ;;

  run-status)
    need_key
    RUN_ID="${1:?RUN_ID required}"
    curl -sS "${BASE}/v1/runs/${RUN_ID}" \
      -H "X-PDR-API-KEY: ${PDR_API_KEY}" \
      | jq -r '.run.status'
    ;;

  run-poll)
    need_key
    RUN_ID="${1:?RUN_ID required}"
    while true; do
      st=$(curl -sS "${BASE}/v1/runs/${RUN_ID}" \
        -H "X-PDR-API-KEY: ${PDR_API_KEY}" \
        | jq -r '.run.status')
      echo "${st}"
      [[ "${st}" == "succeeded" || "${st}" == "failed" ]] && exit 0
      sleep 1
    done
    ;;

  run-create-async)
    need_key
    DOMAIN_ID="${1:-healthcare}"
    CONTRACT_VERSION="${2:-0.1}"
    curl -sS -X POST "${BASE}/v1/runs" \
      -H "Content-Type: application/json" \
      -H "X-PDR-API-KEY: ${PDR_API_KEY}" \
      -d "{
        \"domain_id\":\"${DOMAIN_ID}\",
        \"contract_version\":\"${CONTRACT_VERSION}\",
        \"input_payload\": {\"hello\":\"world\"},
        \"execution\": {\"mode\":\"async\"},
        \"repair\": {\"enabled\": true, \"max_attempts\": 2}
      }" | json_pretty
    ;;

  run-create-async-ms15a)
    need_key
    ARTIFACT_ID="${1:?ARTIFACT_ID required}"
    curl -sS -X POST "${BASE}/v1/runs" \
      -H "Content-Type: application/json" \
      -H "X-PDR-API-KEY: ${PDR_API_KEY}" \
      -d "{
        \"domain_id\":\"healthcare\",
        \"contract_version\":\"0.1\",
        \"input_payload\": {\"hello\":\"world\"},
        \"inputs\": [
          {\"type\":\"artifact_ref\",\"artifact_id\":\"${ARTIFACT_ID}\",\"purpose\":\"evidence\",\"required\": true}
        ],
        \"execution\": {\"mode\":\"async\"},
        \"repair\": {\"enabled\": true, \"max_attempts\": 2}
      }" | json_pretty
    ;;

  *)
    cat <<EOF
Usage:
  BASE=https://api-dev.perfectdocroot.com PDR_API_KEY=... ./app/scripts/pdr-curl.sh <command> [args]

Commands:
  health
  worker-status
  run-get <RUN_ID>
  run-status <RUN_ID>
  run-poll <RUN_ID>
  run-create-async [domain_id] [contract_version]
  run-create-async-ms15a <ARTIFACT_ID>
EOF
    exit 1
    ;;
esac