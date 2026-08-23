import pytest
import pandas as pd
import numpy as np
import os
from src.ingestion import load_synthea_data
from src.feature_engineering import create_ml_dataset, calculate_age

def test_missing_files(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_synthea_data(str(tmp_path))

def test_feature_engineering_aggregation_and_target():
    patients = pd.DataFrame({
        'Id': ['p1', 'p2', 'p3'],
        'BIRTHDATE': ['1980-01-01', '1990-01-01', '2000-01-01']
    })
    
    observations = pd.DataFrame({
        'DATE': ['2020-01-01', '2020-01-02', '2020-01-01', '2021-01-01'],
        'PATIENT': ['p1', 'p1', 'p2', 'p3'],
        'DESCRIPTION': [
            'Systolic Blood Pressure', 
            'Systolic Blood Pressure', 
            'Body mass index (BMI) [Ratio]', 
            'Glucose [Mass/volume] in Blood'
        ],
        'VALUE': ['120', '130', '25.5', '100']
    })
    
    conditions = pd.DataFrame({
        'PATIENT': ['p1', 'p3'],
        'DESCRIPTION': ['Prediabetes (finding)', 'Some other disease']
    })
    
    df = create_ml_dataset(patients, observations, conditions)
    
    assert len(df) == 3
    assert list(df.columns) == ['PATIENT', 'age', 'glucose', 'blood_pressure', 'bmi', 'cholesterol', 'heart_rate', 'target']
    
    # p1 aggregation: should have blood_pressure 130 (most recent), target 1 (Prediabetes)
    p1_row = df[df['PATIENT'] == 'p1'].iloc[0]
    assert p1_row['blood_pressure'] == 130.0
    assert pd.isna(p1_row['bmi'])
    assert p1_row['target'] == 1
    
    # p2: should have bmi 25.5, target 0
    p2_row = df[df['PATIENT'] == 'p2'].iloc[0]
    assert p2_row['bmi'] == 25.5
    assert pd.isna(p2_row['blood_pressure'])
    assert p2_row['target'] == 0
    
    # p3: should have target 0 because condition does not contain diabetes
    p3_row = df[df['PATIENT'] == 'p3'].iloc[0]
    assert p3_row['target'] == 0
    assert p3_row['glucose'] == 100.0

def test_deterministic_preprocessing():
    # Ensuring repeated calls yield same output
    patients = pd.DataFrame({'Id': ['p1'], 'BIRTHDATE': ['1980-01-01']})
    obs = pd.DataFrame({'DATE': ['2020-01-01'], 'PATIENT': ['p1'], 'DESCRIPTION': ['Systolic Blood Pressure'], 'VALUE': ['120']})
    cond = pd.DataFrame({'PATIENT': ['p1'], 'DESCRIPTION': ['Prediabetes']})
    
    df1 = create_ml_dataset(patients, obs, cond)
    df2 = create_ml_dataset(patients, obs, cond)
    pd.testing.assert_frame_equal(df1, df2)
