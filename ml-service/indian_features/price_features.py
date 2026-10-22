"""
ANTARYA Feature Pipeline — Commodity Price Signals
===================================================
Loads AGMARKNET processed data and generates relative price signals.
Maps kirana item families to specific commodities.
"""

import pandas as pd
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
AGMARKNET_CSV = BASE_DIR / "data" / "agmarknet_api" / "kirana_commodities_combined.csv"

# Map Favorita families to AGMARKNET commodities where applicable
FAMILY_TO_COMMODITY = {
    "PRODUCE": ["Tomato", "Onion", "Potato", "Green Chilli", "Banana"],
    "GROCERY I": ["Rice", "Paddy(Dhan)(Common)", "Bengal Gram Dal (Chana Dal)", "Gur(Jaggery)"],
    "GROCERY II": ["Ground Nut Oil", "Sunflower Oil"],
}

def get_price_df():
    if not AGMARKNET_CSV.exists():
        return pd.DataFrame()
    df = pd.read_csv(AGMARKNET_CSV)
    df["date"] = pd.to_datetime(df["date"])
    return df

def generate_commodity_signals():
    """
    Creates a daily price index dataframe that can be merged with sales data.
    """
    df = get_price_df()
    if df.empty:
        return pd.DataFrame()
        
    # We take the state-wide average modal price per commodity per day
    daily_prices = df.groupby(["date", "commodity"])["modal_price"].mean().reset_index()
    
    # Pivot to get commodities as columns
    pivot = daily_prices.pivot(index="date", columns="commodity", values="modal_price").reset_index()
    
    # Forward fill missing days (markets are closed on weekends/holidays)
    pivot = pivot.set_index("date").sort_index()
    
    # Create a continuous date range covering min to max date
    idx = pd.date_range(pivot.index.min(), pivot.index.max())
    pivot = pivot.reindex(idx)
    pivot = pivot.ffill().bfill() # ffill, then bfill at start
    pivot = pivot.reset_index().rename(columns={"index": "date"})
    
    # Generate relative price signals for key commodities
    signals = pd.DataFrame({"date": pivot["date"]})
    
    key_commodities = ["Tomato", "Onion", "Potato", "Rice", "Green Chilli"]
    
    for comm in key_commodities:
        if comm in pivot.columns:
            # Absolute price
            signals[f"price_{comm}"] = pivot[comm]
            
            # Relative to 30d moving average
            ma_30 = pivot[comm].rolling(30, min_periods=1).mean()
            signals[f"price_{comm}_vs_30d_avg"] = pivot[comm] / ma_30
            
            # Spike flag: > 1.5x of 30d avg
            signals[f"price_{comm}_spike_flag"] = (signals[f"price_{comm}_vs_30d_avg"] > 1.5).astype(int)
            
            # 7-day trend
            signals[f"price_{comm}_change_7d"] = pivot[comm].pct_change(7).fillna(0)
            
    return signals

def add_price_features(df):
    """
    Merges price signals onto the main dataframe.
    """
    df = df.copy()
    if "date" not in df.columns:
        return df
        
    signals = generate_commodity_signals()
    if signals.empty:
        return df
        
    # Merge
    df = df.merge(signals, on="date", how="left")
    
    # Fill NAs (for dates where we don't have AGMARKNET data, e.g. Favorita history)
    # Since we can't join by date, the model learns the relative signals. For old dates, we impute neutral signals.
    for col in signals.columns:
        if col == "date": continue
        if "vs_30d_avg" in col:
            df[col] = df[col].fillna(1.0) # Neutral = average
        elif "spike_flag" in col:
            df[col] = df[col].fillna(0)
        elif "change_7d" in col:
            df[col] = df[col].fillna(0.0)
        else: # Absolute price
            df[col] = df[col].fillna(df[col].median() if not pd.isna(df[col].median()) else 0)
            
    return df
