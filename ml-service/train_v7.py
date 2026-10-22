"""
ANTARYA v7 — Production Two-Stage Hurdle Model & Weekly Reorder Engine
======================================================================
Addresses Indian Kirana intermittent demand (>50% zero-sale days) by separating:
  Stage 1: Purchase Occurrence Classifier (CatBoost Binary) -> P(sales > 0)
  Stage 2: Conditional Positive Regressor (CatBoost MAE)   -> E[sales | sales > 0]
Synthesis: y_hurdle = I(P(sales > 0) > tau) * round(regressor_output)

Also implements Weekly Batch Aggregation (7-day Distributor Reorder Cycle)
and compares rigorously against v6 (`residuals_v6.csv`).
"""

import sys, io, time, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from pathlib import Path
from datetime import datetime
import numpy as np
import pandas as pd
import joblib
import warnings
warnings.filterwarnings('ignore')

from sklearn.metrics import mean_absolute_error, mean_squared_error
from catboost import CatBoostClassifier, CatBoostRegressor

# Import identical v6 data, taxonomy, and features for 100% fair scientific comparison
from train_v6 import load_indian_retail, apply_kirana_mapping, engineer_features_v6, FEATURE_COLUMNS_V6, TARGET

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data" / "indian_retail"
MODEL_DIR = BASE_DIR / "saved_models"
REPORT_DIR = BASE_DIR / "audit_reports"
MODEL_DIR.mkdir(exist_ok=True)
REPORT_DIR.mkdir(exist_ok=True)


def wmape(y_true, y_pred):
    return np.sum(np.abs(y_true - y_pred)) / max(np.sum(np.abs(y_true)), 1e-8) * 100

def custom_mape(y_true, y_pred):
    return np.mean(np.abs((y_true - y_pred) / np.maximum(y_true, 1))) * 100


def main():
    print("=" * 68)
    print(" 🚀 ANTARYA v7 — TWO-STAGE HURDLE & WEEKLY REORDER PIPELINE")
    print("=" * 68)
    
    # ── Step 1: Load & Engineer (Identical to v6) ──
    t0 = time.time()
    df = load_indian_retail()
    df = apply_kirana_mapping(df)
    df = engineer_features_v6(df)
    
    df_clean = df.dropna(subset=FEATURE_COLUMNS_V6 + [TARGET]).sort_values('date').reset_index(drop=True)
    print(f"\n  Full Clean Dataset: {len(df_clean):,} rows across {df_clean['product_identifier'].nunique()} products.")
    
    # ── Step 2: Identical Temporal Split (Last 30 Days Hold-Out) ──
    split_date = df_clean['date'].max() - pd.Timedelta(days=30)
    train_df = df_clean[df_clean['date'] < split_date].copy()
    test_df = df_clean[df_clean['date'] >= split_date].copy()
    
    X_train = train_df[FEATURE_COLUMNS_V6].values
    y_train = train_df[TARGET].values
    X_test = test_df[FEATURE_COLUMNS_V6].values
    y_test = test_df[TARGET].values
    
    print(f"  Train Split (< {split_date.strftime('%Y-%m-%d')}): {len(train_df):,} rows")
    print(f"  Test Split  (>= {split_date.strftime('%Y-%m-%d')}): {len(test_df):,} rows")
    
    # Check if v6 residuals exist for exact side-by-side comparison
    res_v6_file = REPORT_DIR / "residuals_v6.csv"
    if res_v6_file.exists():
        res_v6 = pd.read_csv(res_v6_file)
        if len(res_v6) == len(test_df):
            test_df['v6_predicted'] = res_v6['predicted'].values
        else:
            print("  [Warning] v6 residuals row count mismatch. Using v6 loaded model if available.")
            v6_model = joblib.load(MODEL_DIR / "indian_v6_model.pkl")
            test_df['v6_predicted'] = np.maximum(0, v6_model.predict(X_test))
    else:
        v6_model = joblib.load(MODEL_DIR / "indian_v6_model.pkl")
        test_df['v6_predicted'] = np.maximum(0, v6_model.predict(X_test))
    
    # ── Step 3: Train Stage 1 — Binary Purchase Classifier ──
    print("\n" + "=" * 60)
    print("STAGE 1: TRAINING PURCHASE OCCURRENCE CLASSIFIER")
    print("=" * 60)
    y_train_binary = (y_train > 0).astype(int)
    print(f"  Train binary target distribution: {np.mean(y_train_binary)*100:.2f}% positive sales days.")
    
    classifier = CatBoostClassifier(
        iterations=600,
        learning_rate=0.04,
        depth=6,
        loss_function='Logloss',
        eval_metric='Logloss',
        random_seed=42,
        verbose=100
    )
    
    # Use last 10% of train_df as validation for classifier early stopping
    val_split_idx = int(len(train_df) * 0.9)
    classifier.fit(
        X_train[:val_split_idx], y_train_binary[:val_split_idx],
        eval_set=(X_train[val_split_idx:], y_train_binary[val_split_idx:]),
        early_stopping_rounds=40
    )
    
    # Predict probabilities on test set
    test_probs = classifier.predict_proba(X_test)[:, 1]
    
    # ── Step 4: Train Stage 2 — Conditional Positive Regressor ──
    print("\n" + "=" * 60)
    print("STAGE 2: TRAINING CONDITIONAL POSITIVE REGRESSOR (sales > 0 only)")
    print("=" * 60)
    train_pos = train_df[train_df[TARGET] > 0].reset_index(drop=True)
    X_train_pos = train_pos[FEATURE_COLUMNS_V6].values
    y_train_pos = train_pos[TARGET].values
    print(f"  Training conditional regressor strictly on {len(train_pos):,} non-zero days (mean sales = {y_train_pos.mean():.2f} units)")
    
    regressor = CatBoostRegressor(
        iterations=800,
        learning_rate=0.03,
        depth=6,
        loss_function='MAE',
        eval_metric='MAE',
        random_seed=42,
        verbose=100
    )
    
    val_pos_idx = int(len(train_pos) * 0.9)
    regressor.fit(
        X_train_pos[:val_pos_idx], y_train_pos[:val_pos_idx],
        eval_set=(X_train_pos[val_pos_idx:], y_train_pos[val_pos_idx:]),
        early_stopping_rounds=50
    )
    
    # Predict conditional magnitude on test set
    test_cond_preds = regressor.predict(X_test)
    
    # ── Step 5: Hurdle Optimal Synthesis & Threshold Search ──
    print("\n" + "=" * 60)
    print("STEP 5: HURDLE SYNTHESIS & THRESHOLD OPTIMIZATION")
    print("=" * 60)
    
    best_tau = 0.35
    best_wmape = 99999.0
    
    # Search optimal probability hurdle threshold on validation slice
    val_probs = classifier.predict_proba(X_train[val_split_idx:])[:, 1]
    val_cond = regressor.predict(X_train[val_split_idx:])
    y_val_actual = y_train[val_split_idx:]
    
    for tau in np.arange(0.15, 0.65, 0.05):
        val_hurdle = np.where(val_probs > tau, np.round(val_cond), 0)
        w = wmape(y_val_actual, val_hurdle)
        if w < best_wmape:
            best_wmape = w
            best_tau = round(tau, 2)
            
    print(f"  Optimal Hurdle Probability Threshold (tau): {best_tau} (Validation WMAPE: {best_wmape:.2f}%)")
    
    # Generate final test set hurdle predictions
    test_df['v7_hurdle_predicted'] = np.where(test_probs > best_tau, np.round(test_cond_preds), 0)
    test_df['v7_hurdle_raw'] = np.where(test_probs > best_tau, test_cond_preds, 0)
    
    # ── Step 6: Weekly Batch Aggregation Engine ──
    print("\n" + "=" * 60)
    print("STEP 6: WEEKLY BATCH AGGREGATION ENGINE (Distributor Reorder Cycle)")
    print("=" * 60)
    
    test_df['year_week'] = test_df['date'].dt.strftime('%Y-%U')
    weekly_df = test_df.groupby(['product_identifier', 'outlet', 'year_week']).agg(
        actual_weekly_sales=('sales', 'sum'),
        v6_weekly_pred=('v6_predicted', 'sum'),
        v7_weekly_pred=('v7_hurdle_predicted', 'sum'),
        zero_days_in_week=('sales', lambda x: (x == 0).sum())
    ).reset_index()
    
    # ── Step 7: Comprehensive Scientific & Business Comparison ──
    print("\n" + "█" * 68)
    print(" 📊 SCIENTIFIC VALIDATION & BUSINESS METRIC COMPARISON (v6 vs v7)")
    print("█" * 68)
    
    # Daily metrics
    y_true = test_df['sales'].values
    v6_pred = test_df['v6_predicted'].values
    v7_pred = test_df['v7_hurdle_predicted'].values
    
    v6_daily_wmape = wmape(y_true, v6_pred)
    v7_daily_wmape = wmape(y_true, v7_pred)
    v6_daily_mae = mean_absolute_error(y_true, v6_pred)
    v7_daily_mae = mean_absolute_error(y_true, v7_pred)
    
    # Weekly aggregated metrics
    y_true_wk = weekly_df['actual_weekly_sales'].values
    v6_wk_pred = weekly_df['v6_weekly_pred'].values
    v7_wk_pred = weekly_df['v7_weekly_pred'].values
    
    v6_weekly_wmape = wmape(y_true_wk, v6_wk_pred)
    v7_weekly_wmape = wmape(y_true_wk, v7_wk_pred)
    v6_weekly_mae = mean_absolute_error(y_true_wk, v6_wk_pred)
    v7_weekly_mae = mean_absolute_error(y_true_wk, v7_wk_pred)
    
    # Stockout vs Overstock on intermittent products
    zero_days = (y_true == 0)
    sale_days = (y_true > 0)
    
    v6_false_positive_noise = np.mean(v6_pred[zero_days] > 0.1) * 100
    v7_false_positive_noise = np.mean(v7_pred[zero_days] > 0) * 100
    
    print("\n1. DAILY POINT-FORECAST METRICS:")
    print(f"   Metric                          | ANTARYA v6 (Single GBDT) | ANTARYA v7 (Two-Stage Hurdle)")
    print(f"   --------------------------------+--------------------------+-------------------------------")
    print(f"   Daily WMAPE (%)                 | {v6_daily_wmape:<24.2f} | {v7_daily_wmape:<28.2f}")
    print(f"   Daily MAE (units)               | {v6_daily_mae:<24.4f} | {v7_daily_mae:<28.4f}")
    print(f"   False Positive Noise on 0-Days  | {v6_false_positive_noise:<24.1f}% | {v7_false_positive_noise:<28.1f}%")
    
    print("\n2. WEEKLY DISTRIBUTOR REORDER METRICS (7-Day Batch Cycle):")
    print(f"   Metric                          | ANTARYA v6 (Aggregated)  | ANTARYA v7 (Aggregated Hurdle)")
    print(f"   --------------------------------+--------------------------+-------------------------------")
    print(f"   Weekly Batch WMAPE (%)          | {v6_weekly_wmape:<24.2f} | {v7_weekly_wmape:<28.2f}")
    print(f"   Weekly Batch MAE (units/week)   | {v6_weekly_mae:<24.4f} | {v7_weekly_mae:<28.4f}")
    
    # Sliced analysis: Intermittent vs Fast-moving
    test_df['zero_pct_hist'] = test_df['zero_demand_streak'] / 30.0  # proxy or group zero rate
    prod_zeros = test_df.groupby('product_identifier')['sales'].agg(lambda x: (x==0).mean()*100).to_dict()
    test_df['prod_intermittency'] = test_df['product_identifier'].map(prod_zeros)
    
    fast_mask = test_df['prod_intermittency'] <= 40
    intermittent_mask = test_df['prod_intermittency'] > 40
    
    v6_fast_wmape = wmape(test_df.loc[fast_mask, 'sales'], test_df.loc[fast_mask, 'v6_predicted'])
    v7_fast_wmape = wmape(test_df.loc[fast_mask, 'sales'], test_df.loc[fast_mask, 'v7_hurdle_predicted'])
    
    v6_int_wmape = wmape(test_df.loc[intermittent_mask, 'sales'], test_df.loc[intermittent_mask, 'v6_predicted'])
    v7_int_wmape = wmape(test_df.loc[intermittent_mask, 'sales'], test_df.loc[intermittent_mask, 'v7_hurdle_predicted'])
    
    print("\n3. PERFORMANCE BY PRODUCT VELOCITY CLUSTER:")
    print(f"   Velocity Cluster                | ANTARYA v6 WMAPE (%)     | ANTARYA v7 WMAPE (%)")
    print(f"   --------------------------------+--------------------------+-------------------------------")
    print(f"   Fast-Moving Goods (<=40% zeros) | {v6_fast_wmape:<24.2f} | {v7_fast_wmape:<28.2f}")
    print(f"   Intermittent Goods (>40% zeros) | {v6_int_wmape:<24.2f} | {v7_int_wmape:<28.2f}")
    
    # Save comparison report and model artifacts
    joblib.dump({'classifier': classifier, 'regressor': regressor, 'tau': best_tau, 'features': FEATURE_COLUMNS_V6}, MODEL_DIR / "indian_v7_hurdle_model.pkl")
    
    v7_metrics = {
        'model_version': '7.0.0-hurdle',
        'trained_at': datetime.now().isoformat(),
        'architecture': 'Two-Stage Hurdle (CatBoost Binary + CatBoost Regressor)',
        'hurdle_threshold_tau': best_tau,
        'daily_metrics': {
            'v6_wmape': round(v6_daily_wmape, 2),
            'v7_wmape': round(v7_daily_wmape, 2),
            'v6_mae': round(v6_daily_mae, 4),
            'v7_mae': round(v7_daily_mae, 4),
        },
        'weekly_batch_metrics': {
            'v6_weekly_wmape': round(v6_weekly_wmape, 2),
            'v7_weekly_wmape': round(v7_weekly_wmape, 2),
            'v6_weekly_mae': round(v6_weekly_mae, 4),
            'v7_weekly_mae': round(v7_weekly_mae, 4),
        },
        'cluster_metrics': {
            'fast_moving_wmape_v6': round(v6_fast_wmape, 2),
            'fast_moving_wmape_v7': round(v7_fast_wmape, 2),
            'intermittent_wmape_v6': round(v6_int_wmape, 2),
            'intermittent_wmape_v7': round(v7_int_wmape, 2),
        }
    }
    with open(MODEL_DIR / "indian_v7_metrics.json", 'w') as f:
        json.dump(v7_metrics, f, indent=2)
        
    test_df[['date', 'product_identifier', 'outlet', 'sales', 'v6_predicted', 'v7_hurdle_predicted']].to_csv(REPORT_DIR / "comparison_v6_vs_v7.csv", index=False)
    weekly_df.to_csv(REPORT_DIR / "weekly_reorder_recommendations_v7.csv", index=False)
    
    print("\n████████████████████████████████████████████████████████████")
    print("  v7 HURDLE PIPELINE COMPLETE & SAVED")
    print(f"  Model Artifact: saved_models/indian_v7_hurdle_model.pkl")
    print(f"  Metrics JSON:   saved_models/indian_v7_metrics.json")
    print(f"  Weekly Batch:   audit_reports/weekly_reorder_recommendations_v7.csv")
    print("████████████████████████████████████████████████████████████\n")

if __name__ == "__main__":
    main()
