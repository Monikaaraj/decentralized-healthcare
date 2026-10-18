import os
import logging
import flwr as fl
from flwr.common import FitIns, Parameters, ndarrays_to_parameters, parameters_to_ndarrays
from federated.client import HospitalClient
from federated.server import start_server
from federated.local_training import set_model_parameters, train_local_model
from federated.hospital import HospitalDataset
import joblib

logging.basicConfig(level=logging.INFO)
logging.getLogger("flwr").setLevel(logging.ERROR)

import os
import logging
import numpy as np
import flwr as fl
from typing import List, Dict, Any, Tuple
from flwr.common import FitIns, Parameters, ndarrays_to_parameters, parameters_to_ndarrays
from federated.client import HospitalClient
from federated.server import start_server
from federated.local_training import set_model_parameters, get_feature_stats
from federated.hospital import HospitalDataset
from src.preprocessing import create_pipeline
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score
import pandas as pd
import joblib

logging.basicConfig(level=logging.INFO)
logging.getLogger("flwr").setLevel(logging.ERROR)

def aggregate_feature_stats(stats_list: List[Dict[str, Any]], feature_names: List[str]) -> Tuple[np.ndarray, np.ndarray]:
    """Computes global mean and variance from local feature statistics without raw data."""
    global_count = {f: 0 for f in feature_names}
    global_sum = {f: 0.0 for f in feature_names}
    global_sq_sum = {f: 0.0 for f in feature_names}
    
    for stats in stats_list:
        for f in feature_names:
            global_count[f] += stats['count'].get(f, 0)
            global_sum[f] += stats['sum'].get(f, 0.0)
            global_sq_sum[f] += stats['sq_sum'].get(f, 0.0)
            
    means = np.zeros(len(feature_names))
    variances = np.zeros(len(feature_names))
    
    for i, f in enumerate(feature_names):
        n = global_count[f]
        if n > 0:
            mean = global_sum[f] / n
            var = (global_sq_sum[f] / n) - (mean ** 2)
            means[i] = mean
            variances[i] = var if var > 0 else 1.0 # prevent div by zero
        else:
            means[i] = 0.0
            variances[i] = 1.0
            
    scales = np.sqrt(variances)
    return means, scales

def evaluate_model(pipeline, df: pd.DataFrame, prefix=""):
    """Evaluate against a dataset."""
    X = df.drop(columns=['target', 'PATIENT'], errors='ignore')
    y = df['target']
    
    y_pred = pipeline.predict(X)
    y_pred_proba = pipeline.predict_proba(X)[:, 1] if len(pipeline.classes_) > 1 else None
    
    metrics = {
        f"{prefix}accuracy": accuracy_score(y, y_pred),
        f"{prefix}precision": precision_score(y, y_pred, zero_division=0),
        f"{prefix}recall": recall_score(y, y_pred, zero_division=0),
        f"{prefix}f1": f1_score(y, y_pred, zero_division=0),
        f"{prefix}roc_auc": roc_auc_score(y, y_pred_proba) if y_pred_proba is not None else 0.0
    }
    return metrics

if __name__ == "__main__":
    print("==================================================")
    print("TECHNICAL AUDIT: PREPROCESSING COMPATIBILITY & EVAL")
    print("==================================================")
    
    # We create a centralized baseline model on the concatenated dataset.
    # THIS IS ONLY FOR BENCHMARKING. We explicitly label it.
    print("\n--- Training Centralized Baseline (For Benchmark Only) ---")
    hospitals = ["hospital_a", "hospital_b", "hospital_c"]
    dfs = [HospitalDataset(h).get_training_data() for h in hospitals]
    central_df = pd.concat(dfs, ignore_index=True)
    
    X_central = central_df.drop(columns=['target', 'PATIENT'])
    y_central = central_df['target']
    
    central_pipeline = create_pipeline()
    central_pipeline.fit(X_central, y_central)
    
    # We use the centralized dataset as our evaluation set since we only have 108 patients total.
    # We explicitly note this limitation!
    print("Note: Because our entire dataset is only 108 patients, we evaluate on the full set.")
    central_metrics = evaluate_model(central_pipeline, central_df, prefix="Centralized ")
    print(central_metrics)

    print("\n==================================================")
    print("INITIALIZING SECURE FEDERATED LEARNING SIMULATION")
    print("==================================================")
    
    clients = {h: HospitalClient(h) for h in hospitals}
    feature_names = ['age', 'glucose', 'blood_pressure', 'bmi', 'cholesterol', 'heart_rate']
    
    # 1. Server securely requests stats to fix preprocessing
    print("Server: Requesting local feature statistics...")
    stats_list = [get_feature_stats(c.dataset) for c in clients.values()]
    global_means, global_scales = aggregate_feature_stats(stats_list, feature_names)
    
    print("Server: Distributing global preprocessing bounds...")
    for c in clients.values():
        c.set_global_preprocessing(global_means, global_scales)
        
    num_rounds = 3
    strategy = start_server(num_rounds=num_rounds)
    
    # Initialize global parameters for round 1
    global_parameters = ndarrays_to_parameters([
        np.zeros((1, len(feature_names))), # coef
        np.zeros(1),                       # intercept
        np.array([0, 1])                   # classes
    ])
    
    for round_num in range(1, num_rounds + 1):
        print(f"\n--- Starting Federated Round {round_num} ---")
        results = []
        for cid, client in clients.items():
            print(f"[{cid}] local training...")
            client_ndarrays = parameters_to_ndarrays(global_parameters)
            new_ndarrays, num_samples, metrics = client.fit(parameters=client_ndarrays, config={"local_epochs": 1})
            
            from flwr.common import FitRes, Status, Code
            fit_res = FitRes(
                status=Status(code=Code.OK, message=""),
                parameters=ndarrays_to_parameters(new_ndarrays),
                num_examples=num_samples,
                metrics=metrics
            )
            results.append((None, fit_res))
            
        print("Server -> FedAvg Aggregation")
        global_parameters, _ = strategy.aggregate_fit(server_round=round_num, results=results, failures=[])
        
    print("\n==================================================")
    print("FEDERATED VS CENTRALIZED EVALUATION")
    print("==================================================")
    
    final_params = parameters_to_ndarrays(global_parameters)
    params_dict = {'coef': final_params[0], 'intercept': final_params[1], 'classes': final_params[2]}
    
    # We construct the final global pipeline using the shared global scaler bounds
    global_pipeline = create_pipeline()
    
    dummy_X = np.vstack([global_means - global_scales, global_means + global_scales])
    dummy_y = np.array([0, 1])
    dummy_df = pd.DataFrame(dummy_X, columns=feature_names)
    
    global_pipeline.fit(dummy_df, dummy_y)
    
    classifier = global_pipeline.named_steps['classifier']
    classifier.classes_ = params_dict['classes']
    classifier.coef_ = params_dict['coef']
    classifier.intercept_ = params_dict['intercept']
    
    fed_metrics = evaluate_model(global_pipeline, central_df, prefix="Federated   ")
    
    for m in central_metrics.keys():
        m_name = m.replace("Centralized ", "")
        fed_m = fed_metrics[f"Federated   {m_name}"]
        cen_m = central_metrics[m]
        print(f"{m_name.upper():<10} | Centralized: {cen_m:.4f} | Federated: {fed_m:.4f}")

    os.makedirs("models", exist_ok=True)
    save_path = "models/federated_risk_model.joblib"
    
    artifact = {
        'pipeline': global_pipeline,
        'model_version': "1.2.0-federated",
        'number_of_rounds': num_rounds,
        'participating_hospitals': 3,
        'features': feature_names,
        'aggregation_strategy': 'FedAvg-SecureScaling'
    }
    
    joblib.dump(artifact, save_path)
    print(f"\nGlobal model saved to {save_path}")
