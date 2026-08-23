import joblib
import pandas as pd
from typing import Dict, Any

def predict_risk(features: Dict[str, float], model_type: str = "federated", model_path: str = None) -> Dict[str, Any]:
    """
    Predicts disease risk category and score for a given set of health features.
    
    Expected features:
    - age, glucose, blood_pressure, bmi, cholesterol, heart_rate
    """
    if model_path is None:
        if model_type == "federated":
            model_path = "models/federated_risk_model.joblib"
        else:
            model_path = "models/risk_model.joblib"
            
    try:
        model_artifact = joblib.load(model_path)
        pipeline = model_artifact['pipeline']
        version = model_artifact.get('model_version', model_artifact.get('version', 'unknown'))
        feature_names = model_artifact['features']
    except Exception as e:
        raise RuntimeError(f"Failed to load model {model_type} from {model_path}: {str(e)}")
        
    # Construct DataFrame to ensure correct column order for sklearn pipeline
    input_df = pd.DataFrame([features])
    
    # Ensure all required features are present
    for col in feature_names:
        if col not in input_df.columns:
            raise ValueError(f"Missing required feature: {col}")
            
    input_df = input_df[feature_names]
    
    # Predict probabilities (assuming class 1 is high risk)
    proba = pipeline.predict_proba(input_df)[0]
    risk_score = float(proba[1])
    
    # Threshold logic:
    # < 0.4: LOW
    # 0.4 to 0.7: MEDIUM
    # >= 0.7: HIGH
    if risk_score < 0.4:
        category = "LOW"
    elif risk_score < 0.7:
        category = "MEDIUM"
    else:
        category = "HIGH"
        
    return {
        "risk_score": risk_score,
        "risk_category": category,
        "model_version": version
    }

def detect_anomaly(features: Dict[str, float], model_path: str = "models/anomaly_model.joblib") -> Dict[str, Any]:
    """
    Detects if a set of health features is anomalous based on the trained IsolationForest.
    
    Expected features:
    - age, glucose, blood_pressure, bmi, cholesterol, heart_rate
    """
    try:
        model_artifact = joblib.load(model_path)
        pipeline = model_artifact['pipeline']
        version = model_artifact.get('model_version', model_artifact.get('version', 'unknown'))
        feature_names = model_artifact['features']
    except Exception as e:
        raise RuntimeError(f"Failed to load anomaly model from {model_path}: {str(e)}")
        
    input_df = pd.DataFrame([features])
    
    for col in feature_names:
        if col not in input_df.columns:
            raise ValueError(f"Missing required feature: {col}")
            
    input_df = input_df[feature_names]
    
    # IsolationForest predict returns 1 for inliers, -1 for outliers
    pred = pipeline.predict(input_df)[0]
    is_anomaly = bool(pred == -1)
    
    # decision_function returns an anomaly score. Lower = more abnormal.
    # We negate it so higher score = more anomalous.
    decision_score = pipeline.decision_function(input_df)[0]
    transformed_score = float(-decision_score)
    
    return {
        "is_anomaly": is_anomaly,
        "anomaly_score": transformed_score,
        "model_version": version
    }
