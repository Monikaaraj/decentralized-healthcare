import os
import joblib
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from api.schemas import HealthFeatures, RiskResponse, AnomalyResponse, StatusResponse
from src.predict import predict_risk, detect_anomaly

app = FastAPI(
    title="Decentralized Healthcare AI Inference Service",
    description="Inference layer for federated and anomaly models. Does NOT perform training or store patient data.",
    version="1.0.0"
)

# CORS configuration for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/ai/health", response_model=StatusResponse)
def health_check():
    risk_exists = os.path.exists("models/risk_model.joblib")
    anomaly_exists = os.path.exists("models/anomaly_model.joblib")
    fed_exists = os.path.exists("models/federated_risk_model.joblib")
    
    return StatusResponse(
        status="healthy",
        service="ai",
        risk_model="available" if risk_exists else "unavailable",
        anomaly_model="available" if anomaly_exists else "unavailable",
        federated_model="available" if fed_exists else "unavailable"
    )

@app.post("/ai/predict/risk", response_model=RiskResponse)
def predict_risk_endpoint(features: HealthFeatures):
    if not os.path.exists("models/federated_risk_model.joblib"):
        raise HTTPException(status_code=503, detail="Federated risk model unavailable")
        
    try:
        # Pydantic model_dump ensures clean, validated data. No raw records are saved.
        result = predict_risk(features.model_dump(), model_type="federated")
        return RiskResponse(**result)
    except Exception as e:
        # Prevent leaking internal stack traces or filesystem paths
        raise HTTPException(status_code=500, detail="Internal model prediction error")

@app.post("/ai/detect/anomaly", response_model=AnomalyResponse)
def detect_anomaly_endpoint(features: HealthFeatures):
    if not os.path.exists("models/anomaly_model.joblib"):
        raise HTTPException(status_code=503, detail="Anomaly model unavailable")
        
    try:
        result = detect_anomaly(features.model_dump())
        return AnomalyResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal anomaly detection error")

@app.get("/ai/fl/status")
def federated_learning_status():
    """
    Returns the latest known federated training status by inspecting the global artifact.
    This does NOT trigger training.
    """
    fed_path = "models/federated_risk_model.joblib"
    if not os.path.exists(fed_path):
        return {"status": "not_run"}
        
    try:
        model_artifact = joblib.load(fed_path)
        return {
            "status": "completed",
            "round": model_artifact.get('number_of_rounds', 0),
            "total_rounds": model_artifact.get('number_of_rounds', 0),
            "hospitals": model_artifact.get('participating_hospitals', 0),
            "model_version": model_artifact.get('model_version', 'unknown')
        }
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to read FL status")
