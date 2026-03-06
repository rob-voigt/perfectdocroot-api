# PerfectDocRoot Platform Architecture

## System Overview

```
                     ┌───────────────────────┐
                     │        Users          │
                     │ Developers / Operators│
                     └──────────┬────────────┘
                                │
                                │
                                ▼
                    ┌─────────────────────────┐
                    │        WordPress        │
                    │  PerfectDocRoot UI      │
                    │                         │
                    │ - Guided Creation UI    │
                    │ - Governance UI         │
                    │ - Admin dashboards      │
                    │ - Domain templates      │
                    └──────────┬──────────────┘
                               │
                               │ REST / API Calls
                               ▼
                     ┌──────────────────────┐
                     │       PDR API        │
                     │ api.perfectdocroot   │
                     │                      │
                     │ - Run creation       │
                     │ - Contract lookup    │
                     │ - Validation engine  │
                     │ - Artifact registry  │
                     │ - Provenance engine  │
                     └──────────┬───────────┘
                                │
                                │
                                ▼
                        ┌───────────────┐
                        │   Run Queue   │
                        │   (MySQL)     │
                        │               │
                        │ runs table    │
                        └──────┬────────┘
                               │
                               │
                               ▼
                        ┌───────────────┐
                        │   Workers     │
                        │  pdr-worker   │
                        │               │
                        │ - poll queue  │
                        │ - execute run │
                        │ - record steps│
                        └──────┬────────┘
                               │
                               │
                               ▼
                     ┌──────────────────────┐
                     │  Execution Engine    │
                     │                      │
                     │ - draft stage        │
                     │ - validation stage   │
                     │ - repair stage       │
                     │ - finalize stage     │
                     └──────────┬───────────┘
                                │
                                │
                                ▼
                ┌─────────────────────────────────┐
                │        Governance Layer         │
                │                                 │
                │  Contracts                      │
                │  JSON Schema                    │
                │                                 │
                │  Domain rules                   │
                │  Execution constraints          │
                └──────────┬──────────────────────┘
                           │
                           │
                           ▼
               ┌───────────────────────────────┐
               │        Provenance Layer       │
               │                               │
               │  seed_hash                    │
               │  input_hash                   │
               │  evidence_hash                │
               │                               │
               │ deterministic execution       │
               └──────────┬────────────────────┘
                          │
                          │
                          ▼
             ┌──────────────────────────────┐
             │          Artifacts           │
             │                              │
             │ uploaded_artifacts           │
             │ contract_snapshots           │
             │ validation_reports           │
             │ evidence files               │
             └──────────┬───────────────────┘
                        │
                        │
                        ▼
             ┌──────────────────────────────┐
             │        Observability         │
             │                              │
             │ worker_heartbeats            │
             │ run_steps                    │
             │ worker-status endpoint       │
             │ queue metrics                │
             └──────────────────────────────┘
```

---

# Key Architectural Layers

## 1. WordPress Layer

Purpose:

```
developer experience
governed content creation
operator UI
```

Examples:

```
/governed-content-creation
admin dashboards
domain packs
template loading
```

WordPress acts as the **human interface to PDR**.

It does **not execute runs directly**.

---

# 2. PDR API Layer

The API is the **governed execution gateway**.

Responsibilities:

```
run creation
authentication
contract lookup
artifact ingestion
validation orchestration
```

Primary endpoints:

```
POST /v1/runs
GET /v1/runs/:id
GET /v1/runs/worker-status
POST /v1/uploaded-artifacts
```

---

# 3. Run Queue

Stored in MySQL:

```
runs
run_steps
```

This queue provides:

```
durable execution
async processing
audit history
```

Run states:

```
queued
running
succeeded
failed
```

---

# 4. Worker Layer

Workers execute the pipeline.

Example:

```
pdr-worker
```

Responsibilities:

```
poll queue
claim runs
execute lifecycle
write steps
update run status
```

Current configuration (MS15B):

```
MAX_CONCURRENT_RUNS = 1
poll interval = 1000ms
```

Future versions can support:

```
multiple workers
distributed workers
queue backends
```

---

# 5. Execution Engine

The engine implements the **governed lifecycle**.

Stages:

```
draft
validate
repair
finalize
```

Each stage produces:

```
run_steps records
```

---

# 6. Governance Layer

Contracts enforce **input discipline**.

Example contract:

```
domain_id = healthcare
contract_version = 0.1
```

Schema:

```
JSON Schema
```

Example:

```
required: hello
additionalProperties: false
```

This ensures:

```
deterministic inputs
domain governance
schema validation
```

---

# 7. Provenance Layer

Provenance ensures **traceability**.

Recorded hashes:

```
seed_hash
input_hash
evidence_hash
```

Stored in:

```
runs.provenance
```

This allows:

```
reproducible runs
audit trails
integrity guarantees
```

---

# 8. Artifact Layer

Artifacts are persisted evidence objects.

Examples:

```
uploaded_artifacts
contract_snapshots
validation_reports
```

Artifacts enable:

```
document traceability
external file validation
evidence manifests
```

---

# 9. Observability Layer

Operational visibility comes from:

```
run_steps
worker_heartbeats
worker-status endpoint
```

Operators can inspect:

```
queue state
worker health
execution history
validation failures
```

---

# Platform Mental Model

PerfectDocRoot is **not a chatbot system**.

It is a **governed execution platform**.

The architecture enforces:

```
structured inputs
deterministic execution
contract governance
traceable outputs
```

---

# Why This Diagram Matters for MS16

MS16 will begin touching the **governance layer**.

Specifically:

```
contract schema discipline
payload shape clarity
contract seeding
developer ergonomics
```

This architecture diagram shows where those concerns live in the system.

---

# Long-Term Platform Direction

The architecture naturally supports future expansion:

```
multi-worker clusters
external queue systems
artifact storage services
domain-specific contract packs
AI tool integrations
```

This is how PerfectDocRoot evolves from:

```
single-node API
```

into a

```
governed AI execution platform
```

---

If you'd like, the **next diagram that becomes incredibly useful for MS16** is a very small but powerful one called:

**“The Contract Governance Triangle”**

It explains the relationship between:

```
contract schema
payload shape
execution lifecycle
```

That model becomes the **core mental model for every PDR domain pack**.
