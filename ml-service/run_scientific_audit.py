"""
ANTARYA — Final Scientific ML Validation Audit
Calculates metrics verification, dataset distribution, business-level evaluation,
baselines comparison, and business impact for Kirana stores.
"""
import sys, io, time, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from pathlib import Path
import numpy as np
import pandas as pd
import joblib
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.linear_model import LinearRegression

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data" / "indian_retail"
MODEL_DIR = BASE_DIR / "saved_models"
REPORT_DIR = BASE_DIR / "audit_reports"

def wmape(y_true, y_pred):
    return np.sum(np.abs(y_true - y_pred)) / max(np.sum(np.abs(y_true)), 1e-8) * 100

def custom_mape(y_true, y_pred):
    return np.mean(np.abs((y_true - y_pred) / np.maximum(y_true, 1))) * 100

print("====================================================")
print("STEP 1: VERIFYING METRICS & WMAPE FORMULA")
print("====================================================")
res_file = REPORT_DIR / "residuals_v6.csv"
if res_file.exists():
    res_df = pd.read_csv(res_file)
    y_true = res_df['actual'].values
    y_pred = res_df['predicted'].values
    
    calc_wmape = wmape(y_true, y_pred)
    calc_mae = mean_absolute_error(y_true, y_pred)
    calc_rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    calc_mape = custom_mape(y_true, y_pred)
    mean_actual = np.mean(y_true)
    
    print(f"Residuals rows: {len(res_df):,}")
    print(f"Sum of absolute errors (Numerator): {np.sum(np.abs(y_true - y_pred)):,.2f}")
    print(f"Sum of actual sales (Denominator):  {np.sum(y_true):,.2f}")
    print(f"Mean Actual Daily Sales (y_bar):    {mean_actual:.4f} units")
    print(f"Calculated MAE:                     {calc_mae:.4f} units")
    print(f"Calculated WMAPE (Numerator/Denom): {calc_wmape:.4f}%")
    print(f"Mathematical Check (MAE / y_bar):   {(calc_mae / mean_actual * 100):.4f}%")
    print(f"Calculated RMSE:                    {calc_rmse:.4f} units")
    print(f"Calculated MAPE:                    {calc_mape:.4f}%")
    
    zero_mask = (y_true == 0)
    nz_mask = (y_true > 0)
    print(f"\nZero-Sales Rows Analysis (Test Set):")
    print(f"  Total zero-sales rows: {zero_mask.sum():,} ({zero_mask.sum()/len(y_true)*100:.1f}%)")
    print(f"  Mean prediction on zero-sales days: {np.mean(y_pred[zero_mask]):.4f} units")
    print(f"  Contribution of zero-sales days to WMAPE Numerator: {np.sum(y_pred[zero_mask]):,.2f} / {np.sum(np.abs(y_true - y_pred)):,.2f} ({np.sum(y_pred[zero_mask])/np.sum(np.abs(y_true - y_pred))*100:.1f}%)")
    print(f"  Contribution of zero-sales days to WMAPE Denominator: 0.00")
    print(f"  MAE on non-zero sales days: {mean_absolute_error(y_true[nz_mask], y_pred[nz_mask]):.4f} units (mean actual = {np.mean(y_true[nz_mask]):.4f})")
    print(f"  WMAPE on non-zero sales days only: {wmape(y_true[nz_mask], y_pred[nz_mask]):.2f}%")

print("\n====================================================")
print("STEP 2: DATASET ANALYSIS")
print("====================================================")
train_df = pd.read_csv(DATA_DIR / "train_data.csv")
print(f"Total rows:      {len(train_df):,}")
print(f"Total products:  {train_df['product_identifier'].nunique()}")
print(f"Total outlets:   {train_df['outlet'].nunique()}")
print(f"States:          {train_df['state'].unique().tolist()}")
print(f"Average sales:   {train_df['sales'].mean():.4f} units/day")
print(f"Median sales:    {train_df['sales'].median():.4f} units/day")
print(f"Max sales:       {train_df['sales'].max():.4f} units/day")

zeros_cnt = (train_df['sales'] == 0).sum()
le1_cnt = (train_df['sales'] <= 1).sum()
le2_cnt = (train_df['sales'] <= 2).sum()
print(f"Percentage of rows where sales = 0:  {zeros_cnt / len(train_df) * 100:.2f}%")
print(f"Percentage of rows where sales <= 1: {le1_cnt / len(train_df) * 100:.2f}%")
print(f"Percentage of rows where sales <= 2: {le2_cnt / len(train_df) * 100:.2f}%")

prod_stats = train_df.groupby('product_identifier')['sales'].agg(['count', 'mean', lambda x: (x==0).mean()*100]).reset_index()
prod_stats.columns = ['product_identifier', 'rows', 'mean_sales', 'zero_pct']
intermittent_prods = prod_stats[prod_stats['zero_pct'] > 50]
print(f"Percentage of intermittent demand products (>50% zeros): {len(intermittent_prods)} / {len(prod_stats)} ({len(intermittent_prods)/len(prod_stats)*100:.1f}%)")
print(f"Percentage of highly intermittent products (>70% zeros): {(prod_stats['zero_pct'] > 70).sum()} / {len(prod_stats)} ({(prod_stats['zero_pct'] > 70).sum()/len(prod_stats)*100:.1f}%)")

print("\n====================================================")
print("STEP 3: BUSINESS LEVEL EVALUATION")
print("====================================================")
from train_v6 import load_indian_retail
if res_file.exists():
    df = load_indian_retail()
    df['date'] = pd.to_datetime(df['date'])
    from utils.kirana_mapper import map_retail_chain
    df = map_retail_chain(df)
    
    split_date = df['date'].max() - pd.Timedelta(days=30)
    test_slice = df[df['date'] >= split_date].copy().sort_values('date').reset_index(drop=True)
    if len(test_slice) == len(res_df):
        test_slice['predicted'] = res_df['predicted'].values
        
        outlet_wmape = test_slice.groupby(['outlet', 'state']).apply(
            lambda g: pd.Series({
                'wmape': wmape(g['sales'], g['predicted']),
                'mae': mean_absolute_error(g['sales'], g['predicted']),
                'mean_sales': g['sales'].mean()
            })
        ).reset_index().sort_values('wmape')
        print("\nWMAPE BY OUTLET:")
        print(outlet_wmape.to_string(index=False))
        
        state_wmape = test_slice.groupby('state').apply(
            lambda g: pd.Series({
                'wmape': wmape(g['sales'], g['predicted']),
                'mae': mean_absolute_error(g['sales'], g['predicted']),
                'mean_sales': g['sales'].mean()
            })
        ).reset_index().sort_values('wmape')
        print("\nWMAPE BY STATE:")
        print(state_wmape.to_string(index=False))
        
        cat_wmape = test_slice.groupby('kirana_category').apply(
            lambda g: pd.Series({
                'wmape': wmape(g['sales'], g['predicted']),
                'mae': mean_absolute_error(g['sales'], g['predicted']),
                'mean_sales': g['sales'].mean()
            })
        ).reset_index().sort_values('wmape')
        print("\nWMAPE BY CATEGORY:")
        print(cat_wmape.to_string(index=False))
        
        prod_perf = test_slice.groupby(['product_identifier', 'kirana_category']).apply(
            lambda g: pd.Series({
                'wmape': wmape(g['sales'], g['predicted']),
                'mae': mean_absolute_error(g['sales'], g['predicted']),
                'mean_sales': g['sales'].mean(),
                'zero_pct': (g['sales']==0).mean()*100
            })
        ).reset_index()
        
        print("\nTOP 10 EASIEST PRODUCTS (Lowest WMAPE):")
        print(prod_perf.sort_values('wmape').head(10).to_string(index=False))
        
        print("\nTOP 10 HARDEST PRODUCTS (Highest WMAPE):")
        print(prod_perf.sort_values('wmape', ascending=False).head(10).to_string(index=False))

print("\n====================================================")
print("STEP 4: BASELINE COMPARISON ON TEST SET")
print("====================================================")
if res_file.exists() and len(test_slice) == len(res_df):
    df = df.sort_values(['product_identifier', 'outlet', 'date']).reset_index(drop=True)
    df['lag_1'] = df.groupby(['product_identifier', 'outlet'])['sales'].shift(1).fillna(df['sales'].median())
    df['ma_7'] = df.groupby(['product_identifier', 'outlet'])['sales'].transform(lambda x: x.shift(1).rolling(7, min_periods=1).mean()).fillna(df['sales'].median())
    
    test_slice_w_lags = df[df['date'] >= split_date].sort_values('date').reset_index(drop=True)
    
    y_test_clean = test_slice_w_lags['sales'].values
    y_naive = test_slice_w_lags['lag_1'].values
    y_ma7 = test_slice_w_lags['ma_7'].values
    
    train_slice_w_lags = df[df['date'] < split_date].dropna(subset=['lag_1', 'ma_7', 'price', 'sales'])
    lr = LinearRegression()
    lr.fit(train_slice_w_lags[['lag_1', 'ma_7', 'price']], train_slice_w_lags['sales'])
    y_lr = np.maximum(0, lr.predict(test_slice_w_lags[['lag_1', 'ma_7', 'price']].fillna(0)))
    
    y_lgb = res_df['predicted'].values
    
    baselines = [
        ("Naive Forecast (Lag 1)", wmape(y_test_clean, y_naive), mean_absolute_error(y_test_clean, y_naive)),
        ("7-Day Moving Average", wmape(y_test_clean, y_ma7), mean_absolute_error(y_test_clean, y_ma7)),
        ("Linear Regression", wmape(y_test_clean, y_lr), mean_absolute_error(y_test_clean, y_lr)),
        ("Final LightGBM (v6 Tuned)", wmape(y_test_clean, y_lgb), mean_absolute_error(y_test_clean, y_lgb)),
        ("CatBoost Benchmark (5-Fold Mean)", 70.27, 0.86),
    ]
    
    print("\nBASELINE COMPARISON TABLE:")
    print(f"{'Model':<30} | {'WMAPE (%)':<12} | {'MAE (units)':<12}")
    print("-" * 58)
    for name, w, m in baselines:
        print(f"{name:<30} | {w:<12.2f} | {m:<12.2f}")
