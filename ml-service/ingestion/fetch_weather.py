import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import requests
import json
import pandas as pd
from pathlib import Path
from datetime import datetime, timedelta

def fetch_weather():
    end_date = (datetime.now() - timedelta(days=5)).strftime("%Y-%m-%d")
    start_date = "2013-01-01"
    print(f"Fetching from {start_date} to {end_date}...")
    
    url = "https://archive-api.open-meteo.com/v1/archive"
    params = {
        "latitude": 17.385,
        "longitude": 78.4867,
        "start_date": start_date,
        "end_date": end_date,
        "daily": "temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,relative_humidity_2m_max,relative_humidity_2m_min,relative_humidity_2m_mean",
        "timezone": "auto"
    }
    
    resp = requests.get(url, params=params)
    if resp.status_code != 200:
        print(resp.text)
        return
        
    data = resp.json()
    df = pd.DataFrame(data["daily"])
    df["date"] = pd.to_datetime(df["time"])
    df = df.drop(columns=["time"])
    
    RAW_DIR = Path(__file__).parent.parent / "data" / "weather"
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    out_path = RAW_DIR / "hyderabad_weather.csv"
    df.to_csv(out_path, index=False)
    print(f"Saved {len(df)} records to {out_path}")

if __name__ == "__main__":
    fetch_weather()
