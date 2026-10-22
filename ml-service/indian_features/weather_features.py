"""
ANTARYA v6 — State-Aware Weather Features
==========================================
Joins weather data ONLY from the matching state's city.
- Maharashtra → Mumbai weather
- Telangana  → Hyderabad weather
- Kerala     → Kochi weather
"""

import pandas as pd
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
WEATHER_DIR = BASE_DIR / "data" / "weather"

STATE_WEATHER_FILES = {
    "Maharashtra": "mumbai_weather.csv",
    "Telangana": "hyderabad_weather.csv",
    "Kerala": "kochi_weather.csv",
}


def load_weather(state):
    """Load weather CSV for a given state. Returns empty DF if not found."""
    fname = STATE_WEATHER_FILES.get(state)
    if not fname:
        return pd.DataFrame()
    path = WEATHER_DIR / fname
    if not path.exists():
        return pd.DataFrame()
    df = pd.read_csv(path)
    df["date"] = pd.to_datetime(df["date"])
    return df


def add_weather_features_v6(df, state_col="state"):
    """
    Merge weather features by state + date.
    Each state gets weather from its OWN city only.
    
    Features:
      - temperature_2m_max, temperature_2m_min, temperature_2m_mean
      - precipitation_sum
      - is_raining (precip > 2.5mm)
      - is_heat_wave (max temp > 40°C)
      - rain_last_3d (rolling 3-day precip sum)
      - humidity_mean
    """
    df = df.copy()
    if "date" not in df.columns:
        return df
    
    weather_cols = [
        "temperature_2m_max", "temperature_2m_min", "temperature_2m_mean",
        "precipitation_sum", "is_raining", "is_heat_wave", "rain_last_3d", "humidity_mean"
    ]
    
    # Initialize all weather columns
    for col in weather_cols:
        df[col] = 0.0
    
    if state_col not in df.columns:
        return df
    
    for state in df[state_col].unique():
        weather = load_weather(state)
        if weather.empty:
            continue
        
        # Engineer weather signals
        weather["is_raining"] = (weather["precipitation_sum"] > 2.5).astype(int)
        weather["is_heat_wave"] = (weather["temperature_2m_max"] > 40.0).astype(int)
        weather["rain_last_3d"] = weather["precipitation_sum"].rolling(3, min_periods=1).sum()
        
        if "relative_humidity_2m_mean" in weather.columns:
            weather["humidity_mean"] = weather["relative_humidity_2m_mean"]
        else:
            weather["humidity_mean"] = 0
        
        weather_subset = weather[["date"] + weather_cols].copy()
        
        # Merge only for this state's rows
        state_mask = df[state_col] == state
        state_dates = df.loc[state_mask, "date"]
        
        merged = state_dates.to_frame().merge(weather_subset, on="date", how="left")
        
        for col in weather_cols:
            if col in merged.columns:
                df.loc[state_mask, col] = merged[col].values
    
    # Fill remaining NAs
    for col in weather_cols:
        df[col] = df[col].fillna(0)
    
    return df
