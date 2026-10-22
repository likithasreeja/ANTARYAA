"""
ANTARYA ML Service — Feature Engineering Pipeline
====================================================
🧠 CONCEPT: What is Feature Engineering?

Imagine you're trying to predict how many milk packets you'll sell tomorrow.
You could just look at today's sales... but that's not enough.

What if tomorrow is Sunday? (People buy more on weekends)
What if there's a festival? (Demand spikes)
What if there's a promotion? (More sales)
What if sales have been trending UP for the last 7 days?

Feature Engineering = Creating ALL these "clues" from raw data 
so the model can learn patterns.

We create 18 features from each day's sales:
- 6 Time features (day of week, month, etc.)
- 4 Lag features (what happened 1, 7, 14, 28 days ago)
- 3 Rolling features (average of last 7/30 days, volatility)
- 1 Trend feature (is demand going up or down?)
- 2 Event features (holiday, promotion)
- 1 Product feature (what category is this?)
- 1 Price feature (current price)
"""

import pandas as pd
import numpy as np


def create_time_features(df):
    """
    📅 TIME FEATURES
    The model needs to know WHEN something happened.
    
    Example: If today is Sunday → day_of_week = 6
    The model learns: "On Sundays, milk sells 24% more"
    """
    df = df.copy()
    df['date'] = pd.to_datetime(df['date'])
    df['day_of_week'] = df['date'].dt.dayofweek       # 0=Monday, 6=Sunday
    df['day_of_month'] = df['date'].dt.day             # 1-31
    df['month'] = df['date'].dt.month                   # 1-12
    df['is_weekend'] = (df['day_of_week'] >= 5).astype(int)  # 1 if Sat/Sun
    df['is_month_start'] = (df['day_of_month'] <= 3).astype(int)  # Salary days!
    df['is_month_end'] = (df['day_of_month'] >= 28).astype(int)
    return df


def create_lag_features(df, target_col='unit_sales', group_col='family'):
    """
    ⏪ LAG FEATURES
    "What happened X days ago?"
    
    Example: If you sold 30 milk packets last Monday,
    and today is Monday → lag_7 = 30
    
    The model learns: "Mondays usually sell about the same as last Monday"
    
    We look back 1, 7, 14, and 28 days.
    """
    df = df.copy()
    for lag in [1, 7, 14, 28]:
        df[f'lag_{lag}'] = df.groupby(group_col)[target_col].shift(lag)
    return df


def create_rolling_features(df, target_col='unit_sales', group_col='family'):
    """
    📊 ROLLING FEATURES
    "What's the average/trend over the last N days?"
    
    - rolling_mean_7d: Average sales of the last 7 days
      → If this is HIGH, demand is currently strong
    
    - rolling_mean_30d: Average sales of the last 30 days
      → This captures the "normal" level of demand
    
    - rolling_std_7d: How VOLATILE are sales in the last 7 days?
      → High std = unpredictable demand (model should be less confident)
    """
    df = df.copy()
    for window in [7, 30]:
        df[f'rolling_mean_{window}d'] = (
            df.groupby(group_col)[target_col]
            .transform(lambda x: x.shift(1).rolling(window, min_periods=1).mean())
        )
    df['rolling_std_7d'] = (
        df.groupby(group_col)[target_col]
        .transform(lambda x: x.shift(1).rolling(7, min_periods=1).std())
    )
    return df


def create_trend_feature(df, target_col='unit_sales', group_col='family'):
    """
    📈 TREND FEATURE
    "Is demand going UP or DOWN over the last 14 days?"
    
    We calculate the slope of a 14-day window.
    - Positive slope = demand increasing
    - Negative slope = demand declining (→ slow moving inventory!)
    """
    df = df.copy()
    
    def calc_slope(series):
        """Calculate the slope of the last 14 values using linear regression"""
        if len(series) < 3:
            return 0
        x = np.arange(len(series))
        try:
            slope = np.polyfit(x, series.values, 1)[0]
        except (np.linalg.LinAlgError, ValueError):
            slope = 0
        return slope
    
    df['trend_14d'] = (
        df.groupby(group_col)[target_col]
        .transform(lambda x: x.shift(1).rolling(14, min_periods=3).apply(calc_slope, raw=False))
    )
    return df


def engineer_features(df, is_training=True):
    """
    🔧 MASTER FUNCTION: Runs ALL feature engineering steps in order.
    
    Input: Raw dataframe with columns [date, family, unit_sales, onpromotion, is_holiday]
    Output: Dataframe with 18 engineered features ready for LightGBM
    
    is_training=True: We have actual sales data (for training)
    is_training=False: We're predicting the future (no actual sales yet)
    """
    df = df.copy()
    
    # Step 1: Time features (always available — we always know what day it is)
    df = create_time_features(df)
    
    # Step 2: Lag features (need historical data)
    if 'unit_sales' in df.columns:
        df = create_lag_features(df, target_col='unit_sales')
        df = create_rolling_features(df, target_col='unit_sales')
        df = create_trend_feature(df, target_col='unit_sales')
    
    # Step 3: Ensure event features exist
    if 'is_holiday' not in df.columns:
        df['is_holiday'] = 0
    if 'onpromotion' not in df.columns:
        df['onpromotion'] = 0
    
    # Convert promotion to numeric
    df['onpromotion'] = df['onpromotion'].fillna(0).astype(int)
    df['is_holiday'] = df['is_holiday'].fillna(0).astype(int)
    
    # Step 4: Product family as categorical code
    if 'family' in df.columns:
        df['family_code'] = df['family'].astype('category').cat.codes
    
    # Step 5: Price feature
    if 'price' not in df.columns:
        df['price'] = 0
    
    return df


# The 18 features that LightGBM will use for prediction
FEATURE_COLUMNS = [
    'day_of_week',
    'day_of_month',
    'month',
    'is_weekend',
    'is_month_start',
    'is_month_end',
    'lag_1',
    'lag_7',
    'lag_14',
    'lag_28',
    'rolling_mean_7d',
    'rolling_mean_30d',
    'rolling_std_7d',
    'trend_14d',
    'is_holiday',
    'onpromotion',
    'family_code',
    'price',
]

TARGET_COLUMN = 'unit_sales'
