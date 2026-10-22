"""
ANTARYA ML Service — Feature Engineering Pipeline v2
======================================================
BUGS FIXED from v1:
  1. Lag/rolling grouped by item_nbr (not family) — was destroying per-product signal
  2. Holidays loaded from real holidays_events.csv (not hardcoded 0)
  3. Removed poly-fit trend (slow, noisy) — replaced with EWMA diff

NEW FEATURES (22 additions → 40 total):
  - EWMA (span 7, 14, 28) — exponentially weighted recent signal
  - Demand momentum (EWMA_7 - EWMA_28) — is demand rising or falling?
  - Rolling median, max, min (7d, 30d) — handles outlier spikes
  - Fourier features (weekly & annual seasonality) — sin/cos encoding
  - Holiday proximity (days to nearest holiday) — captures pre-holiday surge
  - Promotion streak (consecutive promo days) — captures promo momentum
  - Promotion lag (days since last promo) — captures post-promo dip
  - Zero-demand streak (consecutive zero-sales days) — identifies dead stock
  - Expanding mean/std (lifetime item average) — long-term baseline
  - Quarter encoding — captures quarterly patterns

LEAKAGE POLICY: All features use .shift(1) before any rolling/EWMA.
This ensures we never use today's sales to predict today.
"""

import pandas as pd
import numpy as np


# ─────────────────────────────────────────────
# TIME FEATURES
# ─────────────────────────────────────────────
def create_time_features(df):
    df = df.copy()
    df['date'] = pd.to_datetime(df['date'])
    df['day_of_week']   = df['date'].dt.dayofweek        # 0=Mon, 6=Sun
    df['day_of_month']  = df['date'].dt.day
    df['month']         = df['date'].dt.month
    df['quarter']       = df['date'].dt.quarter
    df['week_of_year']  = df['date'].dt.isocalendar().week.astype(int)
    df['is_weekend']    = (df['day_of_week'] >= 5).astype(int)
    df['is_month_start'] = (df['day_of_month'] <= 3).astype(int)
    df['is_month_end']   = (df['day_of_month'] >= 28).astype(int)

    # Fourier: weekly seasonality (period=7)
    df['fourier_week_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7)
    df['fourier_week_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7)

    # Fourier: annual seasonality (period=365.25)
    day_of_year = df['date'].dt.dayofyear
    df['fourier_year_sin'] = np.sin(2 * np.pi * day_of_year / 365.25)
    df['fourier_year_cos'] = np.cos(2 * np.pi * day_of_year / 365.25)

    return df


# ─────────────────────────────────────────────
# HOLIDAY FEATURES
# ─────────────────────────────────────────────
def create_holiday_features(df, holidays_df=None):
    """
    Load real Favorita holidays and compute:
    - is_holiday: 1 if it's actually a holiday
    - days_to_next_holiday: how many days until the next holiday (0-14 clipped)
    - days_since_holiday: how many days since last holiday (0-14 clipped)
    """
    df = df.copy()

    if holidays_df is not None and len(holidays_df) > 0:
        holiday_dates = pd.to_datetime(holidays_df['date'].unique())
        holiday_set = set(holiday_dates)

        df['is_holiday'] = df['date'].isin(holiday_set).astype(int)

        # Vectorised proximity: days to next holiday and days since last holiday
        dates_np = df['date'].values.astype('datetime64[D]').astype(int)
        holiday_np = np.array([np.datetime64(d, 'D') for d in holiday_dates], dtype='datetime64[D]').astype(int)

        # Days to next holiday (forward-looking — safe: it's a calendar fact, not sales data)
        def days_to_next(d):
            future = holiday_np[holiday_np >= d]
            return int(future.min() - d) if len(future) > 0 else 30
        def days_since_last(d):
            past = holiday_np[holiday_np <= d]
            return int(d - past.max()) if len(past) > 0 else 30

        df['days_to_holiday']   = [days_to_next(d)   for d in dates_np]
        df['days_since_holiday'] = [days_since_last(d) for d in dates_np]

        # Clip at 14 — beyond 14 days, proximity signal is noise
        df['days_to_holiday']   = df['days_to_holiday'].clip(0, 14)
        df['days_since_holiday'] = df['days_since_holiday'].clip(0, 14)
    else:
        df['is_holiday']        = 0
        df['days_to_holiday']   = 14
        df['days_since_holiday'] = 14

    return df


# ─────────────────────────────────────────────
# LAG FEATURES  (BUGFIX: grouped by item_nbr)
# ─────────────────────────────────────────────
def create_lag_features(df, target_col='unit_sales', group_col='item_nbr'):
    df = df.copy()
    grp = df.groupby(group_col)[target_col]
    for lag in [1, 7, 14, 28]:
        df[f'lag_{lag}'] = grp.shift(lag)
    return df


# ─────────────────────────────────────────────
# ROLLING FEATURES  (grouped by item_nbr)
# ─────────────────────────────────────────────
def create_rolling_features(df, target_col='unit_sales', group_col='item_nbr'):
    df = df.copy()

    def shifted_roll(x, w, fn):
        return x.shift(1).rolling(w, min_periods=1).agg(fn)

    for window in [7, 30]:
        df[f'rolling_mean_{window}d'] = df.groupby(group_col)[target_col].transform(
            lambda x: shifted_roll(x, window, 'mean'))
        df[f'rolling_median_{window}d'] = df.groupby(group_col)[target_col].transform(
            lambda x: shifted_roll(x, window, 'median'))
        df[f'rolling_max_{window}d'] = df.groupby(group_col)[target_col].transform(
            lambda x: shifted_roll(x, window, 'max'))
        df[f'rolling_min_{window}d'] = df.groupby(group_col)[target_col].transform(
            lambda x: shifted_roll(x, window, 'min'))

    df['rolling_std_7d'] = df.groupby(group_col)[target_col].transform(
        lambda x: x.shift(1).rolling(7, min_periods=2).std())

    return df


# ─────────────────────────────────────────────
# EWMA + MOMENTUM + ACCELERATION
# ─────────────────────────────────────────────
def create_ewma_features(df, target_col='unit_sales', group_col='item_nbr'):
    df = df.copy()

    for span in [7, 14, 28]:
        df[f'ewma_{span}'] = df.groupby(group_col)[target_col].transform(
            lambda x: x.shift(1).ewm(span=span, adjust=False).mean())

    # Momentum: short-term EWMA minus long-term EWMA
    # Positive = demand rising. Negative = demand falling.
    df['demand_momentum'] = df['ewma_7'] - df['ewma_28']

    # Acceleration: change in momentum over 7d
    df['demand_acceleration'] = df.groupby(group_col)['demand_momentum'].transform(
        lambda x: x.diff(7))

    return df


# ─────────────────────────────────────────────
# EXPANDING FEATURES (lifetime baseline)
# ─────────────────────────────────────────────
def create_expanding_features(df, target_col='unit_sales', group_col='item_nbr'):
    df = df.copy()
    df['expanding_mean'] = df.groupby(group_col)[target_col].transform(
        lambda x: x.shift(1).expanding(min_periods=1).mean())
    df['expanding_std'] = df.groupby(group_col)[target_col].transform(
        lambda x: x.shift(1).expanding(min_periods=2).std())
    return df


# ─────────────────────────────────────────────
# PROMOTION FEATURES
# ─────────────────────────────────────────────
def create_promotion_features(df, promo_col='onpromotion', group_col='item_nbr'):
    df = df.copy()
    df[promo_col] = df[promo_col].fillna(0).astype(int)

    # Promotion streak: how many consecutive days on promotion (BEFORE today)
    def promo_streak(x):
        shifted = x.shift(1).fillna(0)
        streak = []
        count = 0
        for val in shifted:
            if val == 1:
                count += 1
            else:
                count = 0
            streak.append(count)
        return pd.Series(streak, index=x.index)

    df['promo_streak'] = df.groupby(group_col)[promo_col].transform(promo_streak)

    # Days since last promotion (0 if currently on promo, clipped at 30)
    def days_since_promo(x):
        shifted = x.shift(1).fillna(0)
        days = []
        count = 30  # default: long time since promo
        for val in shifted:
            if val == 1:
                count = 0
            else:
                count = min(count + 1, 30)
            days.append(count)
        return pd.Series(days, index=x.index)

    df['days_since_promo'] = df.groupby(group_col)[promo_col].transform(days_since_promo)

    return df


# ─────────────────────────────────────────────
# ZERO-DEMAND STREAK
# ─────────────────────────────────────────────
def create_zero_demand_streak(df, target_col='unit_sales', group_col='item_nbr'):
    df = df.copy()

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

    df['zero_demand_streak'] = df.groupby(group_col)[target_col].transform(zero_streak)
    return df


# ─────────────────────────────────────────────
# MASTER FUNCTION
# ─────────────────────────────────────────────
def engineer_features_v2(df, holidays_df=None, is_training=True):
    """
    Runs all v2 feature engineering.
    Input:  raw df with [date, item_nbr, family, unit_sales, onpromotion]
    Output: df with 40 engineered features
    """
    df = df.copy()

    print("  [FE] Time features...")
    df = create_time_features(df)

    print("  [FE] Holiday features...")
    df = create_holiday_features(df, holidays_df)

    if 'unit_sales' in df.columns:
        print("  [FE] Lag features (by item_nbr)...")
        df = create_lag_features(df, target_col='unit_sales', group_col='item_nbr')

        print("  [FE] Rolling features (median, max, min, std)...")
        df = create_rolling_features(df, target_col='unit_sales', group_col='item_nbr')

        print("  [FE] EWMA + Momentum + Acceleration...")
        df = create_ewma_features(df, target_col='unit_sales', group_col='item_nbr')

        print("  [FE] Expanding mean/std...")
        df = create_expanding_features(df, target_col='unit_sales', group_col='item_nbr')

        print("  [FE] Zero-demand streak...")
        df = create_zero_demand_streak(df, target_col='unit_sales', group_col='item_nbr')

    if 'onpromotion' in df.columns:
        print("  [FE] Promotion streak + lag...")
        df = create_promotion_features(df, promo_col='onpromotion', group_col='item_nbr')
    else:
        df['promo_streak'] = 0
        df['days_since_promo'] = 30

    # Product family as categorical
    if 'family' in df.columns:
        df['family_code'] = df['family'].astype('category').cat.codes

    if 'price' not in df.columns:
        df['price'] = 0

    return df


# ─────────────────────────────────────────────
# FEATURE LIST (40 features)
# ─────────────────────────────────────────────
FEATURE_COLUMNS_V2 = [
    # Time (12)
    'day_of_week', 'day_of_month', 'month', 'quarter', 'week_of_year',
    'is_weekend', 'is_month_start', 'is_month_end',
    'fourier_week_sin', 'fourier_week_cos',
    'fourier_year_sin', 'fourier_year_cos',

    # Holiday (3)
    'is_holiday', 'days_to_holiday', 'days_since_holiday',

    # Lags (4)
    'lag_1', 'lag_7', 'lag_14', 'lag_28',

    # Rolling (10)
    'rolling_mean_7d', 'rolling_median_7d', 'rolling_max_7d', 'rolling_min_7d',
    'rolling_mean_30d', 'rolling_median_30d', 'rolling_max_30d', 'rolling_min_30d',
    'rolling_std_7d',

    # EWMA + Momentum (5)
    'ewma_7', 'ewma_14', 'ewma_28',
    'demand_momentum', 'demand_acceleration',

    # Expanding (2)
    'expanding_mean', 'expanding_std',

    # Promotion (3)
    'onpromotion', 'promo_streak', 'days_since_promo',

    # Zero-demand (1)
    'zero_demand_streak',

    # Product (1)
    'family_code',
]

TARGET_COLUMN = 'unit_sales'
