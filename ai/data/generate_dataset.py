import pandas as pd
import numpy as np
import os
import argparse

def generate_synthetic_data(num_samples: int = 1000, seed: int = 42, output_path: str = None) -> pd.DataFrame:
    """
    Generates a synthetic health dataset.
    This is NOT real medical data. It is for research/demo purposes only.
    """
    np.random.seed(seed)
    
    # Generate features
    age = np.random.randint(18, 90, size=num_samples)
    glucose = np.random.normal(100, 20, size=num_samples).clip(70, 200)
    blood_pressure = np.random.normal(120, 15, size=num_samples).clip(80, 180)
    bmi = np.random.normal(25, 5, size=num_samples).clip(15, 45)
    cholesterol = np.random.normal(190, 30, size=num_samples).clip(120, 300)
    heart_rate = np.random.normal(70, 10, size=num_samples).clip(40, 120)
    
    # Calculate a hidden risk score to generate a realistic but imperfect target
    # Higher age, glucose, bp, bmi, cholesterol contribute to higher risk
    risk_score = (
        (age - 50) / 40 * 1.5 + 
        (glucose - 100) / 50 * 1.2 + 
        (blood_pressure - 120) / 30 * 1.0 + 
        (bmi - 25) / 10 * 0.8 + 
        (cholesterol - 190) / 50 * 0.8
    )
    
    # Add some noise to prevent 100% accuracy
    noise = np.random.normal(0, 1.5, size=num_samples)
    final_score = risk_score + noise
    
    # Target label: 1 if high risk, 0 if low risk
    target = (final_score > 1.0).astype(int)
    
    df = pd.DataFrame({
        'age': age,
        'glucose': glucose,
        'blood_pressure': blood_pressure,
        'bmi': bmi,
        'cholesterol': cholesterol,
        'heart_rate': heart_rate,
        'target': target
    })
    
    if output_path:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        df.to_csv(output_path, index=False)
        print(f"Generated {num_samples} samples and saved to {output_path}")
        
    return df

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate synthetic dataset")
    parser.add_argument("--output", type=str, default="data/dataset.csv", help="Path to save the generated dataset")
    parser.add_argument("--samples", type=int, default=1000, help="Number of samples to generate")
    args = parser.parse_args()
    
    generate_synthetic_data(num_samples=args.samples, output_path=args.output)
