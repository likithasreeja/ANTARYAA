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
DEMAND_MODEL_PATH = MODEL_DIR / "demand_model.pkl"
FEATURE_COLUMNS_PATH = MODEL_DIR / "feature_columns.pkl"
MODEL_METRICS_PATH = MODEL_DIR / "model_metrics.json"

# Which Favorita store to train on (Store 44 has great data coverage)
FAVORITA_STORE_NBR = 44

# Favorita product families that map to kirana products
KIRANA_FAMILIES = [
    "DAIRY",
    "BREAD/BAKERY", 
    "EGGS",
    "GROCERY I",
    "GROCERY II",
    "BEVERAGES",
    "CLEANING",
    "PERSONAL CARE",
    "PRODUCE",
    "MEATS",
    "FROZEN FOODS",
    "DELI",
]

# Prediction settings
FORECAST_HORIZONS = [1, 3, 7]  # Predict 1 day, 3 days, 7 days ahead
DEFAULT_LEAD_TIME_DAYS = 2     # How long it takes supplier to deliver
DEFAULT_SAFETY_STOCK = 5       # Minimum buffer stock

# Express backend URL (for fetching live inventory data)
EXPRESS_API_URL = os.getenv("EXPRESS_API_URL", "http://localhost:5001")
