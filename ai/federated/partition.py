import pandas as pd
import os
import numpy as np
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

def partition_dataset(
    input_path: str,
    output_directory: str,
    num_hospitals: int = 3,
    random_state: int = 42
) -> Dict[str, Any]:
    """
    Partitions the processed dataset into isolated hospital silos by PATIENT.
    Ensures zero overlap and assigns all patients exactly once.
    """
    df = pd.read_csv(input_path)
    
    if 'PATIENT' not in df.columns:
        raise ValueError("Input dataset must contain a 'PATIENT' column to partition safely.")
    
    # Ensure patient IDs are unique (1 row per patient in this dataset)
    if not df['PATIENT'].is_unique:
        raise ValueError("Duplicate PATIENT IDs found. Partitioning must be at the patient level.")
    
    # Shuffle deterministically
    df_shuffled = df.sample(frac=1.0, random_state=random_state).reset_index(drop=True)
    
    # Partition
    splits = np.array_split(df_shuffled, num_hospitals)
    
    metadata = {}
    hospital_names = [f"hospital_{chr(97+i)}" for i in range(num_hospitals)] # hospital_a, hospital_b, etc.
    
    all_assigned_patients = set()
    
    for i, hospital_df in enumerate(splits):
        h_name = hospital_names[i]
        h_dir = os.path.join(output_directory, h_name)
        os.makedirs(h_dir, exist_ok=True)
        
        # Verify no overlap
        current_patients = set(hospital_df['PATIENT'])
        if not current_patients.isdisjoint(all_assigned_patients):
            raise RuntimeError(f"Privacy breach: Patient overlap detected in {h_name}")
            
        all_assigned_patients.update(current_patients)
        
        out_path = os.path.join(h_dir, "data.csv")
        hospital_df.to_csv(out_path, index=False)
        
        target_counts = hospital_df['target'].value_counts().to_dict()
        positive_targets = target_counts.get(1, 0)
        negative_targets = target_counts.get(0, 0)
        
        metadata[h_name] = {
            "num_patients": len(hospital_df),
            "positive_targets": positive_targets,
            "negative_targets": negative_targets,
            "feature_columns": list(hospital_df.drop(columns=['PATIENT', 'target']).columns)
        }
        
        logger.info(f"{h_name}: {len(hospital_df)} patients, {positive_targets} positive, {negative_targets} negative")
        
    # Final verification
    if len(all_assigned_patients) != len(df):
        raise RuntimeError("Privacy breach: Total assigned patients does not match source patient count.")
        
    return metadata
