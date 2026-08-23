import pandas as pd
import numpy as np
import os
import joblib
from typing import Dict, Any, Tuple
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score
from src.preprocessing import create_pipeline
from federated.hospital import HospitalDataset

def train_local_model(hospital_dataset: HospitalDataset, save_dir: str = "models/local") -> Tuple[Any, Dict[str, Any]]:
    """
    Trains a local logistic regression model strictly on the hospital's isolated dataset.
    Returns the trained scikit-learn pipeline and local metrics.
    Does NOT return any raw records or patient IDs.
    """
    df = hospital_dataset.get_training_data()
    
    # 1. Validate features & handle small datasets
    if 'PATIENT' in df.columns:
        df = df.drop(columns=['PATIENT'])
        
    X = df.drop(columns=['target'])
    y = df['target']
    
    # Ensure we have both classes
    if len(y.unique()) < 2:
        raise ValueError(f"{hospital_dataset.hospital_name} cannot train a model because it only contains 1 target class.")
    
    # Fallback to simple split without stratify if class counts are very small
    min_class_count = y.value_counts().min()
    do_stratify = y if min_class_count > 2 else None
    
    try:
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=do_stratify)
    except ValueError:
        # If it still fails, use the whole set for training and testing for this milestone
        X_train, X_test, y_train, y_test = X, X, y, y
        
    # 2. Fit local preprocessing and train model
    pipeline = create_pipeline()
    pipeline.fit(X_train, y_train)
    
    # 3. Evaluate local model
    y_pred = pipeline.predict(X_test)
    y_pred_proba = pipeline.predict_proba(X_test)[:, 1] if len(pipeline.classes_) > 1 else None
    
    metrics = {
        "accuracy": accuracy_score(y_test, y_pred),
        "precision": precision_score(y_test, y_pred, zero_division=0),
        "recall": recall_score(y_test, y_pred, zero_division=0),
        "f1": f1_score(y_test, y_pred, zero_division=0),
        "roc_auc": None
    }
    
    # ROC AUC might fail if test set only has 1 class
    if len(np.unique(y_test)) > 1 and y_pred_proba is not None:
        try:
            metrics["roc_auc"] = roc_auc_score(y_test, y_pred_proba)
        except ValueError:
            pass
            
    # 4. Save local model securely
    os.makedirs(save_dir, exist_ok=True)
    save_path = os.path.join(save_dir, f"{hospital_dataset.hospital_name}_model.joblib")
    
    model_artifact = {
        'pipeline': pipeline,
        'version': "1.1.0",
        'features': list(X.columns)
    }
    joblib.dump(model_artifact, save_path)
    
    metadata = {
        "hospital_id": hospital_dataset.hospital_name,
        "num_samples": len(df),
        "num_positive": int((y == 1).sum()),
        "num_negative": int((y == 0).sum()),
        "features": list(X.columns),
        "metrics": metrics
    }
    
    return pipeline, metadata


def get_model_parameters(pipeline) -> Dict[str, np.ndarray]:
    """
    Extracts trainable parameters from a locally trained LogisticRegression pipeline.
    Suitable for federated aggregation (e.g. Flower).
    Only parameters (coef, intercept, classes) are extracted. Raw data NEVER leaves.
    """
    classifier = pipeline.named_steps['classifier']
    
    return {
        "coef": classifier.coef_,
        "intercept": classifier.intercept_,
        "classes": classifier.classes_
    }


def set_model_parameters(pipeline, parameters: Dict[str, np.ndarray]):
    """
    Loads parameters into a compatible, locally fitted LogisticRegression pipeline.
    This replaces the local weights with global weights (e.g. from Flower Server),
    but preserves the local preprocessing (StandardScaler/Imputer) state.
    """
    classifier = pipeline.named_steps['classifier']
    classifier.coef_ = parameters['coef']
    classifier.intercept_ = parameters['intercept']
    classifier.classes_ = parameters['classes']
    return pipeline


def get_feature_stats(hospital_dataset: HospitalDataset) -> Dict[str, Any]:
    """
    Computes local feature statistics for federated preprocessing alignment.
    Returns NO raw data, only column sums, squared sums, and counts.
    """
    df = hospital_dataset.get_training_data()
    if 'PATIENT' in df.columns:
        df = df.drop(columns=['PATIENT'])
    if 'target' in df.columns:
        X = df.drop(columns=['target'])
    else:
        X = df
        
    stats = {
        'count': X.notna().sum().to_dict(),
        'sum': X.sum(skipna=True).to_dict(),
        'sq_sum': (X ** 2).sum(skipna=True).to_dict(),
        'total_rows': len(X)
    }
    return stats
