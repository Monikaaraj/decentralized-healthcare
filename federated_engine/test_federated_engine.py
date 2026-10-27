"""
AEGIS-AI Automated Integration & Unit Tests (test_federated_engine.py)
Validates the Node Communication API and PPML components.
"""

import pytest
from fastapi.testclient import TestClient
import numpy as np
import torch

from node_api import app, serialize_weights_to_b64, deserialize_b64_to_weights
from local_trainer import AegisDiagnosticsNet, LocalTrainer
from fl_server import FederatedServer

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "active"
    assert "active_round" in data
    assert "quorum_required" in data


def test_get_global_weights_endpoint():
    response = client.get("/get_global_weights")
    assert response.status_code == 200
    payload = response.json()
    assert "weights" in payload
    assert "current_round" in payload
    assert len(payload["weights"]) > 0

    # Test deserialization
    decoded = deserialize_b64_to_weights(payload["weights"])
    assert isinstance(decoded, dict)
    assert any("classifier" in k for k in decoded.keys())


def test_submit_local_update_and_aggregation():
    # 1. Fetch initial round weights
    resp = client.get("/get_global_weights")
    initial_weights = deserialize_b64_to_weights(resp.json()["weights"])
    
    # 2. Simulate 3 hospital node submissions
    nodes = ["Node_A", "Node_B", "Node_C"]
    sample_sizes = [400, 350, 250]

    for node_id, n_k in zip(nodes, sample_sizes):
        # Slightly perturbed weights to simulate local SGD updates
        perturbed_weights = {k: v + np.random.normal(0, 1e-4, v.shape).astype(v.dtype) for k, v in initial_weights.items()}
        encoded = serialize_weights_to_b64(perturbed_weights)
        
        payload = {
            "node_id": node_id,
            "num_samples": n_k,
            "local_loss": 0.045,
            "weights": encoded
        }
        sub_resp = client.post("/submit_local_update", json=payload)
        assert sub_resp.status_code == 202

    # 3. Check health shows all 3 pending
    health_resp = client.get("/health")
    assert health_resp.json()["pending_nodes_count"] == 3

    # 4. Trigger aggregation
    agg_resp = client.post("/trigger_aggregation")
    assert agg_resp.status_code == 200
    agg_data = agg_resp.json()
    assert agg_data["status"] == "success"
    assert len(agg_data["participating_nodes"]) == 3

    # 5. Check metrics endpoint
    metrics_resp = client.get("/metrics")
    assert metrics_resp.status_code == 200


def test_document_ocr_and_scanning():
    report_text = """
    ST. JUDE MEDICAL CENTER
    Patient Name: Alice Smith
    Age: 19
    Gender: Female
    Phone: +91 9988776655
    Blood Pressure: 118/76 mmHg
    Fasting Blood Sugar: 92 mg/dL
    Hemoglobin: 13.8 g/dL
    Total Cholesterol: 175 mg/dL
    Impression: Clear lung fields, normal sinus rhythm.
    """
    resp = client.post("/api/scan_document", json={
        "text": report_text,
        "filename": "alice_lab_report.pdf"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    extracted = data["extracted_data"]

    # 1. PII Masking & Age Interval
    demographics = extracted["masked_demographics"]
    assert demographics["patient_name"] == "Patient [REDACTED]"
    assert demographics["phone_number"] == "[REDACTED]"
    assert demographics["age_interval"] == "18-22"  # 19 classified into 18-22

    # 2. Exact Readings (No intervals for readings)
    readings = extracted["exact_readings"]
    assert readings["blood_pressure"] == "118/76 mmHg"
    assert readings["glucose"] == "92 mg/dL"
    assert readings["hemoglobin"] == "13.8 g/dL"
    assert readings["total_cholesterol"] == "175 mg/dL"

    # 3. Only details present in the document
    assert "white_blood_cells" not in readings
    assert "serum_creatinine" not in readings


if __name__ == "__main__":
    pytest.main(["-v", __file__])
