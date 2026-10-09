import flwr as fl
import json
import os
from typing import List, Tuple, Optional, Dict

class MetricsTrackingStrategy(fl.server.strategy.FedAvg):
    def aggregate_evaluate(self, server_round, results, failures):
        aggregated_loss, aggregated_metrics = super().aggregate_evaluate(server_round, results, failures)
        
        # Read current status
        status = {"status": "training", "rounds": []}
        if os.path.exists("fl_status.json"):
            try:
                with open("fl_status.json", "r") as f:
                    status = json.load(f)
            except:
                pass
        
        # Calculate custom aggregated accuracy from clients
        accuracies = [r.metrics["accuracy"] * r.num_examples for _, r in results]
        examples = [r.num_examples for _, r in results]
        accuracy = sum(accuracies) / sum(examples) if sum(examples) > 0 else 0
        
        status["rounds"].append({
            "round": server_round,
            "loss": float(aggregated_loss) if aggregated_loss else 0.0,
            "accuracy": float(accuracy)
        })
        
        if server_round >= 3:
            status["status"] = "completed"
            
        with open("fl_status.json", "w") as f:
            json.dump(status, f)
                
        return aggregated_loss, {"accuracy": accuracy}

if __name__ == "__main__":
    print("Starting Federated Learning Aggregator Server...")
    
    # Initialize status file
    with open("fl_status.json", "w") as f:
        json.dump({"status": "training", "rounds": []}, f)
        
    strategy = MetricsTrackingStrategy(
        fraction_fit=1.0,
        fraction_evaluate=1.0,
        min_fit_clients=3,
        min_evaluate_clients=3,
        min_available_clients=3,
    )
    
    fl.server.start_server(
        server_address="0.0.0.0:8080",
        config=fl.server.ServerConfig(num_rounds=3),
        strategy=strategy,
    )
