"""
ANTARYA Unified Feature Store
==============================
Merges base transaction data (Favorita/POS) with all Indian external signals.
Removes Ecuador-specific features (like old holidays).
"""

import pandas as pd
import sys
from pathlib import Path

# Add parent dir to path so imports work
sys.path.append(str(Path(__file__).parent.parent))

from indian_features.festival_features import add_festival_features
from indian_features.weather_features import add_weather_features
from indian_features.salary_cycle_features import add_salary_cycle_features
from indian_features.price_features import add_price_features
from utils.features_v2 import engineer_features_v2, TARGET_COLUMN

def build_unified_features(df, is_training=True):
    """
    Takes a raw transaction dataframe (date, item_nbr, family, unit_sales, onpromotion).
    Returns a unified dataframe with all Indian signals.
    """
    print("\n" + "="*60)
    print("BUILDING UNIFIED FEATURE STORE (INDIAN SIGNALS)")
    print("="*60)
    
    # 1. Base time + sales features (Lags, EWMA, Rolling)
    print("  [1/5] Base Time & Sales History...")
    # Note: we pass holidays_df=None to ensure Ecuador holidays are ignored
    df = engineer_features_v2(df, holidays_df=None, is_training=is_training)
    
    # Clean up old Ecuador holiday columns if they were generated
    ecuador_cols = ['is_holiday', 'days_to_holiday', 'days_since_holiday']
    for c in ecuador_cols:
        if c in df.columns:
            df = df.drop(columns=[c])
            
    # 2. Indian Festivals
    print("  [2/5] Indian Festival Calendar...")
    df = add_festival_features(df)
    
    # 3. Hyderabad Weather
    print("  [3/5] Hyderabad Weather...")
    df = add_weather_features(df)
    
    # 4. Indian Salary Cycle
    print("  [4/5] Indian Salary Cycle...")
    df = add_salary_cycle_features(df)
    
    # 5. AGMARKNET Commodity Prices
    print("  [5/5] AGMARKNET Commodity Prices...")
    df = add_price_features(df)
    
    # Define the final unified feature list dynamically
    base_cols = [
        'day_of_week', 'day_of_month', 'month', 'quarter', 'week_of_year',
        'is_weekend', 'is_month_start', 'is_month_end',
        'fourier_week_sin', 'fourier_week_cos', 'fourier_year_sin', 'fourier_year_cos',
        'lag_1', 'lag_7', 'lag_14', 'lag_28',
        'rolling_mean_7d', 'rolling_median_7d', 'rolling_max_7d', 'rolling_min_7d',
        'rolling_mean_30d', 'rolling_median_30d', 'rolling_max_30d', 'rolling_min_30d',
        'rolling_std_7d', 'ewma_7', 'ewma_14', 'ewma_28',
        'demand_momentum', 'demand_acceleration', 'expanding_mean', 'expanding_std',
        'onpromotion', 'promo_streak', 'days_since_promo', 'zero_demand_streak', 'family_code'
    ]
    
    festival_cols = ['days_before_festival', 'days_after_festival', 'festival_importance', 'is_festival_week']
    weather_cols = ['temperature_2m_max', 'precipitation_sum', 'is_raining', 'is_heat_wave', 'rain_last_3d']
    salary_cols = ['is_salary_week', 'is_late_month', 'days_from_month_start', 'is_pre_salary_week']
    
    # Price columns will vary depending on commodities found
    price_cols = [c for c in df.columns if c.startswith('price_')]
    
    unified_columns = base_cols + festival_cols + weather_cols + salary_cols + price_cols
    
    # Drop rows with NAs in essential base columns (like lags)
    df = df.dropna(subset=base_cols + [TARGET_COLUMN])
    
    print(f"\nUnified Feature Store ready: {len(df):,} rows, {len(unified_columns)} features")
    return df, unified_columns
