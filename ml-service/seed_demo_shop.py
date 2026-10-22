"""
ANTARYA — Real Data Demo Seeder
================================
Seeds the hackathon demo shop using REAL data from the Indian Retail dataset.
Runs the v7 Two-Stage Hurdle Model against real historical demand to generate
genuine prediction logs and actual logs.

Usage: python seed_demo_shop.py <shopId>
"""

import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import numpy as np
import pandas as pd
import requests
import joblib
from pathlib import Path
from datetime import datetime, timedelta

# Import the existing feature engineering pipeline
from train_v6 import load_indian_retail, apply_kirana_mapping, engineer_features_v6, FEATURE_COLUMNS_V6, TARGET

BASE_DIR = Path(__file__).parent
MODEL_PATH = BASE_DIR / "saved_models" / "indian_v7_hurdle_model.pkl"
EXPRESS_API = "http://localhost:5001/api/dashboard/seed-hackathon"


def main():
    print("=" * 60)
    print(" ANTARYA: SEEDING REAL DEMO DATA FROM INDIAN RETAIL DATASET")
    print("=" * 60)

    if len(sys.argv) < 2:
        print("Usage: python seed_demo_shop.py <shopId>")
        sys.exit(1)

    shop_id = sys.argv[1]
    print(f"  Target Shop ID: {shop_id}")

    # ── Step 1: Load Real Data ──
    print("\n[1/6] Loading Indian Retail Dataset...")
    df = load_indian_retail()
    df = apply_kirana_mapping(df)

    # ── Step 2: Select a real store outlet ──
    available_outlets = df['outlet'].unique()
    target_outlet = 44 if 44 in available_outlets else available_outlets[0]
    df_shop = df[df['outlet'] == target_outlet].copy()
    print(f"  Filtered outlet {target_outlet}: {len(df_shop):,} rows")

    # ── Step 3: Engineer Features ──
    print("[2/6] Engineering features...")
    df_engineered = engineer_features_v6(df_shop)
    df_clean = df_engineered.dropna(subset=FEATURE_COLUMNS_V6 + [TARGET]).sort_values('date').reset_index(drop=True)

    # ── Step 4: Select top 15 products by total sales volume ──
    top_products = (
        df_clean.groupby('product_identifier')[TARGET]
        .sum()
        .sort_values(ascending=False)
        .head(15)
        .index.tolist()
    )
    df_demo = df_clean[df_clean['product_identifier'].isin(top_products)].copy()

    # ── Step 5: Extract last 30 days of history ──
    max_date = df_demo['date'].max()
    start_date = max_date - pd.Timedelta(days=30)
    df_history = df_demo[df_demo['date'] > start_date].copy()
    print(f"  Last 30 days: {len(df_history):,} records for {len(top_products)} products")

    # ── Step 6: Load v7 Model ──
    print("[3/6] Loading v7 Hurdle Model...")
    try:
        model_dict = joblib.load(MODEL_PATH)
        classifier = model_dict['classifier']
        regressor = model_dict['regressor']
        tau = model_dict.get('tau', 0.5)
        feature_cols = model_dict.get('features', FEATURE_COLUMNS_V6)
        print(f"  Model loaded. Threshold tau={tau}")
    except Exception as e:
        print(f"  ERROR loading model: {e}")
        sys.exit(1)

    # ── Map product IDs to realistic Indian kirana product names ──
    PRODUCT_NAMES = [
        {"name": "Aashirvaad Atta 5kg",      "price": 240, "unit": "pack",  "emoji": "🌾"},
        {"name": "Amul Taaza Milk 1L",        "price": 68,  "unit": "L",     "emoji": "🥛"},
        {"name": "Parle-G Biscuit",           "price": 10,  "unit": "pc",    "emoji": "🍪"},
        {"name": "Surf Excel 1kg",            "price": 130, "unit": "pack",  "emoji": "🧴"},
        {"name": "India Gate Basmati 1kg",    "price": 110, "unit": "kg",    "emoji": "🍚"},
        {"name": "Fortune Sunflower Oil 1L",  "price": 145, "unit": "L",     "emoji": "🫒"},
        {"name": "Maggi 2-Min Noodles",       "price": 14,  "unit": "pc",    "emoji": "🍜"},
        {"name": "Tata Salt 1kg",             "price": 24,  "unit": "pack",  "emoji": "🧂"},
        {"name": "Brooke Bond Red Label",     "price": 120, "unit": "pack",  "emoji": "☕"},
        {"name": "Lays Magic Masala",         "price": 20,  "unit": "pc",    "emoji": "🥔"},
        {"name": "Amul Butter 100g",          "price": 54,  "unit": "pc",    "emoji": "🧈"},
        {"name": "Everest Turmeric 100g",     "price": 32,  "unit": "pack",  "emoji": "🟡"},
        {"name": "Dabur Honey 250g",          "price": 99,  "unit": "jar",   "emoji": "🍯"},
        {"name": "Lifebuoy Soap 100g",        "price": 30,  "unit": "pc",    "emoji": "🧼"},
        {"name": "Haldiram Bhujia 200g",      "price": 55,  "unit": "pack",  "emoji": "🥜"},
    ]

    product_map = {}
    for i, pid in enumerate(top_products):
        if i < len(PRODUCT_NAMES):
            product_map[pid] = PRODUCT_NAMES[i]

    # ── Build Payloads ──
    print("[4/6] Building inventory, sales, and prediction payloads...")

    # Products payload
    payload_products = []
    for pid, info in product_map.items():
        payload_products.append({
            "name": info["name"],
            "emoji": info["emoji"],
            "sellingPrice": info["price"],
            "costPrice": int(info["price"] * 0.8),
            "unit": info["unit"],
            "category": "Grocery",
            "minStock": 10,
            "quantity": int(np.random.randint(5, 45)),
        })

    # Shift dates so max_date aligns with yesterday
    days_shift = (datetime.now().date() - pd.Timestamp(max_date).date()).days - 1

    payload_sales = []
    payload_prediction_logs = []
    payload_actual_logs = []

    name_lookup = {pid: product_map[pid]["name"] for pid in product_map}
    price_lookup = {pid: product_map[pid]["price"] for pid in product_map}

    print("[5/6] Running v7 model on real history...")
    row_count = 0
    for _, row in df_history.iterrows():
        pid = row['product_identifier']
        if pid not in name_lookup:
            continue

        actual_sales = int(row[TARGET])
        shifted_date = row['date'] + pd.Timedelta(days=days_shift)

        # ── Run Two-Stage Hurdle prediction ──
        feat_row = row[feature_cols].values.reshape(1, -1)
        try:
            prob = classifier.predict_proba(feat_row)[:, 1][0]
            cond_pred = regressor.predict(feat_row)[0]
            predicted_demand = round(float(np.where(prob > tau, np.round(cond_pred), 0)), 1)
            confidence = 92 if prob > (tau + 0.2) or prob < (tau - 0.2) else 80
        except Exception:
            predicted_demand = 0.0
            confidence = 70

        # Sales record (only if actual > 0)
        if actual_sales > 0:
            payload_sales.append({
                "amount": actual_sales * price_lookup[pid],
                "method": "cash",
                "items": [{"name": name_lookup[pid], "productId": str(pid), "qty": actual_sales, "price": price_lookup[pid]}],
                "timestamp": shifted_date.isoformat(),
            })

        # Prediction Log
        pred_id = f"pred_{int(shifted_date.timestamp())}_{pid}"
        payload_prediction_logs.append({
            "productId": str(pid),
            "productName": name_lookup[pid],
            "predictedDemand": predicted_demand,
            "confidence": confidence,
            "modelVersion": "7.0.0-hurdle",
            "modelType": "foundation",
            "timestamp": shifted_date.isoformat(),
        })

        # Actual Log with Error
        abs_err = abs(predicted_demand - actual_sales)
        pct_err = (abs_err / actual_sales * 100) if actual_sales > 0 else (100 if abs_err > 0 else 0)
        payload_actual_logs.append({
            "productId": str(pid),
            "productName": name_lookup[pid],
            "actualSales": actual_sales,
            "predictionLogId": pred_id,
            "absoluteError": round(abs_err, 2),
            "percentageError": round(pct_err, 2),
            "timestamp": shifted_date.isoformat(),
        })
        row_count += 1

    print(f"  Processed {row_count} records.")
    print(f"  Products: {len(payload_products)}")
    print(f"  Sales: {len(payload_sales)}")
    print(f"  Prediction Logs: {len(payload_prediction_logs)}")
    print(f"  Actual Logs: {len(payload_actual_logs)}")

    # ── Push to Express Backend ──
    print(f"\n[6/6] Pushing to Express backend ({EXPRESS_API})...")
    try:
        resp = requests.post(
            EXPRESS_API,
            json={
                "shopId": shop_id,
                "products": payload_products,
                "sales": payload_sales,
                "predictionLogs": payload_prediction_logs,
                "actualLogs": payload_actual_logs,
            },
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
        if resp.status_code == 200:
            print("  Hackathon Demo Seeded Successfully!")
            print(f"  Server response: {resp.json()}")
        else:
            print(f"  Failed to seed (HTTP {resp.status_code}): {resp.text}")
    except Exception as e:
        print(f"  Server connection failed: {e}")


if __name__ == "__main__":
    main()
