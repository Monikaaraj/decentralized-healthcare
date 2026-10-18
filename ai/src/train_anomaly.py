import pandas as pd
import os
import joblib
from src.preprocessing import create_anomaly_pipeline

MODEL_VERSION = "1.0.0"

def train_and_save_anomaly_model(data_path: str, model_save_path: str, contamination: float = 0.05):
    """
    Trains the IsolationForest pipeline on the dataset and saves it.
    Unsupervised: Does NOT use target, PATIENT, or risk categories.
    """
    df = pd.read_csv(data_path)
    
    # 1. Select features
    # Exclude PATIENT, target (Data Leakage Prevention)
    drop_cols = []
    if 'PATIENT' in df.columns:
        drop_cols.append('PATIENT')
    if 'target' in df.columns:
        drop_cols.append('target')
        
    X = df.drop(columns=drop_cols)
    
    print(f"Training Anomaly Detector on {len(X)} samples.")
    print(f"Features used: {list(X.columns)}")
    print(f"Contamination (expected fraction of outliers): {contamination}")
    
    # 2. Get pipeline and train
    pipeline = create_anomaly_pipeline(contamination=contamination)
    pipeline.fit(X)
    
    # Evaluate internally for sanity
    preds = pipeline.predict(X)
    num_anomalies = (preds == -1).sum()
    print(f"Detected {num_anomalies} anomalies ({num_anomalies/len(X)*100:.2f}%) in training data.")
    
    # 3. Save model
    os.makedirs(os.path.dirname(model_save_path), exist_ok=True)
    
    model_artifact = {
        'pipeline': pipeline,
        'version': MODEL_VERSION,
        'features': list(X.columns)
    }
    joblib.dump(model_artifact, model_save_path)
    print(f"Anomaly model saved to {model_save_path} (Version {MODEL_VERSION})")

if __name__ == "__main__":
    train_and_save_anomaly_model(
        data_path="data/processed/synthea_ml_dataset.csv",
        model_save_path="models/anomaly_model.joblib"
    )
