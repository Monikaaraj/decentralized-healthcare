import os
import pytest
import pandas as pd
import numpy as np
import joblib
from data.generate_dataset import generate_synthetic_data
from src.train import train_and_evaluate
from src.predict import predict_risk

TEST_DATA_PATH = "tests/test_data.csv"
TEST_MODEL_PATH = "tests/test_model.joblib"

@pytest.fixture(scope="session", autouse=True)
def setup_teardown():
    # Setup: generate dataset and train model before tests run
    os.makedirs("tests", exist_ok=True)
    generate_synthetic_data(num_samples=100, seed=42, output_path=TEST_DATA_PATH)
    train_and_evaluate(data_path=TEST_DATA_PATH, model_save_path=TEST_MODEL_PATH)
    
    yield
    
    # Teardown: clean up files
    if os.path.exists(TEST_DATA_PATH):
        os.remove(TEST_DATA_PATH)
    if os.path.exists(TEST_MODEL_PATH):
        os.remove(TEST_MODEL_PATH)

def test_dataset_generation():
    df = pd.read_csv(TEST_DATA_PATH)
    assert not df.empty, "Dataset should not be empty"

def test_dataset_shape():
    df = pd.read_csv(TEST_DATA_PATH)
    assert df.shape == (100, 7), f"Expected shape (100, 7), got {df.shape}"

def test_required_columns():
    df = pd.read_csv(TEST_DATA_PATH)
    expected_columns = ['age', 'glucose', 'blood_pressure', 'bmi', 'cholesterol', 'heart_rate', 'target']
    for col in expected_columns:
        assert col in df.columns, f"Missing column {col}"

def test_target_values():
    df = pd.read_csv(TEST_DATA_PATH)
    targets = df['target'].unique()
    assert set(targets).issubset({0, 1}), "Target must be binary (0 or 1)"

def test_saved_model_loading():
    assert os.path.exists(TEST_MODEL_PATH), "Model file should exist"
    model_artifact = joblib.load(TEST_MODEL_PATH)
    assert 'pipeline' in model_artifact
    assert 'version' in model_artifact

def test_prediction_output_and_range():
    sample_features = {
        'age': 45,
        'glucose': 105,
        'blood_pressure': 120,
        'bmi': 25.0,
        'cholesterol': 190,
        'heart_rate': 72
    }
    result = predict_risk(sample_features, model_path=TEST_MODEL_PATH)
    
    assert 'risk_score' in result
    assert 'risk_category' in result
    assert 'model_version' in result
    
    score = result['risk_score']
    assert 0.0 <= score <= 1.0, "Risk score must be between 0 and 1"

def test_risk_category():
    # High risk inputs
    high_risk = {
        'age': 80,
        'glucose': 180,
        'blood_pressure': 160,
        'bmi': 35,
        'cholesterol': 260,
        'heart_rate': 90
    }
    res_high = predict_risk(high_risk, model_path=TEST_MODEL_PATH)
    assert res_high['risk_category'] in ["HIGH", "MEDIUM"], "Expected HIGH or MEDIUM risk category for extreme inputs"
    
    # Low risk inputs
    low_risk = {
        'age': 20,
        'glucose': 80,
        'blood_pressure': 110,
        'bmi': 20,
        'cholesterol': 150,
        'heart_rate': 60
    }
    res_low = predict_risk(low_risk, model_path=TEST_MODEL_PATH)
    assert res_low['risk_category'] in ["LOW", "MEDIUM"], "Expected LOW or MEDIUM risk category for optimal inputs"
