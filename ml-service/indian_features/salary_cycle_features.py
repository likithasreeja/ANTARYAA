"""
ANTARYA Feature Pipeline — Indian Salary Cycle
==============================================
Generates features based on common Indian monthly payday cycles.
"""

import pandas as pd

def add_salary_cycle_features(df):
    """
    Given a dataframe with a 'date' column, adds:
    - is_salary_week (1st-7th of month)
    - is_month_end (25th-31st)
    - days_from_month_start
    """
    df = df.copy()
    if "date" not in df.columns:
        return df
        
    day_of_month = df["date"].dt.day
    
    df["is_salary_week"] = (day_of_month <= 7).astype(int)
    df["is_late_month"] = (day_of_month >= 25).astype(int)
    df["days_from_month_start"] = day_of_month - 1
    
    # Pre-salary caution (people spend less just before payday)
    df["is_pre_salary_week"] = ((day_of_month >= 24) & (day_of_month <= 31)).astype(int)
    
    return df
