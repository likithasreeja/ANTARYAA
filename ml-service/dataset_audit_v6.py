"""
ANTARYA v6 — Step 3: Complete Dataset Audit
=============================================
Inspects ALL datasets before any code modification.
"""

import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import pandas as pd
import numpy as np
from pathlib import Path

BASE_DIR = Path(r"c:\Users\DELL\OneDrive\Desktop\antarya\ml-service\data")

def audit_csv(path, name, max_preview=5):
    print(f"\n{'='*70}")
    print(f"  DATASET: {name}")
    print(f"  PATH: {path}")
    print(f"{'='*70}")
    
    if not path.exists():
        print("  FILE NOT FOUND")
        return None
    
    df = pd.read_csv(path, on_bad_lines='skip', encoding='utf-8')
    
    print(f"  Rows: {len(df):,}")
    print(f"  Columns: {len(df.columns)}")
    print(f"  Memory: {df.memory_usage(deep=True).sum()/1024/1024:.1f} MB")
    print(f"\n  COLUMNS:")
    for col in df.columns:
        dtype = df[col].dtype
        nulls = df[col].isnull().sum()
        nuniq = df[col].nunique()
        sample = str(df[col].dropna().iloc[0])[:50] if len(df[col].dropna()) > 0 else "ALL NULL"
        print(f"    {col:<30} dtype={str(dtype):<10} nulls={nulls:>6} unique={nuniq:>6}  sample={sample}")
    
    # Date columns
    date_cols = [c for c in df.columns if 'date' in c.lower() or 'time' in c.lower()]
    for dc in date_cols:
        try:
            dates = pd.to_datetime(df[dc], errors='coerce')
            valid = dates.dropna()
            if len(valid) > 0:
                print(f"\n  DATE RANGE ({dc}): {valid.min().date()} to {valid.max().date()} ({(valid.max()-valid.min()).days} days)")
        except:
            pass
    
    # Numeric stats for potential target columns
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    if len(numeric_cols) > 0:
        print(f"\n  NUMERIC SUMMARY:")
        for nc in numeric_cols[:8]:
            print(f"    {nc:<30} mean={df[nc].mean():.2f}  std={df[nc].std():.2f}  min={df[nc].min():.2f}  max={df[nc].max():.2f}")
    
    # Duplicates
    dups = df.duplicated().sum()
    print(f"\n  Duplicates: {dups:,} ({dups/len(df)*100:.1f}%)")
    
    # Categorical distribution
    cat_cols = df.select_dtypes(include=['object']).columns
    for cc in cat_cols[:5]:
        print(f"\n  {cc} (top 5):")
        for val, cnt in df[cc].value_counts().head(5).items():
            print(f"    {val}: {cnt:,}")
    
    print(f"\n  FIRST 3 ROWS:")
    print(df.head(3).to_string(index=False))
    
    return df

# ============================================
# AUDIT ALL DATASETS
# ============================================
print("█"*70)
print("  ANTARYA v6 — COMPLETE DATASET AUDIT")
print("█"*70)

# 1. Indian Retail Chain (Priority 1)
df_train = audit_csv(BASE_DIR / "indian_retail" / "train_data.csv", "PRIORITY 1: Indian Retail Chain — Train")
df_prices = audit_csv(BASE_DIR / "indian_retail" / "product_prices.csv", "PRIORITY 1: Indian Retail Chain — Product Prices")
df_weeks = audit_csv(BASE_DIR / "indian_retail" / "date_to_week_id_map.csv", "PRIORITY 1: Indian Retail Chain — Date-Week Map")
df_test = audit_csv(BASE_DIR / "indian_retail" / "test_data.csv", "PRIORITY 1: Indian Retail Chain — Test")
df_sample = audit_csv(BASE_DIR / "indian_retail" / "sample_submission.csv", "PRIORITY 1: Indian Retail Chain — Sample Submission")

# 2. Indian Store Data (Priority 2)
df_store = audit_csv(BASE_DIR / "indian_store" / "store_sales_data (2).csv", "PRIORITY 2: Indian Store Sales (100K)")

# 3. AGMARKNET (already processed)
df_agmark = audit_csv(BASE_DIR / "agmarknet_api" / "kirana_commodities_combined.csv", "PRIORITY 3: AGMARKNET Commodity Prices")

# 4. Hyderabad Weather (already fetched)
df_weather = audit_csv(BASE_DIR / "weather" / "hyderabad_weather.csv", "PRIORITY 4: Hyderabad Weather")

# ============================================
# CROSS-DATASET ANALYSIS
# ============================================
print("\n" + "█"*70)
print("  CROSS-DATASET COMPATIBILITY ANALYSIS")
print("█"*70)

if df_train is not None and df_weeks is not None:
    # Join train with weeks to get actual dates
    print("\n[1] Indian Retail Chain Date Coverage:")
    week_min = df_weeks.iloc[:, 0].min() if df_weeks is not None else "N/A"
    week_max = df_weeks.iloc[:, 0].max() if df_weeks is not None else "N/A"
    print(f"  Week map range: {week_min} to {week_max}")
    
if df_store is not None:
    print("\n[2] Indian Store Data Date Coverage:")
    date_cols = [c for c in df_store.columns if 'date' in c.lower()]
    for dc in date_cols:
        dates = pd.to_datetime(df_store[dc], errors='coerce').dropna()
        if len(dates) > 0:
            print(f"  {dc}: {dates.min().date()} to {dates.max().date()}")

if df_agmark is not None:
    print("\n[3] AGMARKNET Date Coverage:")
    if 'date' in df_agmark.columns:
        dates = pd.to_datetime(df_agmark['date'], errors='coerce').dropna()
        print(f"  {dates.min().date()} to {dates.max().date()}")

if df_weather is not None:
    print("\n[4] Weather Date Coverage:")
    if 'date' in df_weather.columns:
        dates = pd.to_datetime(df_weather['date'], errors='coerce').dropna()
        print(f"  {dates.min().date()} to {dates.max().date()}")

print("\n" + "█"*70)
print("  AUDIT COMPLETE")
print("█"*70)
