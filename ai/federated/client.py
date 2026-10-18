import flwr as fl
import numpy as np
import warnings
from sklearn.metrics import accuracy_score
from federated.hospital import HospitalDataset
from federated.local_training import train_local_model, get_model_parameters, set_model_parameters

class HospitalClient(fl.client.NumPyClient):
    """
    Flower client representing a hospital.
    Strictly loads local data and never exposes it to the network.
    """
    def __init__(self, hospital_id: str):
        self.hospital_id = hospital_id
        self.dataset = HospitalDataset(hospital_id)
        self.pipeline = None
        self.X = None
        self.y = None

    def _setup_data(self):
        if self.X is None:
            df = self.dataset.get_training_data()
            if 'PATIENT' in df.columns:
                df = df.drop(columns=['PATIENT'])
            self.X = df.drop(columns=['target'])
            self.y = df['target']

    def set_global_preprocessing(self, means: np.ndarray, scales: np.ndarray):
        """
        Initializes the client pipeline with globally computed standard scaler 
        and imputer statistics to ensure all hospitals share a coordinate space.
        Uses a mathematical trick to generate dummy data matching the stats precisely,
        allowing sklearn to fit its internal variables naturally without raw data.
        """
        from src.preprocessing import create_pipeline
        self.pipeline = create_pipeline()
        
        # Two rows are enough to define a mean and variance (std).
        # x1 = mean - scale
        # x2 = mean + scale
        dummy_X = np.vstack([means - scales, means + scales])
        dummy_y = np.array([0, 1])
        
        # Fit the pipeline on this synthetic mathematical construct
        # This gives the scaler and imputer exactly the global stats!
        import pandas as pd
        feature_names = ['age', 'glucose', 'blood_pressure', 'bmi', 'cholesterol', 'heart_rate']
        dummy_df = pd.DataFrame(dummy_X, columns=feature_names)
        
        self.pipeline.fit(dummy_df, dummy_y)
        
        # Reset classifier weights to zero
        classifier = self.pipeline.named_steps['classifier']
        classifier.classes_ = np.array([0, 1])
        classifier.coef_ = np.zeros((1, len(means)))
        classifier.intercept_ = np.zeros(1)

    def get_parameters(self, config):
        if self.pipeline is None:
            self.pipeline, _ = train_local_model(self.dataset)
            
        params = get_model_parameters(self.pipeline)
        return [params['coef'], params['intercept'], params['classes']]

    def fit(self, parameters, config):
        self._setup_data()
        
        if self.pipeline is None:
            self.pipeline, _ = train_local_model(self.dataset)
            
        # Set global parameters
        if parameters:
            params_dict = {
                'coef': parameters[0],
                'intercept': parameters[1],
                'classes': parameters[2]
            }
            set_model_parameters(self.pipeline, params_dict)
            
        classifier = self.pipeline.named_steps['classifier']
        classifier.warm_start = True
        classifier.max_iter = config.get("local_epochs", 1)
        
        # Manually transform data using the LOCAL preprocessors to avoid refitting the pipeline entirely
        X_transformed = self.pipeline.named_steps['imputer'].transform(self.X)
        X_transformed = self.pipeline.named_steps['scaler'].transform(X_transformed)
        
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            classifier.fit(X_transformed, self.y)
        
        updated_params = get_model_parameters(self.pipeline)
        param_list = [updated_params['coef'], updated_params['intercept'], updated_params['classes']]
        
        preds = self.pipeline.predict(self.X)
        acc = accuracy_score(self.y, preds)
        
        metrics = {"accuracy": float(acc), "hospital_id": self.hospital_id}
        
        return param_list, len(self.X), metrics

    def evaluate(self, parameters, config):
        self._setup_data()
        
        if parameters:
            params_dict = {
                'coef': parameters[0],
                'intercept': parameters[1],
                'classes': parameters[2]
            }
            if self.pipeline is None:
                self.pipeline, _ = train_local_model(self.dataset)
            set_model_parameters(self.pipeline, params_dict)
            
        preds = self.pipeline.predict(self.X)
        acc = accuracy_score(self.y, preds)
        
        return 0.0, len(self.X), {"accuracy": float(acc)}
