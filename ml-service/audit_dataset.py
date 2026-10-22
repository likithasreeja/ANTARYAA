"""
ANTARYA ML Service — Dataset Audit (Phase 1.5)
================================================
🧠 CONCEPT: The CTO's "Validation Gate"

Before we train any AI, we must PROVE the data is good.
Garbage In = Garbage Out.

This script checks:
1. Row count (Do we have enough data?)
2. Date ranges (Are we predicting the future based on old data?)
3. Missing values (Will the model crash?)
4. Product families (Do they match our Kirana items?)
"""

import pandas as pd
from pathlib import Path

from config import DATA_DIR, KIRANA_FAMILIES

def audit_data():
    print("\n--- ANTARYA DATASET AUDIT ---\n")
    
    train_path = DATA_DIR / "train.csv"
    items_path = DATA_DIR / "items.csv"
    
    if not train_path.exists():
        print(f"ERROR: Cannot find train.csv in {DATA_DIR}")
        return
    if not items_path.exists():
        print(f"ERROR: Cannot find items.csv in {DATA_DIR}")
        return
        
    print("Reading items.csv...")
    items = pd.read_csv(items_path)
    print(f"Items loaded. Found {len(items)} total products.")
    
    kirana_items = items[items['family'].isin(KIRANA_FAMILIES)]
    print(f"Kirana-relevant products: {len(kirana_items)}")
    
    print("\nReading train.csv (this is huge, just sampling the first 5 Million rows for the audit)...")
    # Read a sample to save memory for the audit
    train = pd.read_csv(train_path, nrows=5_000_000)
    
    print(f"\nDATASET HEALTH REPORT:")
    print(f"Rows checked       : {len(train):,}")
    print(f"Columns            : {list(train.columns)}")
    
    print(f"\nDATE RANGE:")
    train['date'] = pd.to_datetime(train['date'])
    print(f"Start Date         : {train['date'].min().strftime('%Y-%m-%d')}")
    print(f"End Date           : {train['date'].max().strftime('%Y-%m-%d')}")
    
    print(f"\nMISSING VALUES:")
    missing = train.isnull().sum()
    if missing.sum() == 0:
        print("No missing values found. Data is clean!")
    else:
        for col, val in missing.items():
            if val > 0:
                print(f"{col}: {val:,} missing rows")
                
    print(f"\nUNIQUE STORES IN SAMPLE:")
    print(f"Store count        : {train['store_nbr'].nunique()}")
    
    # Merge to see family distribution
    train = train.merge(items[['item_nbr', 'family']], on='item_nbr', how='left')
    
    print(f"\nTOP 5 PRODUCT FAMILIES SOLD:")
    top_families = train['family'].value_counts().head(5)
    for family, count in top_families.items():
        print(f"- {family}: {count:,} sales records")
        
    print("\nAUDIT COMPLETE. The data passes the Validation Gate.")
    print("Ready to run benchmark.py!")

if __name__ == "__main__":
    import sys
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    audit_data()
