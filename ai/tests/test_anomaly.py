import os
import pytest
import joblib
import pandas as pd
from src.train_anomaly import train_and_save_anomaly_model
from src.predict import detect_anomaly

TEST_DATA_PATH = "tests/test_data_anomaly.csv"
TEST_MODEL_PATH = "tests/test_anomaly_model.joblib"

@pytest.fixture(scope="session", autouse=True)
def setup_teardown_anomaly():
    # Setup: generate synthetic ml dataset
    os.makedirs("tests", exist_ok=True)
    
    # Create dummy processed dataset
    df = pd.DataFrame({
        'PATIENT': [f'p{i}' for i in range(100)],
        'age': [40 + (i%20) for i in range(100)],
        'glucose': [100 + (i%10) for i in range(100)],
        'blood_pressure': [120 + (i%10) for i in range(100)],
        'bmi': [25 + (i%5) for i in range(100)],
        'cholesterol': [190 + (i%20) for i in range(100)],
        'heart_rate': [70 + (i%10) for i in range(100)],
        'target': [i % 2 for i in range(100)] # Target included in dataset to ensure it's dropped during training
    })
    
    # Inject a couple of extreme values
    df.loc[98, 'glucose'] = 400
    df.loc[99, 'blood_pressure'] = 200
    
    df.to_csv(TEST_DATA_PATH, index=False)
    
    # Train anomaly model
    train_and_save_anomaly_model(data_path=TEST_DATA_PATH, model_save_path=TEST_MODEL_PATH, contamination=0.05)
    
    yield
    
    # Teardown
    if os.path.exists(TEST_DATA_PATH):
        os.remove(TEST_DATA_PATH)
    if os.path.exists(TEST_MODEL_PATH):
        os.remove(TEST_MODEL_PATH)

def test_anomaly_model_artifact_created():
    assert os.path.exists(TEST_MODEL_PATH)
    model_artifact = joblib.load(TEST_MODEL_PATH)
    assert 'pipeline' in model_artifact
    assert 'version' in model_artifact
    assert 'features' in model_artifact
    
    # Data leakage check: Verify target and PATIENT were dropped
    features = model_artifact['features']
    assert 'target' not in features
    assert 'PATIENT' not in features
    assert 'age' in features

def test_anomaly_prediction_format():
    sample = {
        'age': 45, 'glucose': 105, 'blood_pressure': 120,
        'bmi': 25.0, 'cholesterol': 190, 'heart_rate': 72
    }
    result = detect_anomaly(sample, model_path=TEST_MODEL_PATH)
    
    assert "is_anomaly" in result
    assert isinstance(result["is_anomaly"], bool)
    assert "anomaly_score" in result
    assert isinstance(result["anomaly_score"], (int, float))
    assert result["model_version"] == "1.0.0"

def test_anomaly_normal_observation():
    sample = {
        'age': 45, 'glucose': 105, 'blood_pressure': 120,
        'bmi': 25.0, 'cholesterol': 190, 'heart_rate': 72
    }
    result = detect_anomaly(sample, model_path=TEST_MODEL_PATH)
    assert result['is_anomaly'] is False

def test_anomaly_extreme_observation():
    extreme_sample = {
        'age': 45, 'glucose': 500, 'blood_pressure': 220,
        'bmi': 50.0, 'cholesterol': 400, 'heart_rate': 150
    }
    result = detect_anomaly(extreme_sample, model_path=TEST_MODEL_PATH)
    assert result['is_anomaly'] is True

def test_anomaly_deterministic_prediction():
    sample = {
        'age': 45, 'glucose': 105, 'blood_pressure': 120,
        'bmi': 25.0, 'cholesterol': 190, 'heart_rate': 72
    }
    res1 = detect_anomaly(sample, model_path=TEST_MODEL_PATH)
    res2 = detect_anomaly(sample, model_path=TEST_MODEL_PATH)
    assert res1['anomaly_score'] == res2['anomaly_score']
