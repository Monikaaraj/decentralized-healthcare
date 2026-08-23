# Federated Learning - Data Partitioning

## Purpose
This directory contains the data isolation logic and hospital abstractions required before initiating actual Federated Learning (FL). 
This milestone focuses purely on partitioning our synthetic ML dataset into isolated, completely separate hospital silos (`Hospital A`, `Hospital B`, `Hospital C`).

## What is a Hospital Silo?
A hospital silo represents an independent medical entity with its own localized dataset. The `HospitalDataset` abstraction wraps this local data. It strictly acts as a local data loader.

## Why Partition by Patient?
To simulate real-world multi-institutional privacy constraints, data is split deterministically at the patient level. 
A single patient's records never appear in more than one hospital. This ensures zero overlap and data leakage between entities.

## Raw Data Isolation Requirement
The raw data MUST remain local to the hospital abstraction.
The central federated code must NEVER load all hospital datasets into one central dataframe. 

### Future Architecture (Conceptual Flow)
```
Hospital A local data
        ↓
Local training (Flower Client A)
        ↓
Model update (weights/gradients)
        ↓
Federated aggregator (Flower Server)

Hospital B local data
        ↓
Local training (Flower Client B)
        ↓
Model update (weights/gradients)
        ↓
Federated aggregator (Flower Server)

Hospital C local data
        ↓
Local training (Flower Client C)
        ↓
Model update (weights/gradients)
        ↓
Federated aggregator (Flower Server)
```

The aggregator will ONLY receive model parameters/metrics, never the raw dataframes.

## Milestone 3B — Local Training

In this milestone, each hospital trains independently:
- **Hospital A** → local training → parameters
- **Hospital B** → local training → parameters
- **Hospital C** → local training → parameters

Raw data remains local. Only parameters (model weights/intercepts), sample counts, and metrics are extracted from the local model pipelines for future federation. 

Crucially, **each hospital maintains its own local preprocessing state** (e.g., standard scaler fitted on local data). We do not reuse one centrally fitted pipeline across hospitals, simulating a true decentralized setup. No network communication occurs yet.

## Milestone 3C — Federated Averaging (FedAvg) Simulation

We introduce the Flower (`flwr`) framework to simulate the Federated Learning aggregator.

**Execution:**
```bash
python -m src.run_federated
```

**Architecture:**
- **Flower Server**: Initializes global model parameters and orchestrates 3 communication rounds.
- **Hospital Clients**: 3 Simulated Flower clients (`hospital_a`, `hospital_b`, `hospital_c`). Each downloads the global parameters, updates its local `LogisticRegression` model, trains on its isolated data partition, and uploads only the new weights.
- **Aggregation**: The server uses **FedAvg** (weighted by local sample counts) to merge the weights.

**Privacy Enforcement**: 
This is a simulated Federated Learning environment. Hospital clients currently run on the same development machine, but the architecture enforces the logical boundary that raw hospital data is never sent to the aggregator. 
The aggregator **only** receives arrays of model coefficients and local metrics.

*Disclaimer: Model parameters can potentially leak information in sophisticated attacks; this demonstration does not claim formal differential privacy. Federated Learning keeps raw training data at the participating institutions and exchanges model updates with the aggregator.*
