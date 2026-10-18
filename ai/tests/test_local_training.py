import os
import pytest
import pandas as pd
import numpy as np
from federated.hospital import HospitalDataset
from federated.local_training import train_local_model, get_model_parameters, set_model_parameters

TEST_INPUT_PATH = "tests/test_hospitals_local"

@pytest.fixture(scope="session", autouse=True)
def setup_local_training():
    os.makedirs(os.path.join(TEST_INPUT_PATH, "hospital_a"), exist_ok=True)
    df = pd.DataFrame({
        'PATIENT': [f'p{i}' for i in range(40)],
        'age': [40 + (i%20) for i in range(40)],
        'glucose': [100 + (i%10) for i in range(40)],
        'blood_pressure': [120 + (i%10) for i in range(40)],
        'bmi': [25 + (i%5) for i in range(40)],
        'cholesterol': [190 + (i%20) for i in range(40)],
        'heart_rate': [70 + (i%10) for i in range(40)],
        'target': [i % 2 for i in range(40)]
    })
    df.to_csv(os.path.join(TEST_INPUT_PATH, "hospital_a", "data.csv"), index=False)
    
    yield
    
    import shutil
    if os.path.exists(TEST_INPUT_PATH):
        shutil.rmtree(TEST_INPUT_PATH)
    if os.path.exists("models/local"):
        shutil.rmtree("models/local")

def test_hospital_local_training():
    h_a = HospitalDataset("hospital_a", base_dir=TEST_INPUT_PATH)
    pipeline, metadata = train_local_model(h_a, save_dir="models/local")
    
    # Ensure metadata does not contain raw data
    assert 'PATIENT' not in metadata
    assert metadata['hospital_id'] == "hospital_a"
    assert metadata['num_samples'] == 40
    assert metadata['num_positive'] == 20
    assert metadata['num_negative'] == 20
    
    # Ensure metrics are calculated
    assert 'accuracy' in metadata['metrics']
    assert metadata['metrics']['accuracy'] is not None

def test_model_parameter_roundtrip():
    h_a = HospitalDataset("hospital_a", base_dir=TEST_INPUT_PATH)
    pipeline1, metadata = train_local_model(h_a, save_dir="models/local")
    
    df = h_a.get_training_data()
    X = df.drop(columns=['PATIENT', 'target'])
    
    preds1 = pipeline1.predict(X)
    
    # Extract params
    params = get_model_parameters(pipeline1)
    assert 'coef' in params
    assert 'intercept' in params
    
    # Train a new one to get a fitted pipeline structure
    pipeline2, _ = train_local_model(h_a, save_dir="models/local")
    
    # Change weights drastically to ensure setting works
    classifier = pipeline2.named_steps['classifier']
    classifier.coef_ = np.zeros_like(classifier.coef_)
    
    # Restore original params
    set_model_parameters(pipeline2, params)
    preds3 = pipeline2.predict(X)
    
    # Original pipeline and restored pipeline should produce same predictions
    np.testing.assert_array_equal(preds1, preds3)

def test_small_dataset_handling():
    # Create extremely small dataset to ensure we handle it gracefully
    h_small_dir = os.path.join(TEST_INPUT_PATH, "hospital_small")
    os.makedirs(h_small_dir, exist_ok=True)
    df_small = pd.DataFrame({
        'PATIENT': ['p1', 'p2', 'p3'],
        'age': [40, 41, 42],
        'glucose': [100, 101, 102],
        'blood_pressure': [120, 121, 122],
        'bmi': [25, 26, 27],
        'cholesterol': [190, 191, 192],
        'heart_rate': [70, 71, 72],
        'target': [0, 1, 0] # Both classes present
    })
    df_small.to_csv(os.path.join(h_small_dir, "data.csv"), index=False)
    
    h_small = HospitalDataset("hospital_small", base_dir=TEST_INPUT_PATH)
    pipeline, metadata = train_local_model(h_small, save_dir="models/local")
    
    assert metadata['num_samples'] == 3
    assert metadata['metrics']['accuracy'] is not None

def test_missing_class_handling():
    # Create dataset with only 1 class
    h_bad_dir = os.path.join(TEST_INPUT_PATH, "hospital_bad")
    os.makedirs(h_bad_dir, exist_ok=True)
    df_bad = pd.DataFrame({
        'PATIENT': ['p1', 'p2', 'p3'],
        'age': [40, 41, 42],
        'glucose': [100, 101, 102],
        'blood_pressure': [120, 121, 122],
        'bmi': [25, 26, 27],
        'cholesterol': [190, 191, 192],
        'heart_rate': [70, 71, 72],
        'target': [1, 1, 1] # Only 1 class
    })
    df_bad.to_csv(os.path.join(h_bad_dir, "data.csv"), index=False)
    
    h_bad = HospitalDataset("hospital_bad", base_dir=TEST_INPUT_PATH)
    with pytest.raises(ValueError, match="only contains 1 target class"):
        train_local_model(h_bad, save_dir="models/local")
