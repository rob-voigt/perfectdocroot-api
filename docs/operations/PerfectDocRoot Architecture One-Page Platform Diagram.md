# PerfectDocRoot Architecture (One-Page Platform Diagram)

```
                         Applications / Developers
                                   |
                                   |
                             API Requests
                                   |
                                   v
                         +--------------------+
                         |    API Service     |
                         |--------------------|
                         | Run Creation       |
                         | Input Validation   |
                         | Artifact Upload    |
                         +--------------------+
                                   |
                                   v
                         +--------------------+
                         | Governance Layer   |
                         |--------------------|
                         | Domain Rules       |
                         | Contract Validation|
                         | Execution Policies |
                         +--------------------+
                                   |
                                   v
                              Run Queue
                                   |
                                   v
                         +--------------------+
                         |   Worker Service   |
                         |--------------------|
                         | Claim Run          |
                         | Resolve Artifacts  |
                         | Execute Pipeline   |
                         +--------------------+
                                   |
                                   v
                         +--------------------+
                         | Deterministic Core |
                         |--------------------|
                         | Seed Hash          |
                         | Evidence Hash      |
                         | Execution Engine   |
                         +--------------------+
                                   |
                                   v
                         +--------------------+
                         | Provenance System  |
                         |--------------------|
                         | Run Metadata       |
                         | Artifact Hashes    |
                         | Execution Results  |
                         +--------------------+
                                   |
                                   v
                         +--------------------+
                         |   Data Storage     |
                         |--------------------|
                         | Runs Database      |
                         | Artifact Store     |
                         | Provenance Logs    |
                         +--------------------+


              ---------------------------------------------
                    Platform Layer (Developer Tools)
              ---------------------------------------------

                         Contract Registry
                         Domain Registry
                         Workflow Orchestration
                         CLI / SDK
                         Admin Console
```

---

## The 10-Second Explanation

This diagram lets you say:

> PerfectDocRoot converts AI prompts into **governed execution runs with deterministic provenance.**

And visually it shows:

```
Apps
  ↓
API
  ↓
Governance
  ↓
Execution
  ↓
Provenance
```

That’s the entire platform.

---

## Why This Diagram Is Powerful

It communicates **four key ideas instantly**.

### 1️⃣ Separation of concerns

```
API handles requests
Workers handle execution
```

This is modern distributed architecture.

---

### 2️⃣ Governance before execution

The **Governance Layer** sits between the API and worker.

This means:

```
no run executes without contract validation
```

That’s the core PDR idea.

---

### 3️⃣ Deterministic execution

The **Deterministic Core** explains:

```
seed hash
evidence hash
artifact resolution
```

This guarantees reproducibility.

---

### 4️⃣ Provenance by design

The **Provenance System** ensures:

```
traceable inputs
verifiable artifacts
reproducible outputs
```

This is what makes PDR suitable for:

* compliance
* engineering
* regulated environments

---

## How This Evolves Over Time

Right now your architecture is:

```
1 API
1 Worker
1 Database
```

Future diagram versions may show:

```
API Cluster
Queue System
Worker Pool
Artifact Storage
Monitoring
```

But the **conceptual flow remains identical**.

---

## Where This Diagram Will Appear

You will likely use this diagram in **four places**.

### 1️⃣ Platform Specification

```
Section 1 – Architecture Overview
```

---

### 2️⃣ Operations Manual

Probably inside **Section 13 System Architecture**.

---

### 3️⃣ PerfectDocRoot Website

It becomes the **technical overview diagram**.

---

### 4️⃣ Future Developer Docs

It becomes the **reference architecture**.
