Here is a clean **operator cheat sheet** you can save as:

**`PDR_API_Local_Operator_Cheat_Sheet.md`**

This is designed for **daily use while developing PDR API locally**. It contains the core commands you used today for debugging, observing, and operating the worker system.

---

# PDR API — Local Operator Cheat Sheet

Environment: **Local Dev**
API: `http://127.0.0.1:3000`
Worker: `pm2` managed
Database: `pdr_api_dev`

---

# 1. Load Environment Variables

Always load the same API key the server is using.

```bash
cd ~/Sites/api-dev.perfectdocroot.com

export BASE="http://127.0.0.1:3000"
export PDR_API_KEY="$(grep '^PDR_API_KEY=' .env.production | cut -d= -f2-)"
```

Verify:

```bash
echo "$PDR_API_KEY"
```

---

# 2. Check API Health

```bash
curl -s "$BASE/v1/health" | jq .
```

Expected:

```json
{
  "ok": true,
  "service": "pdr-api"
}
```

---

# 3. Check Worker Status

```bash
curl -s "$BASE/v1/runs/worker-status" \
  -H "X-PDR-API-KEY: $PDR_API_KEY" | jq .
```

Example:

```json
{
  "active_workers": [
    {
      "worker_id": "worker-1",
      "poll_ms": 1000
    }
  ],
  "counts": {
    "queued": 0,
    "running": 0,
    "failed_recent": 2
  }
}
```

---

# 4. Submit Test Run (Async)

Valid payload example:

```bash
curl -s -X POST "$BASE/v1/runs" \
  -H "Content-Type: application/json" \
  -H "X-PDR-API-KEY: $PDR_API_KEY" \
  -d '{
    "domain_id": "healthcare",
    "execution": { "mode": "async" },
    "input_payload": {
      "hello": "world"
    }
  }' | jq .
```

---

# 5. Stress Test Queue

```bash
for i in $(seq 1 10); do
  curl -s -X POST "$BASE/v1/runs" \
  -H "Content-Type: application/json" \
  -H "X-PDR-API-KEY: $PDR_API_KEY" \
  -d "{\"domain_id\":\"healthcare\",\"execution\":{\"mode\":\"async\"},\"input_payload\":{\"hello\":\"world\"}}" \
  | jq -r '.run.id'
done
```

---

# 6. Inspect Run Queue

```bash
mysql -h 127.0.0.1 -u pdr_local -p -D pdr_api_dev -e \
"SELECT id,status,domain_id,contract_version,created_at,locked_by,locked_at
FROM runs
ORDER BY created_at DESC
LIMIT 10;"
```

---

# 7. Inspect Run Lifecycle

```bash
mysql -h 127.0.0.1 -u pdr_local -p -D pdr_api_dev -e \
"SELECT *
FROM run_steps
ORDER BY created_at DESC
LIMIT 20;"
```

---

# 8. Inspect Contract Schema

```bash
mysql -h 127.0.0.1 -u pdr_local -p -D pdr_api_dev -e \
"SELECT domain_id,contract_version,schema_json
FROM contracts;"
```

Example schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "hello": { "type": "string" }
  },
  "required": ["hello"]
}
```

---

# 9. Check Worker Heartbeats

```bash
mysql -h 127.0.0.1 -u pdr_local -p -D pdr_api_dev -e \
"SELECT * FROM worker_heartbeats;"
```

---

# 10. PM2 Operations

### List processes

```bash
pm2 list
```

### Restart worker

```bash
pm2 restart pdr-worker
```

### Restart API

```bash
pm2 restart pdr-api
```

### Restart everything

```bash
pm2 restart ecosystem.config.js --update-env
```

### View logs

```bash
pm2 logs
```

Worker only:

```bash
pm2 logs pdr-worker
```

---

# 11. Reset Local Queue (Optional)

Sometimes useful during testing.

```bash
mysql -h 127.0.0.1 -u pdr_local -p -D pdr_api_dev -e \
"DELETE FROM runs;"
```

or

```bash
TRUNCATE runs;
```

---

# 12. Typical Debug Flow

When something fails:

1️⃣ Check API health

```
/v1/health
```

2️⃣ Check worker status

```
/v1/runs/worker-status
```

3️⃣ Inspect runs table

```
SELECT status FROM runs
```

4️⃣ Inspect run_steps

```
SELECT * FROM run_steps
```

5️⃣ Inspect contract schema

```
SELECT schema_json FROM contracts
```

6️⃣ Check worker logs

```
pm2 logs pdr-worker
```

---

# Core Mental Model

The system pipeline is:

```
POST /runs
      ↓
runs table (queued)
      ↓
worker polls queue
      ↓
run_steps lifecycle
      ↓
contract validation
      ↓
succeeded / failed
```

---

# Recommended Operator Habit

Before debugging anything:

```
pm2 list
curl /v1/health
curl /v1/runs/worker-status
```

These three commands diagnose **90% of issues**.
