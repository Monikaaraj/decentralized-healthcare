# AI Service - Decentralized Healthcare

## Purpose
This directory contains the AI capabilities for the Decentralized Healthcare project. We use MITRE Synthea generated synthetic healthcare records as our primary data source.

**IMPORTANT: Synthea provides synthetic healthcare records. These records are used solely for research and demonstration.**
**The resulting ML models are not clinically validated and must not be used for medical diagnosis.**

## Federated Learning (FL)
We implement Federated Learning to keep raw hospital data strictly local. 
- **What is Federated Learning?** A decentralized machine learning approach where multiple entities collaboratively train a model without sharing their raw data.
- **What is FedAvg?** Federated Averaging. The central server aggregates local model updates (e.g. model weights) from clients by taking a weighted average based on sample counts.
- **Privacy Boundary:** Raw patient records **never** leave the hospital. The central aggregator only receives model parameters (weights, intercepts) and training metrics.
- **Simulation:** This is a simulated FL environment. Hospital clients currently run on the same development machine, but the architecture enforces the logical boundary that raw hospital data is never sent to the aggregator.
- **Privacy Disclaimer:** Model parameters can potentially leak information in sophisticated attacks; this demonstration does not claim formal differential privacy. FL keeps raw training data at the participating institutions and exchanges model updates with the aggregator.

## Setup & Data Placement
Place the generated CSV files (`patients.csv`, `observations.csv`, `conditions.csv`) into:
`ai/data/synthea/`

## Data Pipeline
Run the ingestion pipeline to process Synthea CSVs into a unified ML dataset:
```bash
python -m src.process_synthea
```
Run the partitioning script to distribute patients safely to isolated hospitals:
```bash
python -m src.run_partition
```

## Running the Federated Experiment
To train the global risk model via FedAvg across 3 isolated hospitals for 3 rounds:
```bash
python -m src.run_federated
```
This saves the federated global model to `models/federated_risk_model.joblib`.

## Anomaly Detection
Unsupervised `IsolationForest` model to identify unusual physiological patterns.
```bash
python -m src.train_anomaly
```
Saves to `models/anomaly_model.joblib`.

## FastAPI Inference Service (Milestone 4)

**The FastAPI service is an inference interface. It does not perform federated training and does not receive hospital training datasets.**

The AI models are research/demo models trained on synthetic Synthea data and are not clinically validated.

### Architecture
The API loads the finalized model artifacts (`federated_risk_model.joblib`, `anomaly_model.joblib`) strictly for in-memory prediction. Incoming inference requests are validated via Pydantic and never persisted to disk.

### Running the Server
```bash
uvicorn api.main:app --reload
```
Once started, you can access the interactive Swagger OpenAPI documentation at:
http://127.0.0.1:8000/docs

### Endpoints
- `GET /ai/health`: Returns API and model availability.
- `GET /ai/fl/status`: Returns metadata about the last known Federated Learning training run (does not trigger training).
- `POST /ai/predict/risk`: Predicts disease risk score and category (uses the Federated Model by default).
- `POST /ai/detect/anomaly`: Detects severe abnormal data boundaries.

### Privacy Behavior
Inference requests are stateless. No `csv` or `json` data is saved locally. We do not store patient IDs. Stack traces and raw internal paths are scrubbed from 500 errors to prevent infrastructure exposure.

## Testing
Run unit and API tests:
```bash
pytest tests/
```
