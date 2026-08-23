from pydantic import BaseModel, Field

class HealthFeatures(BaseModel):
    age: float = Field(..., description="Age in years", ge=0, le=120)
    glucose: float = Field(..., description="Fasting glucose mg/dL", ge=10, le=500)
    blood_pressure: float = Field(..., description="Systolic blood pressure mmHg", ge=50, le=250)
    bmi: float = Field(..., description="Body Mass Index", ge=10, le=80)
    cholesterol: float = Field(..., description="Total cholesterol mg/dL", ge=50, le=500)
    heart_rate: float = Field(..., description="Resting heart rate bpm", ge=30, le=200)

class RiskResponse(BaseModel):
    risk_score: float
    risk_category: str
    model_version: str

class AnomalyResponse(BaseModel):
    is_anomaly: bool
    anomaly_score: float
    model_version: str

class StatusResponse(BaseModel):
    status: str
    service: str = "ai"
    risk_model: str
    anomaly_model: str
    federated_model: str
