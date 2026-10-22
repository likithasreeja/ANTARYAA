"""
ANTARYA ML Service — Configuration
===================================
Think of this as the "settings file" for the entire ML brain.
It tells every other file: where are the models stored? What store are we predicting for?
"""
import os
from pathlib import Path

# Base directory of the ml-service
BASE_DIR = Path(__file__).parent

# Where trained models get saved (like saving a recipe after perfecting it)
MODEL_DIR = BASE_DIR / "saved_models"
MODEL_DIR.mkdir(exist_ok=True)

# Where the raw Favorita dataset CSVs live
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

# Model file paths
DEMAND_MODEL_PATH = MODEL_DIR / "indian_v7_hurdle_model.pkl"
MODEL_METRICS_PATH = MODEL_DIR / "indian_v7_metrics.json"
FEATURE_COLUMNS_PATH = MODEL_DIR / "feature_columns.json"

# Which Favorita store to train on (Legacy - replaced by Indian Kirana Dataset)
FAVORITA_STORE_NBR = 44

# Kirana product families (Updated from Favorita)
KIRANA_FAMILIES = [
    "DAIRY",
    "SNACKS",
    "BEVERAGES",
    "PERSONAL_CARE",
    "HOME_CARE",
    "GROCERY",
    "SPICES",
    "PACKAGED_FOOD",
    "TOBACCO",
    "STATIONERY",
]

# Prediction settings
FORECAST_HORIZONS = [1, 3, 7]  # Predict 1 day, 3 days, 7 days ahead
DEFAULT_LEAD_TIME_DAYS = 2     # How long it takes supplier to deliver
DEFAULT_SAFETY_STOCK = 5       # Minimum buffer stock

# Express backend URL (for fetching live inventory data)
EXPRESS_API_URL = os.getenv("EXPRESS_API_URL", "http://localhost:5001")
