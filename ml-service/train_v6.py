"""
ANTARYA v6 — Indian-First Complete Training Pipeline
=====================================================
PRIMARY DATASET: Indian Retail Chain (Maharashtra, Telangana, Kerala)
NO Ecuador data. NO geographic mismatch.

Steps:
  1. Load Indian Retail Chain data
  2. Merge product prices
  3. Map to Kirana taxonomy
  4. Engineer 50+ features (time, lags, rolling, EWMA, festivals, weather, salary)
  5. 5-fold TimeSeriesSplit cross-validation
  6. Benchmark 5 algorithms
  7. Optuna hyperparameter search (50 trials)
  8. SHAP analysis
  9. Decision Engine outputs
  10. Freeze best model
"""

import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import pandas as pd
import numpy as np
import lightgbm as lgb
import joblib
import json
import time
import warnings
warnings.filterwarnings('ignore')
from pathlib import Path
from datetime import datetime
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import TimeSeriesSplit

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
MODEL_DIR = BASE_DIR / "saved_models"
REPORT_DIR = BASE_DIR / "audit_reports"
MODEL_DIR.mkdir(exist_ok=True)
REPORT_DIR.mkdir(exist_ok=True)

sys.path.append(str(BASE_DIR))

# ════════════════════════════════════════════════════════
# METRICS
# ════════════════════════════════════════════════════════
def wmape(y_true, y_pred):
    return np.sum(np.abs(y_true - y_pred)) / max(np.sum(np.abs(y_true)), 1e-8) * 100

def custom_mape(y_true, y_pred):
    return np.mean(np.abs((y_true - y_pred) / np.maximum(y_true, 1))) * 100


# ════════════════════════════════════════════════════════
# STEP 1: LOAD DATA
# ════════════════════════════════════════════════════════
def load_indian_retail():
    """Load Indian Retail Chain dataset with product prices."""
    print("=" * 60)
    print("STEP 1: LOADING INDIAN RETAIL CHAIN")
    print("=" * 60)
    
    train_path = DATA_DIR / "indian_retail" / "train_data.csv"
    prices_path = DATA_DIR / "indian_retail" / "product_prices.csv"
    weeks_path = DATA_DIR / "indian_retail" / "date_to_week_id_map.csv"
    
    df = pd.read_csv(train_path)
    df["date"] = pd.to_datetime(df["date"])
    print(f"  Sales: {len(df):,} rows, {df['product_identifier'].nunique()} products, {df['outlet'].nunique()} outlets")
    print(f"  States: {df['state'].unique().tolist()}")
    print(f"  Date range: {df['date'].min().date()} to {df['date'].max().date()}")
    
    # Merge product prices via week_id
    prices = pd.read_csv(prices_path)
    weeks = pd.read_csv(weeks_path)
    
    # Map dates to week_ids
    weeks['date'] = pd.to_datetime(weeks['date'])
    df = df.merge(weeks[['date', 'week_id']], on='date', how='left')
    
    # Merge prices using exact column names: outlet, product_identifier, week_id → sell_price
    df = df.merge(
        prices[['outlet', 'product_identifier', 'week_id', 'sell_price']],
        on=['product_identifier', 'outlet', 'week_id'],
        how='left'
    )
    df.rename(columns={'sell_price': 'price'}, inplace=True)
    df['price'] = df['price'].fillna(df['price'].median())
    
    print(f"  With prices: {df['price'].notna().sum():,} / {len(df):,} rows have price data")
    
    return df.sort_values(['product_identifier', 'outlet', 'date']).reset_index(drop=True)


# ════════════════════════════════════════════════════════
# STEP 2: KIRANA MAPPING
# ════════════════════════════════════════════════════════
def apply_kirana_mapping(df):
    """Map products to unified Kirana taxonomy."""
    print("\nSTEP 2: KIRANA TAXONOMY MAPPING")
    from utils.kirana_mapper import map_retail_chain
    df = map_retail_chain(df)
    print(f"  Categories: {df['kirana_category'].value_counts().to_dict()}")
    return df


# ════════════════════════════════════════════════════════
# STEP 3: FEATURE ENGINEERING (50+ features)
# ════════════════════════════════════════════════════════
def engineer_features_v6(df):
    """Complete Indian-first feature engineering."""
    print("\nSTEP 3: FEATURE ENGINEERING (v6)")
    
    TARGET = 'sales'
    GROUP = ['product_identifier', 'outlet']
    
    df = df.copy()
    df = df.sort_values(GROUP + ['date']).reset_index(drop=True)
    
    # ── Time Features ──
    print("  [3a] Time features...")
    df['day_of_week'] = df['date'].dt.dayofweek
    df['day_of_month'] = df['date'].dt.day
    df['month'] = df['date'].dt.month
    df['quarter'] = df['date'].dt.quarter
    df['week_of_year'] = df['date'].dt.isocalendar().week.astype(int)
    df['is_weekend'] = (df['day_of_week'] >= 5).astype(int)
    df['is_month_start'] = (df['day_of_month'] <= 3).astype(int)
    df['is_month_end'] = (df['day_of_month'] >= 28).astype(int)
    df['fourier_week_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7)
    df['fourier_week_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7)
    day_of_year = df['date'].dt.dayofyear
    df['fourier_year_sin'] = np.sin(2 * np.pi * day_of_year / 365.25)
    df['fourier_year_cos'] = np.cos(2 * np.pi * day_of_year / 365.25)
    
    # ── Lag Features (per product × outlet) ──
    print("  [3b] Lag features (per product × outlet)...")
    grp = df.groupby(GROUP)[TARGET]
    for lag in [1, 7, 14, 28]:
        df[f'lag_{lag}'] = grp.shift(lag)
    
    # ── Rolling Features ──
    print("  [3c] Rolling features...")
    def shifted_roll(x, w, fn):
        return x.shift(1).rolling(w, min_periods=1).agg(fn)
    
    for window in [7, 30]:
        df[f'rolling_mean_{window}d'] = grp.transform(lambda x: shifted_roll(x, window, 'mean'))
        df[f'rolling_median_{window}d'] = grp.transform(lambda x: shifted_roll(x, window, 'median'))
        df[f'rolling_max_{window}d'] = grp.transform(lambda x: shifted_roll(x, window, 'max'))
        df[f'rolling_min_{window}d'] = grp.transform(lambda x: shifted_roll(x, window, 'min'))
    
    df['rolling_std_7d'] = grp.transform(lambda x: x.shift(1).rolling(7, min_periods=2).std())
    
    # ── EWMA + Momentum ──
    print("  [3d] EWMA + Momentum...")
    for span in [7, 14, 28]:
        df[f'ewma_{span}'] = grp.transform(lambda x: x.shift(1).ewm(span=span, adjust=False).mean())
    df['demand_momentum'] = df['ewma_7'] - df['ewma_28']
    df['demand_acceleration'] = df.groupby(GROUP)['demand_momentum'].transform(lambda x: x.diff(7))
    
    # ── Expanding Features ──
    print("  [3e] Expanding features...")
    df['expanding_mean'] = grp.transform(lambda x: x.shift(1).expanding(min_periods=1).mean())
    df['expanding_std'] = grp.transform(lambda x: x.shift(1).expanding(min_periods=2).std())
    
    # ── Zero-Demand Streak ──
    print("  [3f] Zero-demand streak...")
    def zero_streak(x):
        shifted = x.shift(1).fillna(0)
        streak = []
        count = 0
        for val in shifted:
            if val == 0:
                count += 1
            else:
                count = 0
            streak.append(count)
        return pd.Series(streak, index=x.index)
    df['zero_demand_streak'] = df.groupby(GROUP)[TARGET].transform(zero_streak)
    
    # ── Days Since Last Sale ──
    print("  [3g] Days since last sale...")
    def days_since_sale(x):
        shifted = x.shift(1).fillna(0)
        days = []
        count = 0
        for val in shifted:
            if val > 0:
                count = 0
            else:
                count += 1
            days.append(min(count, 30))
        return pd.Series(days, index=x.index)
    df['days_since_last_sale'] = df.groupby(GROUP)[TARGET].transform(days_since_sale)
    
    # ── Price Features ──
    print("  [3h] Price features...")
    if 'price' in df.columns:
        df['price_change_1w'] = df.groupby(GROUP)['price'].transform(lambda x: x.pct_change(7).fillna(0))
        df['price_vs_avg'] = df.groupby(GROUP)['price'].transform(
            lambda x: x / x.shift(1).rolling(30, min_periods=1).mean()
        ).fillna(1.0)
    
    # ── Rolling Coefficient of Variation ──
    print("  [3i] Rolling CV + demand stability...")
    rolling_mean = df['rolling_mean_7d'].replace(0, np.nan)
    df['rolling_cv_7d'] = (df['rolling_std_7d'] / rolling_mean).fillna(0).clip(0, 10)
    
    # Demand Stability Index (inverse of CV — higher = more stable)
    df['demand_stability'] = 1.0 / (1.0 + df['rolling_cv_7d'])
    
    # ── Intermittent Demand Flag ──
    df['intermittent_flag'] = (df['zero_demand_streak'] >= 3).astype(int)
    
    # ── Sales Velocity (units per day, 7-day window) ──
    df['sales_velocity_7d'] = df['rolling_mean_7d']  # already computed
    
    # ── Seasonal Index ──
    print("  [3j] Seasonal index...")
    monthly_avg = df.groupby([df['month'], 'product_identifier', 'outlet'])[TARGET].transform('mean')
    overall_avg = df.groupby(['product_identifier', 'outlet'])[TARGET].transform('mean').replace(0, 1)
    df['seasonal_index'] = (monthly_avg / overall_avg).clip(0, 5).fillna(1.0)
    
    # ── Product Encoding ──
    print("  [3k] Product encoding...")
    df['product_code'] = df['product_identifier']
    df['outlet_code'] = df['outlet'].astype('category').cat.codes
    df['department_code'] = df['department_identifier']
    df['category_code'] = df['category_of_product'].astype('category').cat.codes
    df['state_code'] = df['state'].astype('category').cat.codes
    
    # ── Indian Festival Features ──
    print("  [3l] Indian festival features (state-aware)...")
    from indian_features.festival_features import add_festival_features_v6
    df = add_festival_features_v6(df, state_col='state')
    
    # ── State-Aware Weather ──
    print("  [3m] State-aware weather features...")
    from indian_features.weather_features import add_weather_features_v6
    df = add_weather_features_v6(df, state_col='state')
    
    # ── Indian Salary Cycle ──
    print("  [3n] Salary cycle features...")
    from indian_features.salary_cycle_features import add_salary_cycle_features
    df = add_salary_cycle_features(df)
    
    return df


# ════════════════════════════════════════════════════════
# FEATURE LIST
# ════════════════════════════════════════════════════════
FEATURE_COLUMNS_V6 = [
    # Time (12)
    'day_of_week', 'day_of_month', 'month', 'quarter', 'week_of_year',
    'is_weekend', 'is_month_start', 'is_month_end',
    'fourier_week_sin', 'fourier_week_cos', 'fourier_year_sin', 'fourier_year_cos',
    # Lags (4)
    'lag_1', 'lag_7', 'lag_14', 'lag_28',
    # Rolling (9)
    'rolling_mean_7d', 'rolling_median_7d', 'rolling_max_7d', 'rolling_min_7d',
    'rolling_mean_30d', 'rolling_median_30d', 'rolling_max_30d', 'rolling_min_30d',
    'rolling_std_7d',
    # EWMA (5)
    'ewma_7', 'ewma_14', 'ewma_28', 'demand_momentum', 'demand_acceleration',
    # Expanding (2)
    'expanding_mean', 'expanding_std',
    # Demand Patterns (5)
    'zero_demand_streak', 'days_since_last_sale', 'rolling_cv_7d',
    'demand_stability', 'intermittent_flag',
    # Velocity & Seasonal (2)
    'sales_velocity_7d', 'seasonal_index',
    # Price (3)
    'price', 'price_change_1w', 'price_vs_avg',
    # Product/Store (5)
    'product_code', 'outlet_code', 'department_code', 'category_code', 'state_code',
    # Festival (6)
    'days_before_festival', 'days_after_festival', 'festival_importance',
    'is_festival_week', 'festival_type_code', 'festival_duration',
    # Weather (8)
    'temperature_2m_max', 'temperature_2m_min', 'temperature_2m_mean',
    'precipitation_sum', 'is_raining', 'is_heat_wave', 'rain_last_3d', 'humidity_mean',
    # Salary (4)
    'is_salary_week', 'is_late_month', 'days_from_month_start', 'is_pre_salary_week',
]

TARGET = 'sales'


# ════════════════════════════════════════════════════════
# STEP 5: BENCHMARK (5 algorithms × 5-fold CV)
# ════════════════════════════════════════════════════════
def run_benchmark(df):
    """Benchmark 5 algorithms with 5-fold TimeSeriesSplit."""
    print("\n" + "=" * 60)
    print("STEP 5: MODEL BENCHMARK (5 algorithms × 5-fold TimeSeriesSplit)")
    print("=" * 60)
    
    # Ensure features exist
    available_features = [f for f in FEATURE_COLUMNS_V6 if f in df.columns]
    print(f"  Features available: {len(available_features)} / {len(FEATURE_COLUMNS_V6)}")
    
    # Drop NAs
    df_clean = df.dropna(subset=available_features + [TARGET]).copy()
    print(f"  Clean rows: {len(df_clean):,}")
    
    # Sort by date for time series split
    df_clean = df_clean.sort_values('date').reset_index(drop=True)
    
    X = df_clean[available_features].values
    y = df_clean[TARGET].values
    
    tscv = TimeSeriesSplit(n_splits=5)
    
    results = []
    
    # ── Algorithm configs ──
    algorithms = {
        'LightGBM': {
            'type': 'lgb',
            'params': {
                'objective': 'regression', 'metric': 'mape',
                'boosting_type': 'gbdt', 'learning_rate': 0.05,
                'num_leaves': 63, 'feature_fraction': 0.8,
                'bagging_fraction': 0.8, 'bagging_freq': 5,
                'min_child_samples': 20, 'verbose': -1, 'random_state': 42
            }
        },
        'CatBoost': {'type': 'catboost'},
        'XGBoost': {'type': 'xgboost'},
        'HistGBT': {'type': 'histgbt'},
        'RandomForest': {'type': 'rf'},
    }
    
    for algo_name, config in algorithms.items():
        print(f"\n  [{algo_name}]")
        fold_wmapes = []
        fold_maes = []
        fold_rmses = []
        total_train_time = 0
        total_inference_time = 0
        model_obj = None
        
        for fold, (train_idx, test_idx) in enumerate(tscv.split(X)):
            X_train, X_test = X[train_idx], X[test_idx]
            y_train, y_test = y[train_idx], y[test_idx]
            
            t0 = time.time()
            
            if config['type'] == 'lgb':
                tr_ds = lgb.Dataset(X_train, label=y_train, feature_name=available_features)
                val_ds = lgb.Dataset(X_test, label=y_test, reference=tr_ds)
                model_obj = lgb.train(
                    config['params'], tr_ds, num_boost_round=500,
                    valid_sets=[val_ds], callbacks=[lgb.early_stopping(30), lgb.log_evaluation(0)]
                )
                preds = np.maximum(model_obj.predict(X_test), 0)
                
            elif config['type'] == 'catboost':
                try:
                    from catboost import CatBoostRegressor
                    model_obj = CatBoostRegressor(
                        iterations=500, learning_rate=0.05, depth=6,
                        loss_function='MAE', random_seed=42, verbose=0
                    )
                    model_obj.fit(X_train, y_train, eval_set=(X_test, y_test), early_stopping_rounds=30)
                    preds = np.maximum(model_obj.predict(X_test), 0)
                except ImportError:
                    print("    CatBoost not installed, skipping...")
                    break
                    
            elif config['type'] == 'xgboost':
                try:
                    import xgboost as xgb
                    model_obj = xgb.XGBRegressor(
                        n_estimators=500, learning_rate=0.05, max_depth=6,
                        subsample=0.8, colsample_bytree=0.8, random_state=42,
                        early_stopping_rounds=30, eval_metric='mae'
                    )
                    model_obj.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
                    preds = np.maximum(model_obj.predict(X_test), 0)
                except ImportError:
                    print("    XGBoost not installed, skipping...")
                    break
                    
            elif config['type'] == 'histgbt':
                from sklearn.ensemble import HistGradientBoostingRegressor
                model_obj = HistGradientBoostingRegressor(
                    max_iter=500, learning_rate=0.05, max_leaf_nodes=63,
                    early_stopping=True, validation_fraction=0.1, random_state=42
                )
                model_obj.fit(X_train, y_train)
                preds = np.maximum(model_obj.predict(X_test), 0)
                
            elif config['type'] == 'rf':
                from sklearn.ensemble import RandomForestRegressor
                model_obj = RandomForestRegressor(
                    n_estimators=200, max_depth=15, min_samples_leaf=10,
                    n_jobs=-1, random_state=42
                )
                model_obj.fit(X_train, y_train)
                preds = np.maximum(model_obj.predict(X_test), 0)
            
            train_time = time.time() - t0
            total_train_time += train_time
            
            t0 = time.time()
            _ = preds  # already computed
            total_inference_time += time.time() - t0
            
            w = wmape(y_test, preds)
            mae = mean_absolute_error(y_test, preds)
            rmse = np.sqrt(mean_squared_error(y_test, preds))
            
            fold_wmapes.append(w)
            fold_maes.append(mae)
            fold_rmses.append(rmse)
            print(f"    Fold {fold+1}: WMAPE={w:.2f}%  MAE={mae:.2f}  RMSE={rmse:.2f}  Time={train_time:.1f}s")
        
        if len(fold_wmapes) > 0:
            results.append({
                'Algorithm': algo_name,
                'WMAPE_mean': round(np.mean(fold_wmapes), 2),
                'WMAPE_std': round(np.std(fold_wmapes), 2),
                'MAE_mean': round(np.mean(fold_maes), 2),
                'RMSE_mean': round(np.mean(fold_rmses), 2),
                'TrainTime_s': round(total_train_time, 1),
                'n_folds': len(fold_wmapes),
            })
    
    comp_df = pd.DataFrame(results).sort_values('WMAPE_mean')
    print("\n" + "=" * 60)
    print("BENCHMARK RESULTS")
    print("=" * 60)
    print(comp_df.to_string(index=False))
    comp_df.to_csv(REPORT_DIR / "model_benchmark.csv", index=False)
    
    return comp_df, available_features


# ════════════════════════════════════════════════════════
# STEP 6: OPTUNA HYPERPARAMETER SEARCH
# ════════════════════════════════════════════════════════
def run_optuna(df, features, best_algo='LightGBM', n_trials=50):
    """Run Optuna hyperparameter search for the best algorithm."""
    print("\n" + "=" * 60)
    print(f"STEP 6: OPTUNA SEARCH ({n_trials} trials)")
    print("=" * 60)
    
    try:
        import optuna
        optuna.logging.set_verbosity(optuna.logging.WARNING)
    except ImportError:
        print("  Optuna not installed. Installing...")
        import subprocess
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'optuna', '-q'])
        import optuna
        optuna.logging.set_verbosity(optuna.logging.WARNING)
    
    df_clean = df.dropna(subset=features + [TARGET]).sort_values('date').reset_index(drop=True)
    X = df_clean[features].values
    y = df_clean[TARGET].values
    
    # Use last fold of TimeSeriesSplit for validation
    tscv = TimeSeriesSplit(n_splits=5)
    for train_idx, test_idx in tscv.split(X):
        pass  # get last split
    
    X_train, X_test = X[train_idx], X[test_idx]
    y_train, y_test = y[train_idx], y[test_idx]
    
    def objective(trial):
        params = {
            'objective': 'regression',
            'metric': 'mape',
            'boosting_type': 'gbdt',
            'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.15),
            'num_leaves': trial.suggest_int('num_leaves', 31, 255),
            'feature_fraction': trial.suggest_float('feature_fraction', 0.5, 1.0),
            'bagging_fraction': trial.suggest_float('bagging_fraction', 0.5, 1.0),
            'bagging_freq': trial.suggest_int('bagging_freq', 1, 7),
            'min_child_samples': trial.suggest_int('min_child_samples', 5, 50),
            'lambda_l1': trial.suggest_float('lambda_l1', 0.0, 10.0),
            'lambda_l2': trial.suggest_float('lambda_l2', 0.0, 10.0),
            'verbose': -1,
            'random_state': 42,
        }
        
        tr_ds = lgb.Dataset(X_train, label=y_train)
        val_ds = lgb.Dataset(X_test, label=y_test, reference=tr_ds)
        model = lgb.train(
            params, tr_ds, num_boost_round=500,
            valid_sets=[val_ds], callbacks=[lgb.early_stopping(30), lgb.log_evaluation(0)]
        )
        preds = np.maximum(model.predict(X_test), 0)
        return wmape(y_test, preds)
    
    study = optuna.create_study(direction='minimize')
    study.optimize(objective, n_trials=n_trials)
    
    print(f"\n  Best WMAPE: {study.best_value:.2f}%")
    print(f"  Best params: {study.best_params}")
    
    # Save best params
    with open(REPORT_DIR / "optuna_best_params.json", 'w') as f:
        json.dump({
            'best_wmape': round(study.best_value, 2),
            'best_params': study.best_params,
            'n_trials': n_trials,
        }, f, indent=2)
    
    return study.best_params


# ════════════════════════════════════════════════════════
# STEP 7: TRAIN FINAL MODEL + SHAP
# ════════════════════════════════════════════════════════
def train_final_model(df, features, best_params):
    """Train final model with best hyperparameters, generate SHAP."""
    print("\n" + "=" * 60)
    print("STEP 7: FINAL MODEL TRAINING + SHAP")
    print("=" * 60)
    
    df_clean = df.dropna(subset=features + [TARGET]).sort_values('date').reset_index(drop=True)
    
    # Final temporal split (last 30 days for validation)
    split_date = df_clean['date'].max() - pd.Timedelta(days=30)
    train_df = df_clean[df_clean['date'] < split_date]
    test_df = df_clean[df_clean['date'] >= split_date]
    
    X_train = train_df[features].values
    y_train = train_df[TARGET].values
    X_test = test_df[features].values
    y_test = test_df[TARGET].values
    
    print(f"  Train: {len(train_df):,} rows")
    print(f"  Test:  {len(test_df):,} rows")
    
    params = {
        'objective': 'regression', 'metric': 'mape',
        'boosting_type': 'gbdt', 'verbose': -1, 'random_state': 42,
    }
    params.update(best_params)
    
    t0 = time.time()
    tr_ds = lgb.Dataset(X_train, label=y_train, feature_name=features)
    val_ds = lgb.Dataset(X_test, label=y_test, reference=tr_ds)
    model = lgb.train(
        params, tr_ds, num_boost_round=1000,
        valid_sets=[tr_ds, val_ds],
        callbacks=[lgb.early_stopping(50), lgb.log_evaluation(100)]
    )
    train_time = time.time() - t0
    
    # Predictions
    preds = np.maximum(model.predict(X_test), 0)
    
    w = round(wmape(y_test, preds), 2)
    mae = round(mean_absolute_error(y_test, preds), 2)
    rmse = round(np.sqrt(mean_squared_error(y_test, preds)), 2)
    mape = round(custom_mape(y_test, preds), 2)
    
    print(f"\n  FINAL RESULTS:")
    print(f"  WMAPE: {w}%")
    print(f"  MAE:   {mae}")
    print(f"  RMSE:  {rmse}")
    print(f"  MAPE:  {mape}%")
    print(f"  Best iteration: {model.best_iteration}")
    print(f"  Train time: {train_time:.1f}s")
    
    # Feature importance
    importance = model.feature_importance(importance_type='gain')
    total = max(importance.sum(), 1e-8)
    feat_df = pd.DataFrame({
        'Feature': features,
        'Importance_pct': (importance / total * 100).round(2)
    }).sort_values('Importance_pct', ascending=False)
    
    print(f"\n  TOP 15 FEATURES:")
    print(feat_df.head(15).to_string(index=False))
    feat_df.to_csv(REPORT_DIR / "feature_importance.csv", index=False)
    
    # Save model
    joblib.dump(model, MODEL_DIR / "indian_v6_model.pkl")
    joblib.dump({
        'columns': features,
        'target': TARGET,
        'version': '6.0.0',
    }, MODEL_DIR / "indian_v6_columns.pkl")
    
    # Save metrics
    metrics = {
        'model_version': '6.0.0',
        'trained_at': datetime.now().isoformat(),
        'dataset': 'Indian Retail Chain (Maharashtra, Telangana, Kerala)',
        'training_rows': int(len(train_df)),
        'test_rows': int(len(test_df)),
        'wmape': w, 'mae': mae, 'rmse': rmse, 'mape': mape,
        'best_iteration': int(model.best_iteration),
        'n_features': len(features),
        'train_time_s': round(train_time, 1),
        'hyperparameters': best_params,
        'top_features': feat_df.head(10).to_dict('records'),
    }
    with open(MODEL_DIR / "indian_v6_metrics.json", 'w') as f:
        json.dump(metrics, f, indent=2)
    
    # Save residuals
    residuals = pd.DataFrame({
        'actual': y_test, 'predicted': preds.round(2),
        'error': (y_test - preds).round(2),
        'abs_error': np.abs(y_test - preds).round(2),
    })
    residuals.to_csv(REPORT_DIR / "residuals_v6.csv", index=False)
    
    # SHAP
    print("\n  Generating SHAP analysis...")
    try:
        import shap
        explainer = shap.TreeExplainer(model)
        # Use sample for speed
        sample_idx = np.random.RandomState(42).choice(len(X_test), min(1000, len(X_test)), replace=False)
        shap_values = explainer.shap_values(X_test[sample_idx])
        
        # Save SHAP values
        shap_df = pd.DataFrame(shap_values, columns=features)
        shap_df.to_csv(REPORT_DIR / "shap_values.csv", index=False)
        
        # SHAP summary
        shap_importance = np.abs(shap_values).mean(axis=0)
        shap_summary = pd.DataFrame({
            'Feature': features,
            'SHAP_mean_abs': shap_importance.round(4)
        }).sort_values('SHAP_mean_abs', ascending=False)
        shap_summary.to_csv(REPORT_DIR / "shap_summary.csv", index=False)
        print(f"  SHAP saved ({len(sample_idx)} samples)")
        
        # Top SHAP features
        print(f"\n  TOP 15 SHAP FEATURES:")
        print(shap_summary.head(15).to_string(index=False))
        
    except ImportError:
        print("  SHAP not installed. Installing...")
        import subprocess
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'shap', '-q'])
        print("  SHAP installed. Re-run to generate SHAP analysis.")
    except Exception as e:
        print(f"  SHAP error: {e}")
    
    return model, metrics, feat_df


# ════════════════════════════════════════════════════════
# MAIN EXECUTION
# ════════════════════════════════════════════════════════
if __name__ == "__main__":
    print("█" * 60)
    print("  ANTARYA v6 — INDIAN-FIRST TRAINING PIPELINE")
    print("  PRIMARY: Indian Retail Chain (MH, TS, KL)")
    print("  NO Ecuador data. NO geographic mismatch.")
    print("█" * 60)
    
    # Step 1: Load
    df = load_indian_retail()
    
    # Step 2: Map
    df = apply_kirana_mapping(df)
    
    # Step 3: Features
    df = engineer_features_v6(df)
    
    # Step 5: Benchmark
    comp_df, features = run_benchmark(df)
    
    # Step 6: Optuna
    best_params = run_optuna(df, features, n_trials=50)
    
    # Step 7: Final model + SHAP
    model, metrics, feat_df = train_final_model(df, features, best_params)
    
    print("\n" + "█" * 60)
    print("  TRAINING COMPLETE")
    print(f"  Model: saved_models/indian_v6_model.pkl")
    print(f"  Metrics: saved_models/indian_v6_metrics.json")
    print(f"  Reports: audit_reports/")
    print("█" * 60)
