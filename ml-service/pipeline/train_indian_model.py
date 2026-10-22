"""
ANTARYA ML Optimization — Indian Predictive Engine
===================================================
1. Loads Favorita (bootstrap sales)
2. Unifies with Indian Festival, Weather, Salary, and Price signals
3. Trains LightGBM with Huber loss
4. Saves Indian-first model
"""

import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import pandas as pd
import numpy as np
import lightgbm as lgb
import joblib
import json
import time
from pathlib import Path
from datetime import datetime
from sklearn.metrics import mean_absolute_error, mean_squared_error

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
MODEL_DIR = BASE_DIR / "saved_models"
MODEL_DIR.mkdir(exist_ok=True)

sys.path.append(str(BASE_DIR))
from config import FAVORITA_STORE_NBR, KIRANA_FAMILIES
from pipeline.feature_store import build_unified_features
from utils.features_v2 import TARGET_COLUMN

def wmape(y_true, y_pred):
    return np.sum(np.abs(y_true - y_pred)) / np.maximum(np.sum(np.abs(y_true)), 1e-8) * 100

def custom_mape(y_true, y_pred):
    return np.mean(np.abs((y_true - y_pred) / np.maximum(y_true, 1))) * 100

def load_base_data():
    train_path = DATA_DIR / "train.csv"
    items_path = DATA_DIR / "items.csv"
    
    items = pd.read_csv(items_path)
    kirana_items = items[items['family'].isin(KIRANA_FAMILIES)]['item_nbr'].unique()
    
    chunks = []
    for chunk in pd.read_csv(train_path, chunksize=1_000_000, dtype={'onpromotion': str}):
        chunks.append(chunk[(chunk['store_nbr'] == FAVORITA_STORE_NBR) & (chunk['item_nbr'].isin(kirana_items))])
        
    df = pd.concat(chunks, ignore_index=True)
    df = df.merge(items[['item_nbr', 'family']], on='item_nbr', how='left')
    df['onpromotion'] = pd.to_numeric(df['onpromotion'], errors='coerce').fillna(0).astype(int)
    df['date'] = pd.to_datetime(df['date'])
    df['unit_sales'] = df['unit_sales'].clip(lower=0)
    
    item_avg = df.groupby('item_nbr')['unit_sales'].mean()
    high_vol = item_avg[item_avg >= 2].index
    df = df[df['item_nbr'].isin(high_vol)]
    
    return df.sort_values(['item_nbr', 'date']).reset_index(drop=True)

def train_indian_model():
    OLD_WMAPE = 34.55
    
    df_raw = load_base_data()
    df_fe, FEATURE_COLUMNS = build_unified_features(df_raw, is_training=True)
    
    # Split
    dates = df_fe['date']
    split_date = dates.max() - pd.Timedelta(days=30)
    train_df = df_fe[dates < split_date].copy()
    test_df  = df_fe[dates >= split_date].copy()
    
    X_train = train_df[FEATURE_COLUMNS].values
    y_train = train_df[TARGET_COLUMN].values
    X_test  = test_df[FEATURE_COLUMNS].values
    y_test  = test_df[TARGET_COLUMN].values
    
    print("\n" + "="*60)
    print(f"TRAINING LIGHTGBM ({len(FEATURE_COLUMNS)} Features)")
    print("="*60)
    
    params = {
        'objective': 'huber', 'metric': 'huber', 'alpha': 0.9,
        'boosting_type': 'gbdt', 'learning_rate': 0.05,
        'num_leaves': 127, 'feature_fraction': 0.8,
        'bagging_fraction': 0.8, 'bagging_freq': 5,
        'verbose': -1, 'random_state': 42
    }
    
    t0 = time.time()
    tr_ds  = lgb.Dataset(X_train, label=y_train, feature_name=FEATURE_COLUMNS)
    val_ds = lgb.Dataset(X_test,  label=y_test,  reference=tr_ds)
    model = lgb.train(
        params, tr_ds, num_boost_round=1000,
        valid_sets=[tr_ds, val_ds],
        callbacks=[lgb.early_stopping(50), lgb.log_evaluation(100)]
    )
    
    preds = np.maximum(model.predict(X_test), 0)
    
    new_wmape = round(wmape(y_test, preds), 2)
    new_mae   = round(mean_absolute_error(y_test, preds), 2)
    improvement = round(OLD_WMAPE - new_wmape, 2)
    
    print("\n" + "="*60)
    print("RESULTS: Indian Data Layer vs Ecuador Model")
    print("="*60)
    print(f"  Old WMAPE (Ecuador): {OLD_WMAPE}%")
    print(f"  New WMAPE (Indian):  {new_wmape}%")
    print(f"  Improvement:         {improvement:+.2f}%")
    
    # Save model and columns
    joblib.dump(model, MODEL_DIR / "indian_demand_model.pkl")
    family_list = df_fe['family'].astype('category').cat.categories.tolist() if 'family' in df_fe.columns else []
    joblib.dump({'columns': FEATURE_COLUMNS, 'family_list': family_list}, MODEL_DIR / "indian_feature_columns.pkl")
    
    importance = model.feature_importance(importance_type='gain')
    total = importance.sum()
    feat_df = pd.DataFrame({
        'Feature': FEATURE_COLUMNS,
        'Importance_pct': (importance / max(total, 1e-8) * 100).round(2)
    }).sort_values('Importance_pct', ascending=False).reset_index(drop=True)
    
    print("\nTop 15 Features:")
    print(feat_df.head(15).to_string(index=False))
    
if __name__ == "__main__":
    train_indian_model()
