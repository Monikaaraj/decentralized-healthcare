import pandas as pd
import os
import joblib
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score
from src.preprocessing import create_pipeline

MODEL_VERSION = "1.1.0"

def train_and_evaluate(data_path: str, model_save_path: str):
    """
    Trains the logistic regression pipeline on the dataset,
    evaluates it, and saves the trained pipeline.
    """
    # Load dataset
    df = pd.read_csv(data_path)
    
    # Drop patient identifier if present
    if 'PATIENT' in df.columns:
        df = df.drop(columns=['PATIENT'])
    
    X = df.drop(columns=['target'])
    y = df['target']
    
    # Stratified split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    print(f"Training on {len(X_train)} samples, testing on {len(X_test)} samples.")
    
    # Get pipeline
    pipeline = create_pipeline()
    
    # Train
    pipeline.fit(X_train, y_train)
    
    # Predict
    y_pred = pipeline.predict(X_test)
    y_pred_proba = pipeline.predict_proba(X_test)[:, 1]
    
    # Evaluate
    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, zero_division=0)
    rec = recall_score(y_test, y_pred, zero_division=0)
    f1 = f1_score(y_test, y_pred, zero_division=0)
    
    # ROC AUC might fail if only one class is present in test set
    try:
        roc = roc_auc_score(y_test, y_pred_proba)
    except ValueError:
        roc = float('nan')
    
    print("--- Evaluation Report ---")
    print(f"Accuracy:  {acc:.4f}")
    print(f"Precision: {prec:.4f}")
    print(f"Recall:    {rec:.4f}")
    print(f"F1-Score:  {f1:.4f}")
    print(f"ROC-AUC:   {roc:.4f}")
    print("-------------------------")
    
    # Save model
    os.makedirs(os.path.dirname(model_save_path), exist_ok=True)
    
    model_artifact = {
        'pipeline': pipeline,
        'version': MODEL_VERSION,
        'features': list(X.columns)
    }
    joblib.dump(model_artifact, model_save_path)
    print(f"Model saved to {model_save_path} (Version {MODEL_VERSION})")

if __name__ == "__main__":
    train_and_evaluate(
        data_path="data/processed/synthea_ml_dataset.csv",
        model_save_path="models/risk_model.joblib"
    )
