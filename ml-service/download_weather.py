"""Download weather for Mumbai (Maharashtra) and Kochi (Kerala)"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import requests, pandas as pd
from pathlib import Path

OUT_DIR = Path(r'c:\Users\DELL\OneDrive\Desktop\antarya\ml-service\data\weather')
OUT_DIR.mkdir(exist_ok=True)

cities = {
    'mumbai': {'lat': 19.076, 'lon': 72.8777, 'file': 'mumbai_weather.csv'},
    'kochi': {'lat': 9.9312, 'lon': 76.2673, 'file': 'kochi_weather.csv'},
}

for city, info in cities.items():
    print(f'Downloading {city} weather (2012-2014)...')
    lat = info['lat']
    lon = info['lon']
    url = (
        f'https://archive-api.open-meteo.com/v1/archive?'
        f'latitude={lat}&longitude={lon}'
        f'&start_date=2012-01-01&end_date=2014-12-31'
        f'&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,'
        f'precipitation_sum,relative_humidity_2m_max,relative_humidity_2m_min,relative_humidity_2m_mean'
        f'&timezone=Asia%2FKolkata'
    )
    resp = requests.get(url, timeout=60)
    data = resp.json()
    if 'daily' in data:
        df = pd.DataFrame(data['daily'])
        df.rename(columns={'time': 'date'}, inplace=True)
        df.to_csv(OUT_DIR / info['file'], index=False)
        print(f'  Saved {len(df)} rows to {info["file"]}')
    else:
        print(f'  ERROR: {data.get("reason", str(data)[:200])}')

print('Done!')
