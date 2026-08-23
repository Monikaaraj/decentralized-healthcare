from fastapi.testclient import TestClient
import pytest
from unittest.mock import patch
from api.main import app

client = TestClient(app)

valid_features = {
    "age": 65,
    "glucose": 150,
    "blood_pressure": 140,
    "bmi": 30.0,
    "cholesterol": 220,
    "heart_rate": 85
}

def test_health_check():
    response = client.get("/ai/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "ai"
    assert "risk_model" in data
    assert "anomaly_model" in data
    assert "federated_model" in data

@patch('os.path.exists')
@patch('api.main.predict_risk')
def test_predict_risk_valid(mock_predict, mock_exists):
    mock_exists.return_value = True
    mock_predict.return_value = {
        "risk_score": 0.98,
        "risk_category": "HIGH",
        "model_version": "1.2.0-federated"
    }
    
    response = client.post("/ai/predict/risk", json=valid_features)
    assert response.status_code == 200
    data = response.json()
    assert data["risk_score"] == 0.98
    assert data["risk_category"] == "HIGH"
    assert data["model_version"] == "1.2.0-federated"

def test_predict_risk_invalid_input():
    # Test Pydantic validation (age missing)
    invalid_features = valid_features.copy()
    del invalid_features["age"]
    
    response = client.post("/ai/predict/risk", json=invalid_features)
    assert response.status_code == 422 # Unprocessable Entity
    
    # Test range validation (age negative)
    invalid_features2 = valid_features.copy()
    invalid_features2["age"] = -10
    response2 = client.post("/ai/predict/risk", json=invalid_features2)
    assert response2.status_code == 422

@patch('os.path.exists')
def test_predict_risk_model_missing(mock_exists):
    mock_exists.return_value = False
    
    response = client.post("/ai/predict/risk", json=valid_features)
    assert response.status_code == 503
    assert "unavailable" in response.json()["detail"]

@patch('os.path.exists')
@patch('api.main.predict_risk')
def test_predict_risk_internal_error(mock_predict, mock_exists):
    mock_exists.return_value = True
    mock_predict.side_effect = Exception("Super secret internal file path error")
    
    response = client.post("/ai/predict/risk", json=valid_features)
    assert response.status_code == 500
    # Ensure stack trace is not exposed
    assert "Super secret" not in response.json()["detail"]
    assert response.json()["detail"] == "Internal model prediction error"

@patch('os.path.exists')
@patch('api.main.detect_anomaly')
def test_detect_anomaly_valid(mock_detect, mock_exists):
    mock_exists.return_value = True
    mock_detect.return_value = {
        "is_anomaly": True,
        "anomaly_score": 0.19,
        "model_version": "1.0.0"
    }
    
    response = client.post("/ai/detect/anomaly", json=valid_features)
    assert response.status_code == 200
    data = response.json()
    assert data["is_anomaly"] is True
    assert data["anomaly_score"] == 0.19

@patch('os.path.exists')
def test_fl_status_missing(mock_exists):
    mock_exists.return_value = False
    
    response = client.get("/ai/fl/status")
    assert response.status_code == 200
    assert response.json()["status"] == "not_run"

@patch('os.path.exists')
@patch('joblib.load')
def test_fl_status_completed(mock_load, mock_exists):
    mock_exists.return_value = True
    mock_load.return_value = {
        'number_of_rounds': 3,
        'participating_hospitals': 3,
        'model_version': '1.2.0-federated'
    }
    
    response = client.get("/ai/fl/status")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    assert data["round"] == 3
    assert data["hospitals"] == 3
    assert data["model_version"] == "1.2.0-federated"

# Privacy test: prove nothing is written to disk by the API endpoints
@patch('builtins.open')
def test_no_raw_persistence(mock_open):
    # If the app attempted to open/write files outside of joblib.load, we want to catch it.
    
    # We test the endpoint with mocked model loading so it doesn't try to read real files.
    with patch('os.path.exists', return_value=True):
        with patch('api.main.predict_risk', return_value={"risk_score": 0.1, "risk_category": "LOW", "model_version": "1.0"}):
            client.post("/ai/predict/risk", json=valid_features)
            
    # Open should not have been called to write any data
    for call in mock_open.mock_calls:
        # Check that no call to open() had 'w', 'a', or 'wb' modes
        args = call.args
        if len(args) > 1:
            mode = args[1]
            assert 'w' not in mode and 'a' not in mode, f"Privacy violation: API attempted to write file: {call}"
