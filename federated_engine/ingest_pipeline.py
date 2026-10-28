"""
AEGIS-AI Ingest & Train Helper
Integrates fulfilled patient medical files into the Federated Training pipeline.
"""
import os
import json
import logging
import pandas as pd
import numpy as np

logger = logging.getLogger("AEGIS.DataIngest")

def ingest_patient_record_to_silo(record_data: dict, silo_id: str = "Node_A", base_data_dir: str = "data/silos"):
    """
    Ingests a newly submitted patient record into a designated silo's dataset.
    Preserves isolation: stored strictly inside local hospital silo boundary.
    """
    os.makedirs(os.path.join(base_data_dir, silo_id), exist_ok=True)
    csv_path = os.path.join(base_data_dir, silo_id, "local_ehr.csv")
    
    # Format incoming data to match EHR schema
    df_new = pd.DataFrame([record_data])
    
    if os.path.exists(csv_path):
        df_existing = pd.read_csv(csv_path)
        combined = pd.concat([df_existing, df_new], ignore_index=True)
        combined.to_csv(csv_path, index=False)
        logger.info(f"Appended new record to {silo_id}. Total count: {len(combined)}")
    else:
        df_new.to_csv(csv_path, index=False)
        logger.info(f"Initialized {silo_id} data with new record.")
        
    return {"status": "success", "silo": silo_id}
