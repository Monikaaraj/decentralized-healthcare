import flwr as fl
from typing import Dict, Optional, Tuple, List
from flwr.common import Metrics
import json

def weighted_average(metrics: List[Tuple[int, Metrics]]) -> Metrics:
    """Aggregates metrics via sample count."""
    accuracies = [num_examples * m["accuracy"] for num_examples, m in metrics]
    examples = [num_examples for num_examples, _ in metrics]
    return {"accuracy": sum(accuracies) / sum(examples)}

class FedAvgStrategy(fl.server.strategy.FedAvg):
    def __init__(self, num_rounds: int, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.num_rounds = num_rounds
        self.global_parameters_history = []
        
    def aggregate_fit(self, server_round, results, failures):
        aggregated_parameters, aggregated_metrics = super().aggregate_fit(server_round, results, failures)
        
        if aggregated_parameters is not None:
            self.global_parameters_history.append(aggregated_parameters)
            status = {
                "status": "completed" if server_round == self.num_rounds else "in_progress",
                "round": server_round,
                "total_rounds": self.num_rounds,
                "hospitals": len(results)
            }
            print(f"\n--- Federated Round {server_round} Complete ---")
            print(json.dumps(status, indent=2))
            
        return aggregated_parameters, aggregated_metrics
        
def start_server(num_rounds: int = 3) -> FedAvgStrategy:
    strategy = FedAvgStrategy(
        num_rounds=num_rounds,
        fraction_fit=1.0,
        fraction_evaluate=1.0,
        min_fit_clients=3,
        min_evaluate_clients=3,
        min_available_clients=3,
        evaluate_metrics_aggregation_fn=weighted_average,
        fit_metrics_aggregation_fn=weighted_average,
    )
    return strategy
