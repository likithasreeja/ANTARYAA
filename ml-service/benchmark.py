import pandas as pd
import numpy as np
import time
from pathlib import Path
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# Scikit-learn
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error

# Boosting Models
import lightgbm as lgb
try:
    import xgboost as xgb
    HAS_XGB = True
except ImportError:
    HAS_XGB = False
    print("XGBoost not installed. Benchmark will skip XGBoost.")

# Antarya Modules
from config import DATA_DIR, KIRANA_FAMILIES, FAVORITA_STORE_NBR
from utils.features import engineer_features, FEATURE_COLUMNS, TARGET_COLUMN


def custom_mape(y_true, y_pred):
    """MAPE that handles zeroes by capping the denominator at 1."""
    return np.mean(np.abs((y_true - y_pred) / np.maximum(y_true, 1))) * 100


def load_sample_data(n_rows=500_000):
    """Load a fast sample of the dataset for benchmarking."""
    print(f"Loading {n_rows:,} rows for benchmarking...")
    
    items = pd.read_csv(DATA_DIR / "items.csv")
    kirana_items = set(items[items['family'].isin(KIRANA_FAMILIES)]['item_nbr'])
    
    # Read chunk by chunk to filter
    chunks = []
    rows_kept = 0
    
    for chunk in pd.read_csv(DATA_DIR / "train.csv", chunksize=100_000):
        filtered = chunk[(chunk['store_nbr'] == FAVORITA_STORE_NBR) & (chunk['item_nbr'].isin(kirana_items))]
        chunks.append(filtered)
        rows_kept += len(filtered)
        if rows_kept >= n_rows:
            break
            
    df = pd.concat(chunks).head(n_rows)
    df = df.merge(items[['item_nbr', 'family']], on='item_nbr', how='left')
    
    # Ensure chronologically sorted
    df = df.sort_values(by=['item_nbr', 'date']).reset_index(drop=True)
    return df


def run_benchmark():
    print("\n--- ANTARYA MODEL BENCHMARK ---\n")
    
    # 1. Get Data
    df = load_sample_data(n_rows=300_000)
    print("Engineering features...")
    df = engineer_features(df, is_training=True)
    df = df.dropna(subset=FEATURE_COLUMNS + [TARGET_COLUMN])
    
    # 2. Time-series split (Last 15 days for testing)
    dates = pd.to_datetime(df['date'])
    split_date = dates.max() - pd.Timedelta(days=15)
    
    train_df = df[dates < split_date]
    test_df = df[dates >= split_date]
    
    X_train = train_df[FEATURE_COLUMNS].values
    y_train = train_df[TARGET_COLUMN].values
    X_test = test_df[FEATURE_COLUMNS].values
    y_test = test_df[TARGET_COLUMN].values
    
    print(f"Split: {len(train_df)} train, {len(test_df)} test.")
    print("-" * 50)
    
    results = []

    # ─── Model 1: Naive Forecast (Baseline) ───
    # "Tomorrow will be exactly like Yesterday"
    print("Running: Naive Forecast (Yesterday's Sales)")
    start_time = time.time()
    
    # lag_1 is the sales from yesterday
    lag_1_idx = FEATURE_COLUMNS.index('lag_1')
    preds_naive = X_test[:, lag_1_idx]
    
    time_naive = time.time() - start_time
    mape_naive = custom_mape(y_test, preds_naive)
    
    results.append({
        'Model': 'Naive Forecast',
        'MAPE (%)': round(mape_naive, 2),
        'Time (s)': round(time_naive, 3)
    })
    
    # ─── Model 2: Linear Regression ───
    print("Running: Linear Regression")
    start_time = time.time()
    
    lr = LinearRegression()
    lr.fit(X_train, y_train)
    preds_lr = np.maximum(lr.predict(X_test), 0)
    
    time_lr = time.time() - start_time
    mape_lr = custom_mape(y_test, preds_lr)
    
    results.append({
        'Model': 'Linear Regression',
        'MAPE (%)': round(mape_lr, 2),
        'Time (s)': round(time_lr, 3)
    })
    
    # ─── Model 3: XGBoost ───
    if HAS_XGB:
        print("Running: XGBoost")
        start_time = time.time()
        
        model_xgb = xgb.XGBRegressor(n_estimators=100, learning_rate=0.1, random_state=42)
        model_xgb.fit(X_train, y_train)
        preds_xgb = np.maximum(model_xgb.predict(X_test), 0)
        
        time_xgb = time.time() - start_time
        mape_xgb = custom_mape(y_test, preds_xgb)
        
        results.append({
            'Model': 'XGBoost',
            'MAPE (%)': round(mape_xgb, 2),
            'Time (s)': round(time_xgb, 3)
        })
    
    # ─── Model 4: LightGBM ───
    print("Running: LightGBM")
    start_time = time.time()
    
    lgb_train = lgb.Dataset(X_train, y_train)
    lgb_params = {
        'objective': 'regression',
        'metric': 'mape',
        'learning_rate': 0.1,
        'verbose': -1,
        'random_state': 42
    }
    model_lgb = lgb.train(lgb_params, lgb_train, num_boost_round=100)
    preds_lgb = np.maximum(model_lgb.predict(X_test), 0)
    
    time_lgb = time.time() - start_time
    mape_lgb = custom_mape(y_test, preds_lgb)
    
    results.append({
        'Model': 'LightGBM',
        'MAPE (%)': round(mape_lgb, 2),
        'Time (s)': round(time_lgb, 3)
    })
    
    # ─── Print Final Benchmark Table ───
    print("\nBENCHMARK RESULTS:\n")
    
    results_df = pd.DataFrame(results).sort_values(by='MAPE (%)')
    print(results_df.to_string(index=False))
    
    print("\nConclusion for Judges:")
    winner = results_df.iloc[0]['Model']
    improvement = round(mape_naive - results_df.iloc[0]['MAPE (%)'], 2)
    print(f"By using {winner}, we improved forecasting accuracy by {improvement}% ")
    print("compared to a naive 'stock what we sold yesterday' approach.")
    print("This directly translates to reduced stockouts and lower dead stock for the kirana.")


if __name__ == "__main__":
    run_benchmark()
