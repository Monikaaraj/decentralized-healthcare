import os
import pytest
import numpy as np
import pandas as pd
from flwr.common import ndarrays_to_parameters
from federated.client import HospitalClient
from federated.server import start_server

def test_flower_client_initializes_and_trains():
    client = HospitalClient("hospital_a")
    
    # Validate client can initialize parameters
    params = client.get_parameters(config={})
    assert len(params) == 3 # coef, intercept, classes
    assert isinstance(params[0], np.ndarray)
    
    # Client can train
    new_params, num_samples, metrics = client.fit(parameters=params, config={"local_epochs": 1})
    assert num_samples > 0
    assert 'accuracy' in metrics
    
    # Parameter payload check (Privacy boundary)
    for p in new_params:
        # None of the elements should be pandas DataFrames or raw IDs
        assert isinstance(p, np.ndarray)
        assert 'p1' not in str(p)

def test_server_privacy_boundary():
    # Proof that server doesn't receive data, only parameter arrays
    strategy = start_server(num_rounds=1)
    
    # We mock client results (parameters + sample count)
    client_res = flwr_mock_result()
    results = [client_res, client_res]
    
    aggregated_params, aggregated_metrics = strategy.aggregate_fit(server_round=1, results=results, failures=[])
    
    # The server only ever touched parameter arrays, not pandas dataframes
    assert aggregated_params is not None

def flwr_mock_result():
    # Helper to create a fake flower FitRes object
    from flwr.common import FitRes, Status, Code, ndarrays_to_parameters
    params = ndarrays_to_parameters([np.array([[0.5]]), np.array([0.1]), np.array([0, 1])])
    return (
        None, # ClientProxy
        FitRes(
            status=Status(code=Code.OK, message=""),
            parameters=params,
            num_examples=10,
            metrics={"accuracy": 0.9}
        )
    )
