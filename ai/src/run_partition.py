import logging
import json
from federated.partition import partition_dataset

logging.basicConfig(level=logging.INFO)

if __name__ == "__main__":
    metadata = partition_dataset(
        input_path="data/processed/synthea_ml_dataset.csv",
        output_directory="data/hospitals",
        num_hospitals=3,
        random_state=42
    )
    print("\n--- Partition Summary ---")
    print(json.dumps(metadata, indent=2))
