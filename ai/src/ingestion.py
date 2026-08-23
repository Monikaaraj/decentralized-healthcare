import pandas as pd
import os
import logging
from typing import Tuple

logger = logging.getLogger(__name__)

def load_synthea_data(synthea_dir: str) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Loads required Synthea CSVs from the provided directory.
    Gracefully handles missing files by raising FileNotFoundError.
    """
    patients_path = os.path.join(synthea_dir, "patients.csv")
    observations_path = os.path.join(synthea_dir, "observations.csv")
    conditions_path = os.path.join(synthea_dir, "conditions.csv")
    
    missing_files = []
    for path in [patients_path, observations_path, conditions_path]:
        if not os.path.exists(path):
            missing_files.append(os.path.basename(path))
            
    if missing_files:
        raise FileNotFoundError(f"Missing required Synthea files: {', '.join(missing_files)}")
        
    patients = pd.read_csv(patients_path, dtype=str)
    observations = pd.read_csv(observations_path, dtype=str)
    conditions = pd.read_csv(conditions_path, dtype=str)
    
    return patients, observations, conditions
