# PerfectDocRoot — Contract Governance Triangle

## Core Model

```
                ┌─────────────────────┐
                │    Contract Schema   │
                │   (JSON Schema)      │
                │                      │
                │ Defines:             │
                │ required fields      │
                │ allowed structure    │
                │ validation rules     │
                └──────────┬───────────┘
                           │
                           │ governs
                           │
                           ▼
                ┌─────────────────────┐
                │     Payload Shape    │
                │                      │
                │ Actual run input     │
                │ sent to API          │
                │                      │
                │ Example:             │
                │ { "hello":"world" }  │
                └──────────┬───────────┘
                           │
                           │ executed by
                           │
                           ▼
                ┌─────────────────────┐
                │  Execution Lifecycle │
                │                      │
                │ draft                │
                │ validate             │
                │ repair (optional)    │
                │ finalize             │
                └─────────────────────┘
```

---

# How the Triangle Works

Each side of the triangle constrains the others.

```
Contract Schema
        ▲
        │
        │ defines
        │
Payload Shape ───────► Execution Lifecycle
        ▲                     │
        │ validated by        │ produces
        │                     │
        └──────────────◄──────┘
```

Meaning:

### Contract → Payload

The contract determines what inputs are allowed.

Example:

```json
{
  "required": ["hello"],
  "additionalProperties": false
}
```

Valid payload:

```json
{
  "hello": "world"
}
```

Invalid payload:

```json
{
  "stress_test": true
}
```

---

### Payload → Execution

The payload becomes the **candidate input** for the run.

```
input_payload
```

This is:

```
hashed
validated
recorded
executed
```

in the lifecycle.

---

### Execution → Governance

The lifecycle enforces governance.

Steps:

```
draft
validate
repair
finalize
```

Validation produces:

```
validation_report
```

Final state:

```
succeeded
failed
```

---

# Example From MS15B

## Contract

```
domain_id = healthcare
contract_version = 0.1
```

Schema:

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

## Payload

### Valid

```
{ "hello": "world" }
```

Result:

```
succeeded
```

---

### Invalid

```
{ "stress_test": true }
```

Result:

```
failed
```

Validation report:

```
missing required property: hello
additionalProperties not allowed
```

---

# Why This Triangle Matters

This model prevents **AI workflow chaos**.

Instead of:

```
prompt → output
```

PerfectDocRoot enforces:

```
contract → governed payload → validated execution
```

This gives the system:

```
deterministic behavior
auditability
schema governance
reproducibility
```

---

# How This Guides MS16

MS16 focuses on **stabilizing the triangle**.

Specifically:

### Contract Side

Ensure contracts are:

```
clear
versioned
seeded locally
inspectable
```

---

### Payload Side

Ensure developers know:

```
valid input shapes
example payloads
validation expectations
```

---

### Execution Side

Ensure the lifecycle:

```
records steps
produces clear validation reports
is easy to debug
```

---

# Mental Shortcut for Developers

When a run fails, ask:

```
Which side of the triangle broke?
```

Possible answers:

```
Contract issue
Payload shape issue
Execution logic issue
```

This dramatically simplifies debugging.

---

# Future Expansion

As PDR domains expand, each domain pack becomes:

```
Domain Pack
   │
   ├── contract schema
   ├── example payloads
   └── execution rules
```

Each pack lives inside the same **Contract Governance Triangle**.

---

# One Sentence Definition

PerfectDocRoot executes AI workflows through a **governed triangle of contract schema, payload shape, and execution lifecycle.**
