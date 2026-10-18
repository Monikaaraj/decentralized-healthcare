from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import IsolationForest

def create_pipeline() -> Pipeline:
    """
    Creates a scikit-learn pipeline for preprocessing and the Logistic Regression model.
    """
    pipeline = Pipeline([
        ('imputer', SimpleImputer(strategy='mean')),
        ('scaler', StandardScaler()),
        ('classifier', LogisticRegression(random_state=42))
    ])
    
    return pipeline

def create_anomaly_pipeline(contamination: float = 0.05) -> Pipeline:
    """
    Creates a scikit-learn pipeline for unsupervised anomaly detection.
    """
    pipeline = Pipeline([
        ('imputer', SimpleImputer(strategy='mean')),
        ('scaler', StandardScaler()),
        ('detector', IsolationForest(random_state=42, contamination=contamination))
    ])
    
    return pipeline
