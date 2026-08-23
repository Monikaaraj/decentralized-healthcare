import os
import logging
from src.ingestion import load_synthea_data
from src.feature_engineering import create_ml_dataset

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def process_and_save(synthea_dir: str = "data/synthea", output_path: str = "data/processed/synthea_ml_dataset.csv"):
    logger.info(f"Loading Synthea data from {synthea_dir}")
    try:
        patients, observations, conditions = load_synthea_data(synthea_dir)
    except FileNotFoundError as e:
        logger.error(f"Cannot process dataset: {e}")
        return

    logger.info("Engineering features")
    df = create_ml_dataset(patients, observations, conditions)
    
    logger.info(f"Generated dataset with {len(df)} patients and {df['target'].sum()} positive targets")
    logger.info(f"Missing value statistics:\n{df.isna().sum()}")
    
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    df.to_csv(output_path, index=False)
    logger.info(f"Saved processed dataset to {output_path}")
    return df

if __name__ == "__main__":
    process_and_save()
