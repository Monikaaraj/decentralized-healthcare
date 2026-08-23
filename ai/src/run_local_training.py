import logging
import json
import numpy as np
from federated.hospital import HospitalDataset
from federated.local_training import train_local_model, get_model_parameters

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

if __name__ == "__main__":
    hospitals = ['hospital_a', 'hospital_b', 'hospital_c']
    
    for h_name in hospitals:
        dataset = HospitalDataset(h_name, base_dir="data/hospitals")
        try:
            pipeline, metadata = train_local_model(dataset)
            params = get_model_parameters(pipeline)
            
            print(f"\n--- Local Training Result: {h_name} ---")
            print(json.dumps(metadata, indent=2))
            print(f"Coef Shape: {params['coef'].shape}")
            print(f"Intercept Shape: {params['intercept'].shape}")
        except Exception as e:
            logger.error(f"Failed to train {h_name}: {e}")
