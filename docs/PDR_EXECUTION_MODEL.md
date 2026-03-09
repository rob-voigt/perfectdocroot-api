# PerfectDocRoot Execution Model

This document describes how PerfectDocRoot executes governed workflows.

The execution model defines how inputs are validated, processed, and recorded so that every AI workflow produces traceable and inspectable results.

---

## Overview

A PerfectDocRoot workflow executes as a **run**.

A run represents a single governed execution of a workflow using a specific contract version and input payload.

Runs are processed asynchronously by the PDR worker system.

```

Client Application
│
▼
POST /v1/runs
│
▼
Run Created
│
▼
Worker
│
▼
Governed Execution
│
▼
Artifacts + Provenance

```

Every run produces artifacts that record execution evidence.

---

## Run Creation

Runs are created through the API.

```

POST /v1/runs

```

Example request:

```json
{
  "domain_id": "healthcare",
  "input_payload": {
    "hello": "world"
  }
}
```

During creation the system:

1. resolves the latest contract for the domain
2. stores the input payload
3. inserts a run record
4. sets the initial run status

Run status begins as:

```
queued
```

The worker system will later process the run.

---

## Run Lifecycle

Runs move through a defined lifecycle.

```
queued → running → succeeded
                   → failed
```

Lifecycle transitions are controlled by the worker engine.

| Status    | Meaning                            |
| --------- | ---------------------------------- |
| queued    | run created and waiting for worker |
| running   | worker has claimed the run         |
| succeeded | workflow completed successfully    |
| failed    | workflow terminated with error     |

---

## Worker Execution Loop

Workers continuously poll the database for queued runs.

Simplified worker loop:

```
while (true)
  claim queued run
  execute workflow
  update run status
  generate artifacts
```

The worker system ensures that each run is processed exactly once.

---

## Contract Resolution

Each run references a contract.

Contracts define the structure of expected inputs and outputs.

Contracts are versioned.

Example fields stored with a run:

```
domain_id
contract_version
schema_hash
```

The contract schema is snapshot as an artifact during execution.

Artifact type:

```
contract_snapshot
```

This ensures the run can always be reproduced later.

---

## Input Validation

Before execution begins the worker validates the input payload.

Validation is performed using the contract schema.

Possible outcomes:

```
valid
invalid
```

Validation results are recorded as an artifact.

Artifact type:

```
validation_report
```

Invalid runs may trigger repair attempts depending on workflow configuration.

---

## Execution Phase

Once inputs are validated the worker executes the workflow logic.

Execution may include:

* AI model invocation
* rule evaluation
* transformation steps
* artifact generation

Execution results may produce additional artifacts.

Example artifact types:

```
analysis_output
execution_steps
```

---

## Repair Loop

Some workflows allow repair attempts.

If validation fails or outputs do not meet contract expectations, the system may attempt corrections.

Example sequence:

```
validate → fail
repair attempt
validate → fail
repair attempt
validate → success
```

Repair attempts are recorded as artifacts.

Artifact type:

```
repair_attempt
```

Repair logic ensures workflows can attempt structured corrections before failing.

---

## Artifact Generation

Artifacts capture the evidence produced during execution.

Artifacts are stored with metadata including:

```
artifact_id
artifact_type
content_hash
size_bytes
created_at
```

Artifacts are associated with a run.

Example query:

```
SELECT * FROM artifacts WHERE run_id = ?
```

Artifacts allow developers to inspect exactly what occurred during execution.

---

## Provenance Recording

PerfectDocRoot records provenance for every run.

Provenance includes:

* contract snapshot
* validation reports
* execution steps
* artifact lineage
* repair attempts

Provenance ensures every run can be fully reconstructed.

---

## Run Completion

Once execution completes the worker updates the run status.

Possible outcomes:

```
succeeded
failed
```

Completion also records:

```
completed_at
```

This marks the end of the run lifecycle.

---

## Inspecting Runs

Runs can be inspected through the API.

```
GET /v1/runs/:id
```

The response includes:

* run metadata
* artifacts
* execution results

Runs can also be inspected through the admin console.

Example:

```
/admin/runs/<run_id>
```

From the console developers can inspect:

* input payload
* validation results
* execution steps
* artifacts
* provenance

---

## Why the Execution Model Matters

The PerfectDocRoot execution model ensures that AI workflows produce verifiable outputs.

Instead of opaque AI responses, developers receive:

* structured validation
* artifact evidence
* reproducible runs
* inspectable execution history

This makes AI workflows suitable for environments where reliability and traceability are required.

Examples include:

* healthcare documentation
* cybersecurity analysis
* compliance reporting
* safety audits
* financial analysis

```

---
