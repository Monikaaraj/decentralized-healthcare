import os
import pytest
import pandas as pd
from federated.partition import partition_dataset
from federated.hospital import HospitalDataset

TEST_INPUT_PATH = "tests/test_synthea_ml_dataset.csv"
TEST_OUTPUT_DIR = "tests/test_hospitals"

@pytest.fixture(scope="session", autouse=True)
def setup_teardown_federated():
    os.makedirs("tests", exist_ok=True)
    df = pd.DataFrame({
        'PATIENT': [f'p{i}' for i in range(100)],
        'age': [40 + (i%20) for i in range(100)],
        'glucose': [100 + (i%10) for i in range(100)],
        'blood_pressure': [120 + (i%10) for i in range(100)],
        'bmi': [25 + (i%5) for i in range(100)],
        'cholesterol': [190 + (i%20) for i in range(100)],
        'heart_rate': [70 + (i%10) for i in range(100)],
        'target': [i % 2 for i in range(100)]
    })
    df.to_csv(TEST_INPUT_PATH, index=False)
    
    yield
    
    if os.path.exists(TEST_INPUT_PATH):
        os.remove(TEST_INPUT_PATH)
    import shutil
    if os.path.exists(TEST_OUTPUT_DIR):
        shutil.rmtree(TEST_OUTPUT_DIR)


def test_partition_privacy_and_completeness():
    metadata = partition_dataset(TEST_INPUT_PATH, TEST_OUTPUT_DIR, num_hospitals=3, random_state=42)
    
    # Load the partitioned datasets
    df_a = pd.read_csv(os.path.join(TEST_OUTPUT_DIR, "hospital_a", "data.csv"))
    df_b = pd.read_csv(os.path.join(TEST_OUTPUT_DIR, "hospital_b", "data.csv"))
    df_c = pd.read_csv(os.path.join(TEST_OUTPUT_DIR, "hospital_c", "data.csv"))
    
    patients_a = set(df_a['PATIENT'])
    patients_b = set(df_b['PATIENT'])
    patients_c = set(df_c['PATIENT'])
    
    # 1. No patient ID occurs in multiple hospitals
    assert patients_a.isdisjoint(patients_b)
    assert patients_a.isdisjoint(patients_c)
    assert patients_b.isdisjoint(patients_c)
    
    # 2. Total hospital patient count equals source patient count
    assert len(patients_a) + len(patients_b) + len(patients_c) == 100
    
    # 3. All hospitals have same feature schema
    assert list(df_a.columns) == list(df_b.columns) == list(df_c.columns)
    
    # 4. Target column remains local to each hospital
    assert 'target' in df_a.columns

def test_partition_determinism():
    partition_dataset(TEST_INPUT_PATH, TEST_OUTPUT_DIR, num_hospitals=3, random_state=42)
    df_a_1 = pd.read_csv(os.path.join(TEST_OUTPUT_DIR, "hospital_a", "data.csv"))
    
    partition_dataset(TEST_INPUT_PATH, TEST_OUTPUT_DIR, num_hospitals=3, random_state=42)
    df_a_2 = pd.read_csv(os.path.join(TEST_OUTPUT_DIR, "hospital_a", "data.csv"))
    
    pd.testing.assert_frame_equal(df_a_1, df_a_2)
    
    # Different seed yields different partition
    partition_dataset(TEST_INPUT_PATH, TEST_OUTPUT_DIR, num_hospitals=3, random_state=99)
    df_a_3 = pd.read_csv(os.path.join(TEST_OUTPUT_DIR, "hospital_a", "data.csv"))
    
    with pytest.raises(AssertionError):
        pd.testing.assert_frame_equal(df_a_1, df_a_3)

def test_hospital_abstraction():
    partition_dataset(TEST_INPUT_PATH, TEST_OUTPUT_DIR, num_hospitals=3, random_state=42)
    
    h_a = HospitalDataset("hospital_a", base_dir=TEST_OUTPUT_DIR)
    
    # get_training_data
    df = h_a.get_training_data()
    assert not df.empty
    
    # get_sample_count
    assert h_a.get_sample_count() == len(df)
    
    # get_feature_columns
    features = h_a.get_feature_columns()
    assert 'PATIENT' not in features
    assert 'target' not in features
    assert 'age' in features
    
    # get_target_distribution
    dist = h_a.get_target_distribution()
    assert 0 in dist
    assert 1 in dist
