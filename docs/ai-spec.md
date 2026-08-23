# AI Specification

## 1. Disease Risk Prediction
- **Goal**: Predict the likelihood of a specific disease (e.g., heart disease) based on tabular health metrics.
- **Algorithm**: Logistic Regression. This provides a simple, interpretable baseline model suitable for federated prototyping.

## 2. Anomaly Detection
- **Goal**: Identify abnormal physiological readings in patient data streams.
- **Algorithm**: Isolation Forest. A robust algorithm for identifying outliers in feature space.

## 3. Synthetic Dataset
All training and testing will utilize synthetically generated tabular data simulating typical EHR (Electronic Health Record) metrics.

## 4. Feature Definitions
Core features for the synthetic dataset include:
- `age` (integer)
- `bloodPressure` (float)
- `cholesterol` (float)
- `bmi` (float)
- `heartRate` (integer)
- `spo2` (float)

## 5. Training/Test Split
Each local hospital will maintain a local 80/20 train/test split. The aggregator will also evaluate the global model against a held-out central validation set (also synthetic) to track global convergence.

## 6. Model Selection
- Logistic Regression for risk prediction.
- Isolation Forest for anomaly detection.

## 7. Evaluation Metrics
- **Risk Prediction**: Accuracy, Precision, Recall, F1-Score, and ROC-AUC.
- **Anomaly Detection**: Precision and Recall on injected synthetic anomalies.

## 8. Model Versioning
Global models will be versioned by round (e.g., `v1-round10`). The final trained global model is exported for inference.

## 9. Federated Learning
The core training mechanism utilizes Federated Learning to ensure data privacy, ensuring no centralized aggregation of raw data.

## 10. Hospital A
A simulated local FL client holding a unique, isolated dataset of synthetic patient records.

## 11. Hospital B
A second simulated local FL client holding a distinct, isolated dataset of synthetic patient records.

## 12. Hospital C
A third simulated local FL client holding its own distinct, isolated dataset of synthetic patient records.

## 13. Local Training
Each hospital client (A, B, C) trains a local instance of the model using strictly its private local data.

## 14. FedAvg Aggregation
The Flower aggregator coordinates training rounds. It receives updated model parameters from the hospitals, applies the Federated Averaging (FedAvg) algorithm, and sends the updated parameters back.

## 15. Global Model
The resulting unified model that learns collaboratively. It benefits from diverse data distributions without the data ever being centralized.

## 16. FastAPI Inference
A separate inference service that:
- Loads the final Global Model.
- Operates independently from the Flower Aggregator.
- Does NOT receive or store hospital training datasets.
- Is queried directly by the frontend.

## 17. AI API Input/Output
- **Input**: JSON payload containing patient features (e.g., age, bmi, heartRate).
- **Output**: JSON payload containing prediction scores, risk categories, and anomaly flags.

## 18. Privacy Guarantees
- Raw hospital data remains local and is NEVER sent to the central aggregator or FastAPI server.
- Only model updates (weights/gradients) are exchanged over the network.
- No real patient data is used.
- Predictions do not require persistent storage of inference data.

## 19. AI Limitations
- This is a research/demo prototype.
- It is not a clinical diagnostic system.
- Model performance is evaluated purely on synthetic/de-identified data.
- It should not be used for actual medical advice or decisions.
