"""
AEGIS-AI Privacy-Preserving Machine Learning (PPML) Pipeline
Module 4: Decentralized Node Communication API (node_api.py)

Endpoints:
- GET  /health              : Node orchestration status & active round check.
- GET  /get_global_weights  : Distributes current global parameters to participating silos.
- POST /submit_local_update : Receives serialized local model weights from hospital silos.
- POST /trigger_aggregation : Executes FedAvg aggregation once required quorum is met.
- GET  /metrics             : Returns multi-round training metrics and convergence history.
"""

import io
import base64
import logging
from typing import Dict, List, Optional, Any
import numpy as np
import torch
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from fl_server import FederatedServer

logger = logging.getLogger("AEGIS.NodeAPI")

app = FastAPI(
    title="AEGIS-AI Federated Learning Node Communication API",
    description="Privacy-Preserving endpoint facilitating secure model weight exchange across hospital silos.",
    version="2.0.0"
)

# Enable CORS for local dashboards and inter-node orchestration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global in-memory server state
GLOBAL_SERVER: Optional[FederatedServer] = None
PENDING_UPDATES: Dict[str, Dict[str, Any]] = {}
QUORUM_SIZE: int = 3


# ----------------- Pydantic Schemas ----------------- #

class WeightPayload(BaseModel):
    """Base64 serialized numpy weight dictionary."""
    weights: Dict[str, str] = Field(..., description="Parameter names mapped to base64 encoded float32 byte buffers.")
    current_round: int


class LocalUpdateSubmission(BaseModel):
    node_id: str = Field(..., description="Unique Hospital Silo identifier (e.g. Node_A).")
    num_samples: int = Field(..., gt=0, description="Local sample size n_k used in local training epoch.")
    local_loss: float = Field(..., description="Local training epoch loss.")
    weights: Dict[str, str] = Field(..., description="Base64 encoded local parameter weights.")


class HealthResponse(BaseModel):
    status: str
    active_round: int
    pending_nodes_count: int
    quorum_required: int
    participating_nodes: List[str]


# ----------------- Serialization Utilities ----------------- #

def serialize_weights_to_b64(weights_dict: Dict[str, np.ndarray]) -> Dict[str, str]:
    """Encodes NumPy parameter tensors into base64 strings."""
    encoded = {}
    for key, arr in weights_dict.items():
        buf = io.BytesIO()
        np.save(buf, arr, allow_pickle=False)
        encoded[key] = base64.b64encode(buf.getvalue()).decode("utf-8")
    return encoded


def deserialize_b64_to_weights(encoded_dict: Dict[str, str]) -> Dict[str, np.ndarray]:
    """Decodes base64 strings back into NumPy parameter arrays."""
    decoded = {}
    for key, b64_str in encoded_dict.items():
        raw_bytes = base64.b64decode(b64_str.encode("utf-8"))
        buf = io.BytesIO(raw_bytes)
        decoded[key] = np.load(buf, allow_pickle=False)
    return decoded


def initialize_server_instance(tabular_dim: int = 19, num_classes: int = 8) -> FederatedServer:
    global GLOBAL_SERVER
    if GLOBAL_SERVER is None:
        GLOBAL_SERVER = FederatedServer(tabular_input_dim=tabular_dim, num_classes=num_classes)
        logger.info(f"Initialized Global Federated Server with input_dim={tabular_dim}, classes={num_classes}")
    return GLOBAL_SERVER


# ----------------- API Endpoints ----------------- #

@app.on_event("startup")
def startup_event():
    initialize_server_instance()


@app.get("/health", response_model=HealthResponse)
def health_check():
    """Returns node health, active federated round, and current buffer status."""
    server = initialize_server_instance()
    return HealthResponse(
        status="active",
        active_round=server.current_round,
        pending_nodes_count=len(PENDING_UPDATES),
        quorum_required=QUORUM_SIZE,
        participating_nodes=list(PENDING_UPDATES.keys())
    )


@app.get("/get_global_weights", response_model=WeightPayload)
def get_global_weights():
    """
    Hospital nodes poll this endpoint to download the latest global model weights
    prior to starting their local epoch.
    """
    server = initialize_server_instance()
    weights_np = server.get_global_weights()
    b64_weights = serialize_weights_to_b64(weights_np)
    
    return WeightPayload(
        weights=b64_weights,
        current_round=server.current_round
    )


@app.post("/submit_local_update", status_code=status.HTTP_202_ACCEPTED)
def submit_local_update(payload: LocalUpdateSubmission):
    """
    Receives serialized local model weights from an authorized hospital node.
    No patient EHR or image tensors are accepted or stored.
    """
    server = initialize_server_instance()
    logger.info(f"Received local model update from [{payload.node_id}] with {payload.num_samples} samples.")

    try:
        decoded_weights = deserialize_b64_to_weights(payload.weights)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to deserialize base64 weight payload: {str(e)}"
        )

    # Store in node update buffer
    PENDING_UPDATES[payload.node_id] = {
        "node_id": payload.node_id,
        "num_samples": payload.num_samples,
        "local_loss": payload.local_loss,
        "weights": decoded_weights
    }

    return {
        "message": f"Update from {payload.node_id} accepted successfully.",
        "pending_nodes": len(PENDING_UPDATES),
        "quorum_ready": len(PENDING_UPDATES) >= QUORUM_SIZE
    }


@app.post("/trigger_aggregation")
def trigger_aggregation():
    """
    Executes FedAvg aggregation when all registered silos (Node A, B, C) have submitted updates.
    """
    global PENDING_UPDATES
    server = initialize_server_instance()

    if len(PENDING_UPDATES) == 0:
        raise HTTPException(status_code=400, detail="No pending updates to aggregate.")

    updates_list = list(PENDING_UPDATES.values())
    
    # Execute FedAvg
    server.aggregate_weights(updates_list)
    
    # Flush pending updates for next round
    participated_nodes = list(PENDING_UPDATES.keys())
    PENDING_UPDATES = {}

    return {
        "status": "success",
        "completed_round": server.current_round,
        "participating_nodes": participated_nodes,
        "message": f"Global model updated to round {server.current_round} via FedAvg."
    }


@app.get("/metrics")
def get_metrics():
    """Returns training convergence history across all communication rounds."""
    server = initialize_server_instance()
    return {
        "current_round": server.current_round,
        "history": server.history
    }
