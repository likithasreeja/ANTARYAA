"""
ANTARYA Ingestion Layer — Local AGMARKNET CSV Ingestion
=======================================================
Reads the manually downloaded Kaggle CSV when the data.gov.in API is down/slow.
Extracts kirana-relevant commodities and saves a normalized version.
"""

import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import pandas as pd
from pathlib import Path
import logging

# ─── Paths ───
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data" / "agmarknet"
RAW_DIR  = BASE_DIR / "data" / "agmarknet_api"
RAW_DIR.mkdir(parents=True, exist_ok=True)

CSV_FILE = DATA_DIR / "Andhra_Pradesh_Last_2_Year.csv"

# ─── Kirana-relevant commodities ───
KIRANA_COMMODITIES = {
    # Vegetables
    "Tomato", "Onion", "Potato", "Green Chilli", "Brinjal",
    "Cabbage", "Cauliflower", "Cluster beans", "Ridgeguard(Tori)",
    
    # Fruits
    "Banana", "Lemon", "Mango", "Papaya",
    
    # Staples
    "Rice", "Paddy(Dhan)(Common)", "Paddy(Common)", "Maize",
    "Jowar(Sorghum)", "Bajra(Pearl Millet/Cumbu)",
    
    # Pulses/Dal
    "Black Gram (Urd Beans)(Whole)", "Black Gram(Urd Beans)(Whole)",
    "Arhar (Tur/Red Gram)(Whole)", "Arhar(Tur/Red Gram)(Whole)",
    "Bengal Gram(Gram)(Whole)", "Red Gram", "Black Gram Dal (Urd Dal)",
    "Black Gram Dal(Urd Dal)", "Bengal Gram Dal (Chana Dal)",
    "Bengal Gram Dal(Chana Dal)", "Green Gram Dal (Moong Dal)",
    
    # Sugar & Oil
    "Gur(Jaggery)", "Jaggery", "Groundnut", "Ground Nut Oil",
    "Sunflower", "Sunflower Seed", "Cashewnuts"
}

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("local_agmarknet")

def process_local_csv():
    log.info(f"Loading local CSV: {CSV_FILE}")
    if not CSV_FILE.exists():
        log.error("Local CSV not found. Please extract the downloaded zip.")
        return
        
    df = pd.read_csv(CSV_FILE, on_bad_lines='skip', encoding='utf-8')
    
    # Normalize columns
    col_map = {
        "State": "state", "District": "district", "Market": "market",
        "Commodity": "commodity", "Variety": "variety", "Grade": "grade",
        "Arrival_Date": "date", "Min_Price": "min_price", 
        "Max_Price": "max_price", "Modal_Price": "modal_price"
    }
    df = df.rename(columns=col_map)
    
    # Parse dates
    df["date"] = pd.to_datetime(df["date"], format="%d/%m/%Y", errors="coerce")
    
    # Filter kirana
    before = len(df)
    df_filtered = df[df["commodity"].isin(KIRANA_COMMODITIES)].copy()
    after = len(df_filtered)
    log.info(f"Kirana filter: {before:,} → {after:,} rows retained")
    
    # Sort
    df_filtered = df_filtered.sort_values(["commodity", "date"]).reset_index(drop=True)
    
    # Save
    out_path = RAW_DIR / "kirana_commodities_combined.csv"
    df_filtered.to_csv(out_path, index=False, encoding="utf-8")
    log.info(f"Saved processed data to: {out_path}")
    
    return df_filtered

if __name__ == "__main__":
    process_local_csv()
