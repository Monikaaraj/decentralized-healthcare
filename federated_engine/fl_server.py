"""
AEGIS-AI Privacy-Preserving Machine Learning (PPML) Pipeline
Module 3: Federated Aggregation Engine (fl_server.py)

Responsibilities:
- Orchestrates multi-round Federated Averaging (FedAvg) and FedProx.
- Implements exact mathematical weighted aggregation:
      W_global = sum_{k=1}^{K} (n_k / N) * W_k
- Evaluates the aggregated global model on a centralized holdout benchmark dataset.
- Tracks multi-label metrics (Hamming Accuracy, Exact Match, Macro F1, Micro F1).
- Enforces Zero Raw Data Ingestion: Accepts strictly model weights and sample sizes.
"""

import os
import json
import logging
from typing import Dict, List, Tuple, Optional, Any
import numpy as np
import torch
from torch.utils.data import DataLoader
from sklearn.metrics import f1_score, precision_score, recall_score, hamming_loss

from local_trainer import AegisDiagnosticsNet, MultiLabelFocalLoss

logger = logging.getLogger("AEGIS.FLServer")


class FederatedServer:
    """
    Central Coordinator for the AEGIS-AI PPML Engine.
    Collects serialized model updates from Hospital Silos and performs FedAvg aggregation.
    """
    def __init__(
        self,
        tabular_input_dim: int,
        num_classes: int = 8,
        device: Optional[torch.device] = None,
        checkpoint_dir: str = "models"
    ):
        self.device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.global_model = AegisDiagnosticsNet(tabular_input_dim=tabular_input_dim, num_classes=num_classes)
        self.global_model.to(self.device)
        self.checkpoint_dir = checkpoint_dir
        os.makedirs(self.checkpoint_dir, exist_ok=True)
        
        self.current_round = 0
        self.history: List[Dict[str, Any]] = []
        self.criterion = MultiLabelFocalLoss(alpha=0.25, gamma=2.0)

    def get_global_weights(self) -> Dict[str, np.ndarray]:
        """Returns the current global model state dict as a dictionary of NumPy arrays."""
        return {k: v.cpu().detach().numpy() for k, v in self.global_model.state_dict().items()}

    def set_global_weights(self, weights: Dict[str, np.ndarray]) -> None:
        """Loads state dict into global model."""
        state_dict = {k: torch.tensor(v, device=self.device) for k, v in weights.items()}
        self.global_model.load_state_dict(state_dict, strict=True)

    def aggregate_weights(
        self,
        node_updates: List[Dict[str, Any]]
    ) -> Dict[str, np.ndarray]:
        """
        Executes Federated Averaging (FedAvg).
        Mathematical Formulation:
            W_{global} = \\sum_{k=1}^{K} \\frac{n_k}{N} W_k
        
        Args:
            node_updates: List of dicts, each containing:
                - "node_id": str
                - "num_samples": int (n_k)
                - "weights": Dict[str, np.ndarray] (W_k)
        
        Returns:
            Aggregated global weights.
        """
        if not node_updates:
            raise ValueError("Cannot aggregate empty node updates list.")

        # Compute total sample size N = sum(n_k)
        total_samples = sum(update["num_samples"] for update in node_updates)
        if total_samples <= 0:
            raise ValueError(f"Total sample size across nodes must be > 0, got {total_samples}")

        logger.info(
            f"--- Round {self.current_round + 1} Aggregation: {len(node_updates)} nodes, "
            f"Total Samples (N): {total_samples} ---"
        )

        first_weights = node_updates[0]["weights"]
        aggregated_weights: Dict[str, np.ndarray] = {}

        # Initialize zero arrays matching shapes
        for param_key, param_val in first_weights.items():
            aggregated_weights[param_key] = np.zeros_like(param_val, dtype=np.float64)

        # Weighted summation: W_global = sum((n_k / N) * W_k)
        for update in node_updates:
            node_id = update["node_id"]
            n_k = update["num_samples"]
            weight_factor = n_k / total_samples
            logger.info(f"Node [{node_id}]: n_k = {n_k}, Weight Contribution (n_k/N) = {weight_factor:.4f}")

            for param_key, param_val in update["weights"].items():
                aggregated_weights[param_key] += weight_factor * param_val.astype(np.float64)

        # Cast back to original dtypes and update global model
        final_weights = {k: v.astype(first_weights[k].dtype) for k, v in aggregated_weights.items()}
        self.set_global_weights(final_weights)
        self.current_round += 1

        return final_weights

    def evaluate_global_model(
        self,
        benchmark_loader: DataLoader,
        threshold: float = 0.5
    ) -> Dict[str, float]:
        """
        Evaluates the aggregated global model on the central holdout benchmark dataset.
        Computes clinical multi-label metrics:
        - Exact Match Ratio (Subset Accuracy)
        - Hamming Accuracy (1 - Hamming Loss)
        - Macro-averaged F1 Score
        - Micro-averaged F1 Score
        - Binary Cross-Entropy / Focal Loss
        """
        self.global_model.eval()
        total_loss = 0.0
        all_preds = []
        all_targets = []

        with torch.no_grad():
            for ehr, img, targets in benchmark_loader:
                ehr = ehr.to(self.device)
                img = img.to(self.device)
                targets = targets.to(self.device)

                logits = self.global_model(ehr, img)
                loss = self.criterion(logits, targets)
                total_loss += loss.item()

                probs = torch.sigmoid(logits)
                preds = (probs >= threshold).float()

                all_preds.append(preds.cpu().numpy())
                all_targets.append(targets.cpu().numpy())

        all_preds = np.vstack(all_preds)
        all_targets = np.vstack(all_targets)

        # Multi-label diagnostic evaluation metrics
        exact_match = (all_preds == all_targets).all(axis=1).mean()
        h_loss = hamming_loss(all_targets, all_preds)
        hamming_acc = 1.0 - h_loss
        macro_f1 = f1_score(all_targets, all_preds, average="macro", zero_division=0)
        micro_f1 = f1_score(all_targets, all_preds, average="micro", zero_division=0)
        precision = precision_score(all_targets, all_preds, average="macro", zero_division=0)
        recall = recall_score(all_targets, all_preds, average="macro", zero_division=0)

        metrics = {
            "round": self.current_round,
            "benchmark_loss": float(total_loss / max(len(benchmark_loader), 1)),
            "exact_match_ratio": float(exact_match),
            "hamming_accuracy": float(hamming_acc),
            "macro_f1": float(macro_f1),
            "micro_f1": float(micro_f1),
            "macro_precision": float(precision),
            "macro_recall": float(recall)
        }

        self.history.append(metrics)
        logger.info(
            f"[Round {self.current_round} Benchmark] Loss: {metrics['benchmark_loss']:.4f} | "
            f"Hamming Acc: {metrics['hamming_accuracy']:.4f} | "
            f"Macro F1: {metrics['macro_f1']:.4f} | Micro F1: {metrics['micro_f1']:.4f}"
        )

        # Save checkpoint
        ckpt_path = os.path.join(self.checkpoint_dir, f"global_model_round_{self.current_round}.pt")
        torch.save(self.global_model.state_dict(), ckpt_path)

        # Export training log
        log_path = os.path.join(self.checkpoint_dir, "federated_history.json")
        with open(log_path, "w") as f:
            json.dump(self.history, f, indent=2)

        return metrics
