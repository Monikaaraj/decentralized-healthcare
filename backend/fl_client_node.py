import flwr as fl
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
import sys

# Define a simple PyTorch model for diagnostic risk prediction
class SimpleDiagnosticModel(nn.Module):
    def __init__(self):
        super(SimpleDiagnosticModel, self).__init__()
        self.fc = nn.Linear(10, 2) # 10 features, 2 output classes

    def forward(self, x):
        return self.fc(x)

# Create a dummy dataset mimicking normalized medical parameters
def load_data():
    X = torch.randn(100, 10)
    y = torch.randint(0, 2, (100,))
    dataset = TensorDataset(X, y)
    return DataLoader(dataset, batch_size=32, shuffle=True)

class FlowerClient(fl.client.NumPyClient):
    def __init__(self, model, trainloader):
        self.model = model
        self.trainloader = trainloader
        self.criterion = nn.CrossEntropyLoss()
        self.optimizer = optim.SGD(self.model.parameters(), lr=0.01)

    def get_parameters(self, config):
        return [val.cpu().numpy() for _, val in self.model.state_dict().items()]

    def set_parameters(self, parameters):
        params_dict = zip(self.model.state_dict().keys(), parameters)
        state_dict = {k: torch.tensor(v) for k, v in params_dict}
        self.model.load_state_dict(state_dict, strict=True)

    def fit(self, parameters, config):
        self.set_parameters(parameters)
        self.model.train()
        for epoch in range(1):
            for X, y in self.trainloader:
                self.optimizer.zero_grad()
                outputs = self.model(X)
                loss = self.criterion(outputs, y)
                loss.backward()
                self.optimizer.step()
        return self.get_parameters(config={}), len(self.trainloader.dataset), {}

    def evaluate(self, parameters, config):
        self.set_parameters(parameters)
        self.model.eval()
        loss = 0.0
        correct = 0
        with torch.no_grad():
            for X, y in self.trainloader:
                outputs = self.model(X)
                loss += self.criterion(outputs, y).item()
                _, predicted = torch.max(outputs.data, 1)
                correct += (predicted == y).sum().item()
        accuracy = correct / len(self.trainloader.dataset)
        return float(loss), len(self.trainloader.dataset), {"accuracy": float(accuracy)}

if __name__ == "__main__":
    node_id = sys.argv[1] if len(sys.argv) > 1 else "Unknown"
    print(f"Starting FL Client Node: {node_id}")
    model = SimpleDiagnosticModel()
    trainloader = load_data()
    fl.client.start_client(server_address="127.0.0.1:8080", client=FlowerClient(model, trainloader).to_client())
