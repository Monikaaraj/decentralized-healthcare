"""
AEGIS-AI End-to-End Simulation Script (simulate_federated_round.py)

Demonstrates the complete workflow across all 4 modules:
1. Non-IID MIMIC-III Data Partitioning into 3 isolated hospital silos (Node A, B, C).
2. Construction of private, disjoint PyTorch DataLoaders.
3. Multi-round Federated Averaging (FedAvg) with multi-modal neural network.
4. Validation on a centralized holdout benchmark tracking Accuracy and F1-score.
"""

import os
import sys
import logging
import torch
import numpy as np
import pandas as pd

from data_pipeline import (
    generate_synthetic_mimic_dataset,
    partition_non_iid_silos,
    build_node_dataloaders,
    MultiModalMIMICDataset,
    DISEASE_LABELS
)
from local_trainer import AegisDiagnosticsNet, LocalTrainer
from fl_server import FederatedServer

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("AEGIS.Simulation")


def run_full_simulation(num_rounds: int = 3, num_patients: int = 1200):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info(f"Using Compute Device: {device}")

    # 1. Synthesize MIMIC-III Clinical EHR & CXR Dataset
    logger.info("=== STEP 1: Generating Clinical EHR & CXR Master Cohort ===")
    master_df = generate_synthetic_mimic_dataset(num_samples=num_patients, random_seed=42)
    logger.info(f"Master Cohort generated: {len(master_df)} patients, {len(DISEASE_LABELS)} disease targets.")

    # 2. Partition Non-IID Silos
    logger.info("=== STEP 2: Partitioning into Non-IID Hospital Silos ===")
    silo_dir = "data/silos"
    silo_metadata = partition_non_iid_silos(master_df, output_dir=silo_dir)

    # 3. Build Central Holdout Benchmark Dataset (Never used in training)
    logger.info("=== STEP 3: Creating Centralized Holdout Benchmark Dataset ===")
    benchmark_raw = generate_synthetic_mimic_dataset(num_samples=250, random_seed=999)
    
    # 4. Initialize Local Silos & DataLoaders
    silos = ["Node_A", "Node_B", "Node_C"]
    silo_loaders = {}
    tabular_dim = None

    for silo_id in silos:
        csv_path = os.path.join(silo_dir, silo_id, "local_ehr.csv")
        train_loader, val_loader, preprocessor = build_node_dataloaders(csv_path, batch_size=32)
        silo_loaders[silo_id] = {
            "train_loader": train_loader,
            "val_loader": val_loader,
            "preprocessor": preprocessor,
            "sample_count": len(train_loader.dataset)
        }
        tabular_dim = preprocessor.feature_dim
        logger.info(f"[{silo_id}] Loaded {len(train_loader.dataset)} training samples. Feature Dim: {tabular_dim}")

    # Build Benchmark DataLoader using Node A's preprocessor schema
    ref_preprocessor = silo_loaders["Node_A"]["preprocessor"]
    X_bench, y_bench = ref_preprocessor.transform(benchmark_raw)
    bench_dataset = MultiModalMIMICDataset(X_bench, y_bench)
    benchmark_loader = torch.utils.data.DataLoader(bench_dataset, batch_size=32, shuffle=False)

    # 5. Initialize Federated Server
    logger.info("=== STEP 4: Initializing Federated Orchestration Server ===")
    server = FederatedServer(tabular_input_dim=tabular_dim, num_classes=len(DISEASE_LABELS), device=device)

    # 6. Initial Benchmark Baseline Evaluation
    logger.info("Evaluating Randomly Initialized Global Model...")
    baseline_metrics = server.evaluate_global_model(benchmark_loader)
    logger.info(f"Baseline Benchmark Hamming Accuracy: {baseline_metrics['hamming_accuracy']:.4f}")

    # 7. Federated Learning Loop (Rounds)
    logger.info(f"=== STEP 5: Commencing {num_rounds} Federated Training Rounds ===")

    for round_idx in range(1, num_rounds + 1):
        logger.info(f"\n==================== COMMENCING ROUND {round_idx} / {num_rounds} ====================")
        
        # A. Distribute global weights to all hospital nodes
        global_weights = server.get_global_weights()
        round_updates = []

        # B. Local on-premise training in parallel / sequence
        for silo_id in silos:
            logger.info(f"--- Training on-premise at {silo_metadata[silo_id]['name']} ---")
            
            # Instantiate local node model
            local_model = AegisDiagnosticsNet(tabular_input_dim=tabular_dim, num_classes=len(DISEASE_LABELS))
            trainer = LocalTrainer(local_model, device=device, learning_rate=1e-3, mu_proximal=0.01)
            
            # Load global weights into local model
            trainer.set_weights(global_weights)

            # Train locally for 2 epochs
            epoch_loss = 0.0
            for epoch in range(2):
                loss = trainer.train_epoch(silo_loaders[silo_id]["train_loader"])
                epoch_loss += loss
            epoch_loss /= 2

            # Evaluate local validation performance
            local_eval = trainer.evaluate(silo_loaders[silo_id]["val_loader"])
            logger.info(
                f"[{silo_id}] Local Loss: {epoch_loss:.4f} | "
                f"Local Hamming Acc: {local_eval['hamming_accuracy']:.4f}"
            )

            # Package strictly weights and sample count (No raw records)
            round_updates.append({
                "node_id": silo_id,
                "num_samples": silo_loaders[silo_id]["sample_count"],
                "weights": trainer.get_weights()
            })

        # C. Server Aggregation (FedAvg)
        logger.info(f"--- Aggregating Model Weights at Server via FedAvg ---")
        server.aggregate_weights(round_updates)

        # D. Holdout Benchmark Validation
        logger.info("--- Evaluating Global Model on Held-out Benchmark Dataset ---")
        round_metrics = server.evaluate_global_model(benchmark_loader)
        logger.info(
            f"Round {round_idx} Summary: Loss={round_metrics['benchmark_loss']:.4f}, "
            f"Hamming Acc={round_metrics['hamming_accuracy']:.4f}, "
            f"Macro F1={round_metrics['macro_f1']:.4f}, "
            f"Micro F1={round_metrics['micro_f1']:.4f}"
        )

    logger.info("\n🎉 === SIMULATION SUCCESSFULLY COMPLETED ===")
    logger.info(f"Final Global Model saved to: {os.path.join(server.checkpoint_dir, f'global_model_round_{num_rounds}.pt')}")
    logger.info(f"Convergence history saved to: {os.path.join(server.checkpoint_dir, 'federated_history.json')}")


if __name__ == "__main__":
    run_full_simulation(num_rounds=3, num_patients=1200)
