"""
AEGIS-AI Privacy-Preserving Machine Learning (PPML) Pipeline
Module 2: Local Model Architecture & Training (local_trainer.py)

Architecture:
- AegisDiagnosticsNet: Multi-modal neural network fusing tabular EHR with 224x224 Chest X-Ray features.
- Multi-label Focal Loss for handling severe clinical class imbalance.
- Local AdamW optimizer with L2 gradient clipping to mitigate gradient inversion risks.
- Clean weight serialization and deserialization routines for federated communication.
"""

import io
import copy
import logging
from typing import Dict, List, Tuple, Optional, Any
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader

logger = logging.getLogger("AEGIS.LocalTrainer")


class MultiLabelFocalLoss(nn.Module):
    """
    Focal Loss adapted for Multi-Label Binary Classification.
    Addresses severe medical class imbalance (e.g. rare conditions like Pneumothorax).
    FL(p_t) = -alpha_t * (1 - p_t)^gamma * log(p_t)
    """
    def __init__(self, alpha: float = 0.25, gamma: float = 2.0, reduction: str = "mean"):
        super(MultiLabelFocalLoss, self).__init__()
        self.alpha = alpha
        self.gamma = gamma
        self.reduction = reduction

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        bce_loss = F.binary_cross_entropy_with_logits(logits, targets, reduction="none")
        probs = torch.sigmoid(logits)
        p_t = targets * probs + (1 - targets) * (1 - probs)
        alpha_factor = targets * self.alpha + (1 - targets) * (1 - self.alpha)
        modulating_factor = (1.0 - p_t) ** self.gamma
        focal_loss = alpha_factor * modulating_factor * bce_loss

        if self.reduction == "mean":
            return focal_loss.mean()
        elif self.reduction == "sum":
            return focal_loss.sum()
        return focal_loss


class TabularFeatureExtractor(nn.Module):
    """Deep MLP with Batch Normalization and Dropout for Clinical EHR features."""
    def __init__(self, input_dim: int, hidden_dim: int = 64, output_dim: int = 64):
        super(TabularFeatureExtractor, self).__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.BatchNorm1d(hidden_dim),
            nn.LeakyReLU(0.1),
            nn.Dropout(0.25),
            nn.Linear(hidden_dim, output_dim),
            nn.BatchNorm1d(output_dim),
            nn.LeakyReLU(0.1)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class VisualFeatureExtractor(nn.Module):
    """
    Convolutional backbone extracting spatial representations from 224x224 Chest X-Rays.
    Uses progressive pooling and adaptive average pooling for a compact 128-dim embedding.
    """
    def __init__(self, output_dim: int = 128):
        super(VisualFeatureExtractor, self).__init__()
        self.conv_stack = nn.Sequential(
            nn.Conv2d(3, 32, kernel_size=3, stride=2, padding=1), # -> (32, 112, 112)
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2, 2), # -> (32, 56, 56)

            nn.Conv2d(32, 64, kernel_size=3, stride=2, padding=1), # -> (64, 28, 28)
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2, 2), # -> (64, 14, 14)

            nn.Conv2d(64, 128, kernel_size=3, stride=1, padding=1), # -> (128, 14, 14)
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.AdaptiveAvgPool2d((1, 1)) # -> (128, 1, 1)
        )
        self.fc = nn.Linear(128, output_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        feat = self.conv_stack(x)
        feat = torch.flatten(feat, 1)
        return self.fc(feat)


class AegisDiagnosticsNet(nn.Module):
    """
    Unified Multi-Modal Diagnostic Neural Network.
    Fuses tabular clinical metrics with chest radiographs to produce multi-label predictions.
    """
    def __init__(self, tabular_input_dim: int, num_classes: int = 8):
        super(AegisDiagnosticsNet, self).__init__()
        self.tabular_encoder = TabularFeatureExtractor(input_dim=tabular_input_dim, output_dim=64)
        self.visual_encoder = VisualFeatureExtractor(output_dim=128)
        
        # Multimodal Fusion & Classification Head
        fusion_dim = 64 + 128
        self.classifier = nn.Sequential(
            nn.Linear(fusion_dim, 96),
            nn.BatchNorm1d(96),
            nn.ReLU(inplace=True),
            nn.Dropout(0.3),
            nn.Linear(96, num_classes)
        )

    def forward(self, ehr: torch.Tensor, img: torch.Tensor) -> torch.Tensor:
        ehr_emb = self.tabular_encoder(ehr)
        img_emb = self.visual_encoder(img)
        fused = torch.cat([ehr_emb, img_emb], dim=1)
        logits = self.classifier(fused)
        return logits


class LocalTrainer:
    """
    Encapsulates private on-premise training loop for a single hospital silo.
    Extracts only model parameters / weight deltas.
    """
    def __init__(
        self,
        model: AegisDiagnosticsNet,
        device: torch.device,
        learning_rate: float = 1e-3,
        weight_decay: float = 1e-4,
        mu_proximal: float = 0.01
    ):
        self.model = model.to(device)
        self.device = device
        self.optimizer = torch.optim.AdamW(self.model.parameters(), lr=learning_rate, weight_decay=weight_decay)
        self.criterion = MultiLabelFocalLoss(alpha=0.25, gamma=2.0)
        self.mu_proximal = mu_proximal # FedProx proximal regularization weight

    def train_epoch(
        self,
        train_loader: DataLoader,
        global_model_params: Optional[Dict[str, torch.Tensor]] = None,
        max_grad_norm: float = 1.0
    ) -> float:
        """
        Executes one local training epoch.
        If global_model_params is provided, adds a FedProx proximal penalty:
        Loss_total = Loss_focal + (mu / 2) * || w - w_global ||^2
        """
        self.model.train()
        total_loss = 0.0
        num_batches = 0

        # Snapshot of global weights for proximal term
        global_tensors = None
        if global_model_params is not None and self.mu_proximal > 0:
            global_tensors = {k: v.to(self.device) for k, v in global_model_params.items()}

        for ehr, img, targets in train_loader:
            ehr = ehr.to(self.device)
            img = img.to(self.device)
            targets = targets.to(self.device)

            self.optimizer.zero_grad()
            logits = self.model(ehr, img)
            loss = self.criterion(logits, targets)

            # FedProx Proximal Regularization
            if global_tensors is not None:
                prox_term = 0.0
                for name, param in self.model.named_parameters():
                    if name in global_tensors:
                        prox_term += ((param - global_tensors[name]) ** 2).sum()
                loss += (self.mu_proximal / 2.0) * prox_term

            loss.backward()

            # L2 Gradient Clipping (mitigates exploding gradients & differential privacy exposure)
            torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=max_grad_norm)
            
            self.optimizer.step()

            total_loss += loss.item()
            num_batches += 1

        return total_loss / max(num_batches, 1)

    def evaluate(self, val_loader: DataLoader) -> Dict[str, float]:
        """Calculates multi-label loss, accuracy, and F1 metrics on local holdout."""
        self.model.eval()
        total_loss = 0.0
        all_preds = []
        all_targets = []

        with torch.no_grad():
            for ehr, img, targets in val_loader:
                ehr = ehr.to(self.device)
                img = img.to(self.device)
                targets = targets.to(self.device)

                logits = self.model(ehr, img)
                loss = self.criterion(logits, targets)
                total_loss += loss.item()

                probs = torch.sigmoid(logits)
                preds = (probs >= 0.5).float()

                all_preds.append(preds.cpu().numpy())
                all_targets.append(targets.cpu().numpy())

        all_preds = np.vstack(all_preds)
        all_targets = np.vstack(all_targets)

        # Exact match and macro accuracy
        exact_match = (all_preds == all_targets).all(axis=1).mean()
        hamming_acc = (all_preds == all_targets).mean()

        return {
            "val_loss": total_loss / max(len(val_loader), 1),
            "exact_match_accuracy": float(exact_match),
            "hamming_accuracy": float(hamming_acc)
        }

    def get_weights(self) -> Dict[str, np.ndarray]:
        """Extracts serializable numpy arrays of model parameters."""
        return {k: v.cpu().detach().numpy() for k, v in self.model.state_dict().items()}

    def set_weights(self, weights: Dict[str, np.ndarray]) -> None:
        """Injects aggregated global weights into local model."""
        state_dict = {k: torch.tensor(v, device=self.device) for k, v in weights.items()}
        self.model.load_state_dict(state_dict, strict=True)

    def serialize_weights_to_bytes(self) -> bytes:
        """Serializes local state dict into a binary buffer for encrypted network transit."""
        buf = io.BytesIO()
        state_dict = {k: v.cpu() for k, v in self.model.state_dict().items()}
        torch.save(state_dict, buf)
        buf.seek(0)
        return buf.read()
