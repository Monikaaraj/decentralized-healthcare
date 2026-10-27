"""
AEGIS-AI Privacy-Preserving Machine Learning (PPML) Pipeline
Module 1: Data Partitioning & Preprocessing Pipeline (data_pipeline.py)

Privacy Architecture:
- Strict isolation: Each hospital silo (Node A, Node B, Node C) has its own local storage.
- Raw EHR and Imaging data NEVER leave local boundaries.
- Preprocessors fit strictly on local distributions to avoid inter-silo data leakage.
"""

import os
import json
import logging
from typing import Dict, List, Tuple, Optional
import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset, DataLoader
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.impute import SimpleImputer
from PIL import Image

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("AEGIS.DataPipeline")

# Diagnostic Multi-Label Disease Targets (Clinical EHR + Chest X-Ray)
DISEASE_LABELS = [
    "Atelectasis",
    "Cardiomegaly",
    "Consolidation",
    "Edema",
    "Pleural_Effusion",
    "Pneumonia",
    "Pneumothorax",
    "Septic_Shock"
]

NUMERICAL_FEATURES = [
    "age",
    "heart_rate",
    "systolic_bp",
    "diastolic_bp",
    "respiratory_rate",
    "spo2",
    "temperature",
    "glucose",
    "white_blood_cells",
    "creatinine"
]

CATEGORICAL_FEATURES = [
    "gender",           # M, F
    "admission_type",   # EMERGENCY, ELECTIVE, URGENT
    "icu_type"          # MICU, SICU, CCU
]

# Standardized Clinical Domain Vocabulary to guarantee consistent feature dimensions across non-IID silos
CATEGORICAL_CATEGORIES = [
    ["M", "F"],
    ["EMERGENCY", "ELECTIVE", "URGENT"],
    ["MICU", "SICU", "CCU"]
]


class MultiModalMIMICDataset(Dataset):
    """
    PyTorch Dataset loading multimodal patient data strictly from local hospital silo.
    Combines structured tabular EHR features with 224x224 Chest X-Ray imagery.
    """
    def __init__(
        self,
        tabular_data: np.ndarray,
        labels: np.ndarray,
        image_data: Optional[np.ndarray] = None,
        transform=None
    ):
        """
        Args:
            tabular_data: Preprocessed tabular feature matrix (num_samples, num_features).
            labels: Binary multi-label target array (num_samples, num_classes).
            image_data: Optional preprocessed synthetic/real CXR images (num_samples, 3, 224, 224).
            transform: Optional torchvision transforms.
        """
        self.tabular_features = torch.tensor(tabular_data, dtype=torch.float32)
        self.labels = torch.tensor(labels, dtype=torch.float32)
        self.transform = transform
        
        if image_data is not None:
            self.image_data = torch.tensor(image_data, dtype=torch.float32)
        else:
            # Generate deterministic synthetic 224x224 3-channel CXR tensors if raw images aren't mounted
            num_samples = len(tabular_data)
            self.image_data = torch.randn(num_samples, 3, 224, 224, dtype=torch.float32)

    def __len__(self) -> int:
        return len(self.tabular_features)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        ehr = self.tabular_features[idx]
        img = self.image_data[idx]
        label = self.labels[idx]
        return ehr, img, label


class LocalSiloPreprocessor:
    """
    Performs data cleaning, imputation, and scaling within a single isolated node.
    Maintains zero state linkage with other nodes.
    """
    def __init__(self):
        self.num_imputer = SimpleImputer(strategy="median")
        self.cat_imputer = SimpleImputer(strategy="most_frequent")
        self.scaler = StandardScaler()
        self.encoder = OneHotEncoder(categories=CATEGORICAL_CATEGORIES, sparse_output=False, handle_unknown="ignore")
        self.is_fitted = False
        self.feature_dim = None

    def fit_transform(self, df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """Fit preprocessors strictly on the hospital's local training split."""
        # 1. Process numerical features
        num_raw = df[NUMERICAL_FEATURES].values
        num_imputed = self.num_imputer.fit_transform(num_raw)
        num_scaled = self.scaler.fit_transform(num_imputed)

        # 2. Process categorical features
        cat_raw = df[CATEGORICAL_FEATURES].astype(str).values
        cat_imputed = self.cat_imputer.fit_transform(cat_raw)
        cat_encoded = self.encoder.fit_transform(cat_imputed)

        # 3. Concatenate processed features
        X = np.hstack([num_scaled, cat_encoded])
        self.feature_dim = X.shape[1]
        self.is_fitted = True

        # 4. Extract multi-label disease targets
        y = df[DISEASE_LABELS].values.astype(np.float32)
        return X, y

    def transform(self, df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """Transform validation/test data using locally fitted statistics."""
        if not self.is_fitted:
            raise RuntimeError("Preprocessor must be fitted locally before calling transform.")
        num_raw = df[NUMERICAL_FEATURES].values
        num_imputed = self.num_imputer.transform(num_raw)
        num_scaled = self.scaler.transform(num_imputed)

        cat_raw = df[CATEGORICAL_FEATURES].astype(str).values
        cat_imputed = self.cat_imputer.transform(cat_raw)
        cat_encoded = self.encoder.transform(cat_imputed)

        X = np.hstack([num_scaled, cat_encoded])
        y = df[DISEASE_LABELS].values.astype(np.float32)
        return X, y


def generate_synthetic_mimic_dataset(num_samples: int = 1500, random_seed: int = 42) -> pd.DataFrame:
    """
    Generates a realistic clinical dataset modeling MIMIC-III ICU stays & MIMIC-CXR pathology.
    Includes realistic missingness patterns and correlations.
    """
    np.random.seed(random_seed)
    
    # Demographics & Vitals
    age = np.random.normal(63, 14, num_samples).clip(18, 95)
    heart_rate = np.random.normal(84, 18, num_samples).clip(40, 180)
    systolic_bp = np.random.normal(122, 22, num_samples).clip(70, 210)
    diastolic_bp = np.random.normal(74, 14, num_samples).clip(40, 120)
    respiratory_rate = np.random.normal(19, 5, num_samples).clip(8, 45)
    spo2 = np.random.normal(96, 4, num_samples).clip(75, 100)
    temperature = np.random.normal(37.1, 0.8, num_samples).clip(34.5, 41.0)
    
    # Laboratory tests
    glucose = np.random.normal(135, 50, num_samples).clip(50, 450)
    white_blood_cells = np.random.normal(11.2, 5.5, num_samples).clip(2.0, 45.0)
    creatinine = np.random.lognormal(0.2, 0.5, num_samples).clip(0.3, 12.0)
    
    gender = np.random.choice(["M", "F"], size=num_samples, p=[0.54, 0.46])
    admission_type = np.random.choice(["EMERGENCY", "ELECTIVE", "URGENT"], size=num_samples, p=[0.78, 0.14, 0.08])
    icu_type = np.random.choice(["MICU", "SICU", "CCU"], size=num_samples, p=[0.45, 0.35, 0.20])

    df = pd.DataFrame({
        "subject_id": [f"PAT_{i:06d}" for i in range(1, num_samples + 1)],
        "age": age,
        "heart_rate": heart_rate,
        "systolic_bp": systolic_bp,
        "diastolic_bp": diastolic_bp,
        "respiratory_rate": respiratory_rate,
        "spo2": spo2,
        "temperature": temperature,
        "glucose": glucose,
        "white_blood_cells": white_blood_cells,
        "creatinine": creatinine,
        "gender": gender,
        "admission_type": admission_type,
        "icu_type": icu_type
    })

    # Introduce realistic 5% random missingness in laboratory metrics
    for col in ["glucose", "white_blood_cells", "creatinine", "temperature"]:
        mask = np.random.rand(num_samples) < 0.05
        df.loc[mask, col] = np.nan

    # Disease probabilities conditioned on vitals & labs
    p_cardiomegaly = 1 / (1 + np.exp(-(0.04 * (df["age"] - 60) + 0.02 * (df["systolic_bp"] - 120))))
    p_pneumonia = 1 / (1 + np.exp(-(0.08 * (df["respiratory_rate"] - 20) + 0.05 * (df["white_blood_cells"].fillna(11) - 10))))
    p_edema = 1 / (1 + np.exp(-(0.3 * (df["creatinine"].fillna(1.0) - 1.2) - 0.05 * (df["spo2"] - 95))))
    p_sepsis = 1 / (1 + np.exp(-(0.06 * (df["heart_rate"] - 90) + 0.08 * (df["white_blood_cells"].fillna(11) - 12))))

    # Multi-label sampling
    df["Cardiomegaly"] = (np.random.rand(num_samples) < p_cardiomegaly * 0.45).astype(int)
    df["Pneumonia"] = (np.random.rand(num_samples) < p_pneumonia * 0.35).astype(int)
    df["Edema"] = (np.random.rand(num_samples) < p_edema * 0.30).astype(int)
    df["Septic_Shock"] = (np.random.rand(num_samples) < p_sepsis * 0.20).astype(int)
    df["Atelectasis"] = (np.random.rand(num_samples) < 0.28).astype(int)
    df["Consolidation"] = (np.random.rand(num_samples) < 0.15).astype(int)
    df["Pleural_Effusion"] = (np.random.rand(num_samples) < 0.24).astype(int)
    df["Pneumothorax"] = (np.random.rand(num_samples) < 0.07).astype(int)

    return df


def partition_non_iid_silos(
    df: pd.DataFrame,
    output_dir: str = "data/silos"
) -> Dict[str, Dict]:
    """
    Partitions the master EHR dataset into 3 Non-IID heterogeneous hospital nodes:
    - Node A: Tertiary Urban Hospital (Elderly, high acuity, ICU patients)
    - Node B: Outpatient Community Clinic (Younger/middle-aged, chronic stable)
    - Node C: Specialized Cardiopulmonary Research Center (High chest pathology)
    
    Guarantees:
    - Zero sample overlap across nodes.
    - Raw data files are saved exclusively in node-specific subdirectories.
    """
    os.makedirs(output_dir, exist_ok=True)
    
    # 1. Node A (Tertiary Hospital): Higher age (>60) and Emergency admissions
    crit_mask_a = (df["age"] >= 58) & (df["admission_type"] == "EMERGENCY")
    node_a_candidates = df[crit_mask_a]
    remaining = df[~crit_mask_a]

    # Sample Node A (approx 45% of data)
    num_a = min(len(node_a_candidates), int(len(df) * 0.40))
    node_a_df = node_a_candidates.sample(n=num_a, random_state=42)
    pool_left = pd.concat([node_a_candidates.drop(node_a_df.index), remaining])

    # 2. Node C (Specialized Research Center): High prevalence of Cardiopulmonary findings
    crit_mask_c = (pool_left["Cardiomegaly"] == 1) | (pool_left["Pleural_Effusion"] == 1)
    node_c_candidates = pool_left[crit_mask_c]
    remaining_c = pool_left[~crit_mask_c]

    num_c = min(len(node_c_candidates), int(len(df) * 0.35))
    node_c_df = node_c_candidates.sample(n=num_c, random_state=42)
    
    # 3. Node B (Community Clinic): The remaining cohort (milder cases, outpatient/elective)
    node_b_df = pd.concat([node_c_candidates.drop(node_c_df.index), remaining_c])

    # Verification: Ensure disjoint patient sets
    sets = [set(node_a_df["subject_id"]), set(node_b_df["subject_id"]), set(node_c_df["subject_id"])]
    assert sets[0].isdisjoint(sets[1]), "Data Leakage: Node A and Node B overlap!"
    assert sets[0].isdisjoint(sets[2]), "Data Leakage: Node A and Node C overlap!"
    assert sets[1].isdisjoint(sets[2]), "Data Leakage: Node B and Node C overlap!"

    silos = {
        "Node_A": {"name": "Hospital Silo A (Urban Tertiary)", "df": node_a_df},
        "Node_B": {"name": "Clinic Silo B (Outpatient Community)", "df": node_b_df},
        "Node_C": {"name": "Medical Research Center Silo C (Cardiopulmonary)", "df": node_c_df}
    }

    metadata = {}
    for silo_id, silo_data in silos.items():
        silo_path = os.path.join(output_dir, silo_id)
        os.makedirs(silo_path, exist_ok=True)
        file_path = os.path.join(silo_path, "local_ehr.csv")
        silo_data["df"].to_csv(file_path, index=False)

        # Calculate label distribution metrics
        label_dist = {col: int(silo_data["df"][col].sum()) for col in DISEASE_LABELS}
        metadata[silo_id] = {
            "name": silo_data["name"],
            "num_patients": len(silo_data["df"]),
            "mean_age": float(silo_data["df"]["age"].mean()),
            "label_distribution": label_dist,
            "path": file_path
        }
        logger.info(f"[{silo_id}] Initialized with {len(silo_data['df'])} records at {file_path}")

    # Save summary metadata
    with open(os.path.join(output_dir, "silo_manifest.json"), "w") as f:
        json.dump(metadata, f, indent=2)

    return metadata


def build_node_dataloaders(
    silo_csv_path: str,
    batch_size: int = 32,
    train_split: float = 0.80
) -> Tuple[DataLoader, DataLoader, LocalSiloPreprocessor]:
    """
    Constructs isolated PyTorch DataLoaders for a specific hospital node.
    Fits the local preprocessor strictly on the train partition.
    """
    if not os.path.exists(silo_csv_path):
        raise FileNotFoundError(f"Silo data not found at {silo_csv_path}")

    df = pd.read_csv(silo_csv_path)
    
    # Deterministic split within local node
    train_size = int(len(df) * train_split)
    train_df = df.iloc[:train_size].copy()
    val_df = df.iloc[train_size:].copy()

    preprocessor = LocalSiloPreprocessor()
    X_train, y_train = preprocessor.fit_transform(train_df)
    X_val, y_val = preprocessor.transform(val_df)

    train_dataset = MultiModalMIMICDataset(X_train, y_train)
    val_dataset = MultiModalMIMICDataset(X_val, y_val)

    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True, drop_last=False)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)

    return train_loader, val_loader, preprocessor
