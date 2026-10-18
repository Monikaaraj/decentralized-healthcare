import pandas as pd
import numpy as np

def calculate_age(birthdate, reference_date=None):
    if reference_date is None:
        reference_date = pd.Timestamp.now()
    else:
        reference_date = pd.to_datetime(reference_date)
    birthdate = pd.to_datetime(birthdate, errors='coerce')
    age = (reference_date - birthdate).dt.days / 365.25
    return age.apply(np.floor)

def create_ml_dataset(patients: pd.DataFrame, observations: pd.DataFrame, conditions: pd.DataFrame) -> pd.DataFrame:
    """
    Creates a clean feature table from Synthea data.
    Aggregates observations by taking the most recent valid observation per patient.
    Leaves missing values as NaN to be handled by the ML pipeline's Imputer.
    Target: 1 if patient has a diabetes-related condition, else 0.
    """
    # 1. Age Feature
    patients = patients.copy()
    patients['age'] = calculate_age(patients['BIRTHDATE'])
    
    df_features = patients[['Id', 'age']].rename(columns={'Id': 'PATIENT'})
    
    # 2. Extract specific observations
    obs = observations.copy()
    obs['DATE'] = pd.to_datetime(obs['DATE'], errors='coerce')
    
    # Define mapping from Synthea Description to our feature names
    obs_map = {
        'Body mass index (BMI) [Ratio]': 'bmi',
        'Systolic Blood Pressure': 'blood_pressure',
        'Heart rate': 'heart_rate',
        'Glucose [Mass/volume] in Blood': 'glucose',
        'Glucose [Mass/volume] in Serum or Plasma': 'glucose',
        'Cholesterol [Mass/volume] in Serum or Plasma': 'cholesterol'
    }
    
    # Filter only relevant observations
    obs = obs[obs['DESCRIPTION'].isin(obs_map.keys())].copy()
    obs['feature_name'] = obs['DESCRIPTION'].map(obs_map)
    
    # Convert values to numeric, dropping invalid ones
    obs['VALUE'] = pd.to_numeric(obs['VALUE'], errors='coerce')
    obs = obs.dropna(subset=['VALUE'])
    
    # Sort by date so we can keep the latest observation per feature
    obs = obs.sort_values(by=['PATIENT', 'feature_name', 'DATE'])
    
    # Keep last (most recent) measurement per feature per patient
    latest_obs = obs.groupby(['PATIENT', 'feature_name']).last().reset_index()
    
    # Pivot to get features as columns
    pivot_obs = latest_obs.pivot(index='PATIENT', columns='feature_name', values='VALUE').reset_index()
    
    # Merge observations with patients
    df = pd.merge(df_features, pivot_obs, on='PATIENT', how='left')
    
    # Ensure all required features exist even if missing from Synthea data
    expected_features = ['age', 'glucose', 'blood_pressure', 'bmi', 'cholesterol', 'heart_rate']
    for feat in expected_features:
        if feat not in df.columns:
            df[feat] = np.nan
            
    # Keep columns in predictable order
    df = df[['PATIENT'] + expected_features]
    
    # 3. Target Definition
    # We define the target as 1 if the patient has any condition description containing "diabetes"
    conditions = conditions.copy()
    conditions['DESCRIPTION'] = conditions['DESCRIPTION'].fillna('')
    diabetes_conds = conditions[conditions['DESCRIPTION'].str.contains('diabetes', case=False)]
    diabetic_patients = set(diabetes_conds['PATIENT'].unique())
    
    df['target'] = df['PATIENT'].apply(lambda x: 1 if x in diabetic_patients else 0)
    
    return df
