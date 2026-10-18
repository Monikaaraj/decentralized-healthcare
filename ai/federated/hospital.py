import pandas as pd
import os
from typing import Dict, List

class HospitalDataset:
    """
    A local hospital silo abstraction.
    This encapsulates the local training data.
    The future aggregator MUST NEVER access the raw data returned by get_training_data().
    """
    
    def __init__(self, hospital_name: str, base_dir: str = "data/hospitals"):
        self.hospital_name = hospital_name
        self.data_path = os.path.join(base_dir, hospital_name, "data.csv")
        
        if not os.path.exists(self.data_path):
            raise FileNotFoundError(f"No local data found for {hospital_name} at {self.data_path}")
            
    def get_training_data(self) -> pd.DataFrame:
        """
        Returns the raw local dataframe.
        ONLY for use by the local future Flower client.
        DO NOT send this over the network.
        """
        return pd.read_csv(self.data_path)
        
    def get_feature_columns(self) -> List[str]:
        df = pd.read_csv(self.data_path, nrows=0)
        cols = list(df.columns)
        if 'PATIENT' in cols: cols.remove('PATIENT')
        if 'target' in cols: cols.remove('target')
        return cols
        
    def get_sample_count(self) -> int:
        df = pd.read_csv(self.data_path)
        return len(df)
        
    def get_target_distribution(self) -> Dict[int, int]:
        df = pd.read_csv(self.data_path)
        # convert numpy int types to int for easy serialization
        return {int(k): int(v) for k, v in df['target'].value_counts().to_dict().items()}
