# PerfectDocRoot API — Run Lifecycle Architecture

## High-Level Flow

```
Client
  │
  │  POST /v1/runs
  │
  ▼
PDR API
(run creation handler)
  │
  │ validate request shape
  │ authenticate API key
  │ resolve contract version
  │
  ▼
MySQL Database
runs table
  │
  │ status = queued
  │
  ▼
Worker Poll Loop
(pdr-worker)
  │
  │ poll every N ms
  │ claim queued run
  │ locked_by = worker-id
  │
  ▼
Execution Engine
(processRun)
  │
  │ create draft step
  │ compute input hash
  │
  ▼
Contract Validation
(schema_json)
  │
  │ validate payload
  │ record validation_report
  │
  ├── PASS ──────────────► succeeded
  │
  └── FAIL ──────────────► failed
  │
  ▼
Provenance Generation
(hash pipeline)
  │
  │ seed_hash
  │ input_hash
  │ evidence_hash
  │
  ▼
Run Finalization
runs.status updated
completed_at written
```

---

# Database Tables in the Lifecycle

## runs

Primary run record.

Key fields:

```
id
status
domain_id
contract_version
input_payload
validation_report
result_json
provenance
locked_by
locked_at
attempts
created_at
completed_at
```

Status transitions:

```
queued
running
succeeded
failed
```

---

## run_steps

Detailed lifecycle history.

Example steps:

```
draft
validate
repair (optional)
finalize
```

Example row:

```
step_type = validate
status = fail
```

This table is the **primary debugging timeline**.

---

## contracts

Defines the governance schema.

Example:

```
domain_id: healthcare
contract_version: 0.1
schema_json: JSON Schema
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

This schema determines whether a run **passes or fails validation**.

---

## worker_heartbeats

Tracks active workers.

Fields:

```
worker_id
host
pid
last_seen_at
poll_ms
```

Used by:

```
GET /v1/runs/worker-status
```

---

# Worker Loop Architecture

The worker performs a continuous poll cycle.

```
while (true):

  poll runs WHERE status='queued'

  claim run
  set locked_by / locked_at

  execute processRun()

  finalize run status

  heartbeat
```

Default configuration (MS15B):

```
PDR_WORKER_POLL_MS = 1000
MAX_CONCURRENT_RUNS = 1
```

---

# Observability Endpoints

## API Health

```
GET /v1/health
```

Confirms API process is alive.

---

## Worker Status

```
GET /v1/runs/worker-status
```

Returns:

```
active_workers
queued runs
running runs
recent failures
```

Used for **operator diagnostics**.

---

# Provenance Layer

Each run records deterministic hashes.

```
seed_hash
input_hash
evidence_hash
```

These enable:

```
traceability
auditability
reproducibility
```

Provenance stored in:

```
runs.provenance
```

---

# Full Lifecycle Summary

```
Client Request
      │
      ▼
POST /v1/runs
      │
      ▼
Run persisted
status = queued
      │
      ▼
Worker polls queue
      │
      ▼
Run locked
status = running
      │
      ▼
Execution engine
      │
      ▼
Contract validation
      │
      ├─ pass → succeeded
      │
      └─ fail → failed
      │
      ▼
Provenance recorded
      │
      ▼
Run completed
```

---

# Operational Mental Model

Think of PDR as a **governed execution pipeline**:

```
API
  ↓
Queue
  ↓
Worker
  ↓
Execution Engine
  ↓
Contract Validation
  ↓
Provenance
  ↓
Final Status
```

This separation ensures:

* deterministic processing
* auditable results
* governed AI workflows

---

# Why This Architecture Matters

This model enables PerfectDocRoot to behave like **governed infrastructure for AI execution**, not just a prompt system.

The system guarantees:

```
deterministic inputs
governed schema validation
traceable execution
auditable outputs
```

---

If you'd like, the **next diagram that becomes extremely valuable as the system grows** is the **PerfectDocRoot Platform Architecture diagram**, which shows how:

```
WordPress
Admin UI
PDR API
Workers
Contracts
Artifacts
Provenance
```

all connect together. That diagram will help a lot when you begin **MS16 and the admin/observability work.**
