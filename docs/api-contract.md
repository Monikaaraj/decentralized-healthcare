# API Contract

This document defines the API contracts between Member 1 (Backend/Blockchain) and Member 2 (AI/Frontend).

## Member 1 APIs (Backend)

### GET /api/records/:patientId
- **Purpose**: Retrieve IPFS hashes and metadata for a patient's encrypted medical records.
- **Auth Expectation**: Bearer token or signed wallet message proving consent/identity.
- **Request JSON**: N/A (Path parameter)
- **Response JSON**:
  ```json
  {
    "patientId": "0x123...",
    "records": [
      {
        "ipfsHash": "QmX...",
        "timestamp": "2026-08-23T10:00:00Z",
        "dataType": "synthetic_vitals"
      }
    ]
  }
  ```
- **HTTP Status Codes**: 200 OK, 401 Unauthorized, 404 Not Found.
- **Error Format**: `{"error": "Unauthorized access"}`

### GET /api/consent/:patientId
- **Purpose**: Check if a specific researcher or doctor has been granted consent by the patient.
- **Auth Expectation**: Bearer token or signed wallet message.
- **Request JSON**: N/A (Query parameter `?requester=0xABC...`)
- **Response JSON**:
  ```json
  {
    "patientId": "0x123...",
    "requester": "0xABC...",
    "hasConsent": true,
    "grantedAt": "2026-08-20T10:00:00Z"
  }
  ```
- **HTTP Status Codes**: 200 OK, 400 Bad Request.
- **Error Format**: `{"error": "Invalid requester address"}`

### POST /api/marketplace/request-access
- **Purpose**: Researcher requests access to specific de-identified datasets, proposing a token reward.
- **Auth Expectation**: Bearer token of the researcher.
- **Request JSON**:
  ```json
  {
    "researcherId": "0xABC...",
    "datasetType": "cardiology_synthetic",
    "offeredTokens": 50
  }
  ```
- **Response JSON**:
  ```json
  {
    "requestId": "req_999",
    "status": "pending_patient_approval"
  }
  ```
- **HTTP Status Codes**: 201 Created, 400 Bad Request.
- **Error Format**: `{"error": "Insufficient token balance"}`

### GET /api/marketplace/tokens
- **Purpose**: Get the token balance for the authenticated user.
- **Auth Expectation**: Bearer token.
- **Request JSON**: N/A
- **Response JSON**:
  ```json
  {
    "userId": "0xABC...",
    "balance": 1500
  }
  ```
- **HTTP Status Codes**: 200 OK, 401 Unauthorized.
- **Error Format**: `{"error": "User not found"}`

---

## Member 2 APIs (AI Inference)

### GET /ai/health
- **Purpose**: Check the health and readiness of the AI inference service.
- **Auth Expectation**: None (Public endpoint).
- **Request JSON**: N/A
- **Response JSON**:
  ```json
  {
    "status": "online",
    "modelVersion": "1.0.0",
    "uptime": "24h"
  }
  ```
- **HTTP Status Codes**: 200 OK
- **Error Format**: N/A

### POST /ai/predict/risk
- **Purpose**: Provide a disease risk prediction score based on patient data metrics.
- **Auth Expectation**: Bearer token or frontend API key.
- **Request JSON**:
  ```json
  {
    "age": 45,
    "bloodPressure": 120,
    "cholesterol": 190,
    "bmi": 24.5
  }
  ```
- **Response JSON**:
  ```json
  {
    "riskScore": 0.15,
    "riskCategory": "Low",
    "confidence": 0.88
  }
  ```
- **HTTP Status Codes**: 200 OK, 400 Bad Request, 422 Unprocessable Entity.
- **Error Format**: `{"error": "Missing required feature 'bmi'"}`

### POST /ai/detect/anomaly
- **Purpose**: Detect anomalous health metrics in a batch of synthetic patient data.
- **Auth Expectation**: Bearer token or frontend API key.
- **Request JSON**:
  ```json
  {
    "metrics": [
      {"heartRate": 72, "spo2": 98},
      {"heartRate": 140, "spo2": 85}
    ]
  }
  ```
- **Response JSON**:
  ```json
  {
    "anomalies": [
      {"index": 1, "isAnomaly": true, "reason": "Low SpO2 and high Heart Rate"}
    ]
  }
  ```
- **HTTP Status Codes**: 200 OK, 400 Bad Request.
- **Error Format**: `{"error": "Invalid metric format"}`

### GET /ai/fl/status
- **Purpose**: Get the current status of the federated learning training process (research/demo visibility).
- **Auth Expectation**: None or Admin token.
- **Request JSON**: N/A
- **Response JSON**:
  ```json
  {
    "isTraining": false,
    "lastRoundCompleted": 10,
    "activeHospitals": 3,
    "globalAccuracy": 0.85
  }
  ```
- **HTTP Status Codes**: 200 OK.
- **Error Format**: N/A

---

## Blockchain Integration Contract

Member 1 must provide the following details to Member 2 for seamless frontend integration:
- **Contract Addresses**: Explicit addresses for Consent, Identity, and Token contracts.
- **Chain ID**: The numeric Chain ID of the Polygon network being used (e.g., 80001 for Mumbai, 137 for Mainnet).
- **ABI Files**: Compiled JSON files representing the smart contract interfaces.
- **Deployed Network**: Network name (e.g., Polygon Amoy Testnet).
- **Contract Version**: Version string or Git commit hash matching the deployed contracts.
