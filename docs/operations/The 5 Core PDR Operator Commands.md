# The 5 Core PDR Operator Commands

## 0️⃣ API Health Check

curl -s https://api-dev.perfectdocroot.com/v1/health

Expected:

{
  "ok": true,
  "service": "pdr-api"
}

Meaning:

Result	Interpretation
no response	API down
500 error	app crash
ok=true	API layer healthy

This isolates network/API problems vs queue problems immediately.

## 1️⃣ System Health Check (First Command)

This is the **single most important command**.

```bash
curl -s "$BASE/v1/runs/worker-status" \
  -H "X-PDR-API-KEY: $PDR_API_KEY" | jq .
```

### What it tells you

```
active_workers
queued
running
failed_recent
```

Example:

```json
{
  "active_workers": [
    {
      "worker_id": "worker-1",
      "host": "Roberts-iMac.local"
    }
  ],
  "counts": {
    "queued": 0,
    "running": 0,
    "failed_recent": 0
  }
}
```

### Interpretation

| Signal                     | Meaning                      |
| -------------------------- | ---------------------------- |
| `active_workers: []`       | worker is dead               |
| `queued growing`           | worker stuck                 |
| `running > 1`              | concurrency bug              |
| `failed_recent increasing` | contract or execution errors |

---

# 2️⃣ Worker Process Check

Verify PM2 processes.

```bash
pm2 ls
```

Expected:

```
pdr-api
pdr-worker
```

Example:

```
id  name        status
0   pdr-api     online
1   pdr-worker  online
```

### Interpretation

| Result         | Meaning             |
| -------------- | ------------------- |
| missing worker | queue won't process |
| restarts > 0   | worker crashing     |
| memory spikes  | execution bug       |

---

# 3️⃣ Worker Logs

When something behaves strangely:

```bash
pm2 logs pdr-worker --lines 50
```

or live:

```bash
pm2 logs pdr-worker
```

### What you're looking for

```
claim run
processing run
completed run
error
```

If nothing appears:

```
worker not polling
```

---

# 4️⃣ Queue State (Direct DB)

Check real queue state:

```bash
mysql -h 127.0.0.1 -u pdr_local -p -D pdr_api_dev -e \
"SELECT status, COUNT(*) FROM runs GROUP BY status;"
```

Example:

```
queued      12
running      1
succeeded   84
failed       2
```

### Interpretation

| Pattern       | Meaning           |
| ------------- | ----------------- |
| queued rising | worker stalled    |
| running stuck | crash mid-run     |
| failed spike  | validation errors |

---

# 5️⃣ Worker Heartbeat Check

Verify worker is alive.

```bash
mysql -h 127.0.0.1 -u pdr_local -p -D pdr_api_dev -e \
"SELECT worker_id,host,pid,last_seen_at FROM worker_heartbeats;"
```

Example:

```
worker-1  Roberts-iMac.local  12255  2026-03-03 17:04:28
```

### Interpretation

| Signal             | Meaning          |
| ------------------ | ---------------- |
| timestamp updating | worker healthy   |
| timestamp frozen   | worker dead      |
| multiple rows      | multiple workers |

---

# The 30-Second Diagnostic Flow

When something breaks:

### Step 1

```
worker-status
```

If healthy → done.

---

### Step 2

```
pm2 list
```

Worker missing?

```
pm2 restart pdr-worker
```

---

### Step 3

Check logs

```
pm2 logs pdr-worker
```

---

### Step 4

Check DB queue

```
SELECT status,count(*) FROM runs
```

---

### Step 5

Check heartbeat

```
worker_heartbeats
```

---

# One Optional Super Command

You can combine several signals:

```bash
watch -n 1 '
curl -s "$BASE/v1/runs/worker-status" -H "X-PDR-API-KEY: $PDR_API_KEY" | jq ".counts"
'
```

This gives you a **live dashboard**.

Example:

```
queued: 15
running: 1
failed_recent: 0
```

Watching this during stress tests is extremely helpful.

---

# The Operator Mental Model

Think of the system as:

```
API
 ↓
queue (DB)
 ↓
worker
 ↓
execution engine
 ↓
artifacts
```

Every problem is one of these layers.

The 5 commands isolate which one.

---

# What You Should Do Next

Now that you have the **operator toolkit**, run the tests in this order:

### 1️⃣ Queue Stress

```
./scripts/pdr-run-stress.sh 50
```

Watch:

```
worker-status
```

---

### 2️⃣ Failure Test

```
./scripts/pdr-failure-test.sh 30
```

Watch:

```
pm2 logs pdr-worker
```

---

After you run those, we can also add a **very powerful tool used in production queue systems**:

**`pdr-top` — a live PDR system dashboard**

It shows:

```
queue
running jobs
worker health
recent failures
```

in one terminal window.
