"""
ANTARYA v6 — Indian Festival Calendar (2012-2014 + 2024-2025)
==============================================================
Covers the Indian Retail Chain dataset date range (2012-01 to 2014-03)
AND future inference dates (2024-2025).

State-specific festivals included where applicable.
"""

import pandas as pd
import numpy as np

# ──────────────────────────────────────────────────────────
# Complete Indian Festival Database
# ──────────────────────────────────────────────────────────
FESTIVALS = [
    # ═══════════════════════════════════════
    # 2012
    # ═══════════════════════════════════════
    {"date": "2012-01-14", "name": "Makar Sankranti", "type": "National", "importance": 4, "duration": 2, "states": "ALL"},
    {"date": "2012-01-15", "name": "Pongal", "type": "Regional", "importance": 4, "duration": 3, "states": "Kerala"},
    {"date": "2012-01-26", "name": "Republic Day", "type": "National", "importance": 2, "duration": 1, "states": "ALL"},
    {"date": "2012-03-08", "name": "Holi", "type": "National", "importance": 5, "duration": 2, "states": "ALL"},
    {"date": "2012-03-23", "name": "Ugadi", "type": "Regional", "importance": 5, "duration": 1, "states": "Telangana"},
    {"date": "2012-04-06", "name": "Ram Navami", "type": "National", "importance": 3, "duration": 1, "states": "ALL"},
    {"date": "2012-04-14", "name": "Vishu", "type": "Regional", "importance": 4, "duration": 1, "states": "Kerala"},
    {"date": "2012-05-06", "name": "Akshaya Tritiya", "type": "National", "importance": 3, "duration": 1, "states": "ALL"},
    {"date": "2012-08-10", "name": "Raksha Bandhan", "type": "National", "importance": 3, "duration": 1, "states": "ALL"},
    {"date": "2012-08-15", "name": "Independence Day", "type": "National", "importance": 2, "duration": 1, "states": "ALL"},
    {"date": "2012-08-20", "name": "Eid al-Fitr", "type": "National", "importance": 5, "duration": 3, "states": "ALL"},
    {"date": "2012-09-02", "name": "Onam", "type": "Regional", "importance": 5, "duration": 10, "states": "Kerala"},
    {"date": "2012-09-19", "name": "Ganesh Chaturthi", "type": "Regional", "importance": 5, "duration": 10, "states": "Maharashtra,Telangana"},
    {"date": "2012-10-02", "name": "Gandhi Jayanti", "type": "National", "importance": 2, "duration": 1, "states": "ALL"},
    {"date": "2012-10-24", "name": "Dussehra", "type": "National", "importance": 4, "duration": 1, "states": "ALL"},
    {"date": "2012-11-13", "name": "Diwali", "type": "National", "importance": 5, "duration": 5, "states": "ALL"},
    {"date": "2012-11-14", "name": "Dhanteras", "type": "National", "importance": 4, "duration": 1, "states": "ALL"},
    {"date": "2012-11-28", "name": "Guru Nanak Jayanti", "type": "National", "importance": 3, "duration": 1, "states": "ALL"},
    {"date": "2012-12-25", "name": "Christmas", "type": "National", "importance": 3, "duration": 2, "states": "ALL"},
    {"date": "2012-12-31", "name": "New Year Eve", "type": "National", "importance": 3, "duration": 2, "states": "ALL"},

    # ═══════════════════════════════════════
    # 2013
    # ═══════════════════════════════════════
    {"date": "2013-01-01", "name": "New Year", "type": "National", "importance": 3, "duration": 1, "states": "ALL"},
    {"date": "2013-01-14", "name": "Makar Sankranti", "type": "National", "importance": 4, "duration": 2, "states": "ALL"},
    {"date": "2013-01-15", "name": "Pongal", "type": "Regional", "importance": 4, "duration": 3, "states": "Kerala"},
    {"date": "2013-01-26", "name": "Republic Day", "type": "National", "importance": 2, "duration": 1, "states": "ALL"},
    {"date": "2013-03-27", "name": "Holi", "type": "National", "importance": 5, "duration": 2, "states": "ALL"},
    {"date": "2013-04-11", "name": "Ugadi", "type": "Regional", "importance": 5, "duration": 1, "states": "Telangana"},
    {"date": "2013-04-14", "name": "Vishu", "type": "Regional", "importance": 4, "duration": 1, "states": "Kerala"},
    {"date": "2013-04-19", "name": "Ram Navami", "type": "National", "importance": 3, "duration": 1, "states": "ALL"},
    {"date": "2013-08-09", "name": "Eid al-Fitr", "type": "National", "importance": 5, "duration": 3, "states": "ALL"},
    {"date": "2013-08-15", "name": "Independence Day", "type": "National", "importance": 2, "duration": 1, "states": "ALL"},
    {"date": "2013-08-20", "name": "Raksha Bandhan", "type": "National", "importance": 3, "duration": 1, "states": "ALL"},
    {"date": "2013-09-09", "name": "Ganesh Chaturthi", "type": "Regional", "importance": 5, "duration": 10, "states": "Maharashtra,Telangana"},
    {"date": "2013-09-16", "name": "Onam", "type": "Regional", "importance": 5, "duration": 10, "states": "Kerala"},
    {"date": "2013-10-02", "name": "Gandhi Jayanti", "type": "National", "importance": 2, "duration": 1, "states": "ALL"},
    {"date": "2013-10-13", "name": "Dussehra", "type": "National", "importance": 4, "duration": 1, "states": "ALL"},
    {"date": "2013-11-03", "name": "Diwali", "type": "National", "importance": 5, "duration": 5, "states": "ALL"},
    {"date": "2013-11-01", "name": "Dhanteras", "type": "National", "importance": 4, "duration": 1, "states": "ALL"},
    {"date": "2013-11-17", "name": "Guru Nanak Jayanti", "type": "National", "importance": 3, "duration": 1, "states": "ALL"},
    {"date": "2013-12-25", "name": "Christmas", "type": "National", "importance": 3, "duration": 2, "states": "ALL"},
    {"date": "2013-12-31", "name": "New Year Eve", "type": "National", "importance": 3, "duration": 2, "states": "ALL"},

    # ═══════════════════════════════════════
    # 2014
    # ═══════════════════════════════════════
    {"date": "2014-01-01", "name": "New Year", "type": "National", "importance": 3, "duration": 1, "states": "ALL"},
    {"date": "2014-01-14", "name": "Makar Sankranti", "type": "National", "importance": 4, "duration": 2, "states": "ALL"},
    {"date": "2014-01-15", "name": "Pongal", "type": "Regional", "importance": 4, "duration": 3, "states": "Kerala"},
    {"date": "2014-01-26", "name": "Republic Day", "type": "National", "importance": 2, "duration": 1, "states": "ALL"},
    {"date": "2014-03-17", "name": "Holi", "type": "National", "importance": 5, "duration": 2, "states": "ALL"},
    {"date": "2014-03-31", "name": "Ugadi", "type": "Regional", "importance": 5, "duration": 1, "states": "Telangana"},

    # ═══════════════════════════════════════
    # 2024-2025 (for inference)
    # ═══════════════════════════════════════
    {"date": "2024-01-15", "name": "Sankranti", "type": "Regional", "importance": 4, "duration": 2, "states": "Telangana"},
    {"date": "2024-01-26", "name": "Republic Day", "type": "National", "importance": 2, "duration": 1, "states": "ALL"},
    {"date": "2024-03-25", "name": "Holi", "type": "National", "importance": 5, "duration": 2, "states": "ALL"},
    {"date": "2024-04-09", "name": "Ugadi", "type": "Regional", "importance": 5, "duration": 1, "states": "Telangana"},
    {"date": "2024-04-11", "name": "Eid al-Fitr", "type": "National", "importance": 5, "duration": 3, "states": "ALL"},
    {"date": "2024-07-28", "name": "Bonalu", "type": "Regional", "importance": 4, "duration": 1, "states": "Telangana"},
    {"date": "2024-08-15", "name": "Independence Day", "type": "National", "importance": 2, "duration": 1, "states": "ALL"},
    {"date": "2024-09-07", "name": "Ganesh Chaturthi", "type": "Regional", "importance": 5, "duration": 10, "states": "Maharashtra,Telangana"},
    {"date": "2024-10-12", "name": "Dussehra", "type": "National", "importance": 4, "duration": 1, "states": "ALL"},
    {"date": "2024-10-31", "name": "Diwali", "type": "National", "importance": 5, "duration": 5, "states": "ALL"},
    {"date": "2024-12-25", "name": "Christmas", "type": "National", "importance": 3, "duration": 2, "states": "ALL"},
    {"date": "2025-01-14", "name": "Sankranti", "type": "Regional", "importance": 4, "duration": 2, "states": "Telangana"},
    {"date": "2025-01-26", "name": "Republic Day", "type": "National", "importance": 2, "duration": 1, "states": "ALL"},
    {"date": "2025-03-14", "name": "Holi", "type": "National", "importance": 5, "duration": 2, "states": "ALL"},
    {"date": "2025-03-30", "name": "Ugadi", "type": "Regional", "importance": 5, "duration": 1, "states": "Telangana"},
    {"date": "2025-03-31", "name": "Eid al-Fitr", "type": "National", "importance": 5, "duration": 3, "states": "ALL"},
    {"date": "2025-08-15", "name": "Independence Day", "type": "National", "importance": 2, "duration": 1, "states": "ALL"},
    {"date": "2025-08-27", "name": "Ganesh Chaturthi", "type": "Regional", "importance": 5, "duration": 10, "states": "Maharashtra,Telangana"},
    {"date": "2025-10-02", "name": "Dussehra", "type": "National", "importance": 4, "duration": 1, "states": "ALL"},
    {"date": "2025-10-20", "name": "Diwali", "type": "National", "importance": 5, "duration": 5, "states": "ALL"},
    {"date": "2025-12-25", "name": "Christmas", "type": "National", "importance": 3, "duration": 2, "states": "ALL"},
]


def get_festival_df():
    """Return DataFrame of all festivals."""
    df = pd.DataFrame(FESTIVALS)
    df["date"] = pd.to_datetime(df["date"])
    return df


def add_festival_features_v6(df, state_col="state"):
    """
    Add festival proximity features with state-awareness.
    VECTORIZED — uses np.searchsorted instead of per-row loops.
    
    Features generated:
      - days_before_festival (0-14, clipped)
      - days_after_festival (0-7, clipped)
      - festival_importance (0-5)
      - is_festival_week (bool)
      - festival_type_code (National=1/Regional=2)
      - festival_duration (days)
    """
    df = df.copy()
    if "date" not in df.columns:
        return df

    fest_df = get_festival_df()
    
    # State mapping
    STATE_MAP = {
        "Maharashtra": "Maharashtra",
        "Telangana": "Telangana",
        "Kerala": "Kerala",
    }
    
    # Initialize output columns
    df["days_before_festival"] = 14
    df["days_after_festival"] = 7
    df["festival_importance"] = 0
    df["is_festival_week"] = 0
    df["festival_type_code"] = 0
    df["festival_duration"] = 0
    
    dates_dt = pd.to_datetime(df["date"])
    states = df[state_col].values if state_col in df.columns else np.array(["ALL"] * len(df))
    
    # Process per state for correctness
    for state in np.unique(states):
        state_norm = STATE_MAP.get(state, state)
        mask = states == state
        
        # Filter festivals relevant to this state
        relevant = fest_df[
            (fest_df["states"] == "ALL") | 
            (fest_df["states"].str.contains(state_norm, na=False))
        ].sort_values("date").reset_index(drop=True)
        
        if len(relevant) == 0:
            continue
        
        fest_dates = relevant["date"].values.astype("datetime64[D]")
        fest_importance = relevant["importance"].values
        fest_duration = relevant["duration"].values
        fest_type = np.where(relevant["type"].values == "National", 1, 2)
        
        row_dates = dates_dt.values[mask].astype("datetime64[D]")
        
        # searchsorted: find index of next festival for each date
        next_idx = np.searchsorted(fest_dates, row_dates, side="left")
        
        n_fests = len(fest_dates)
        n_rows = mask.sum()
        
        # Days before next festival
        valid_next = next_idx < n_fests
        days_before = np.full(n_rows, 14, dtype=np.int32)
        days_before[valid_next] = ((fest_dates[next_idx[valid_next]] - row_dates[valid_next]) / np.timedelta64(1, "D")).astype(int)
        days_before = np.clip(days_before, 0, 14)
        
        # Days after last festival
        prev_idx = next_idx - 1
        valid_prev = prev_idx >= 0
        days_after = np.full(n_rows, 7, dtype=np.int32)
        days_after[valid_prev] = ((row_dates[valid_prev] - fest_dates[prev_idx[valid_prev]]) / np.timedelta64(1, "D")).astype(int)
        days_after = np.clip(days_after, 0, 7)
        
        # Importance, duration, type (from nearest future festival if within 7 days)
        importance = np.zeros(n_rows, dtype=np.int32)
        duration = np.zeros(n_rows, dtype=np.int32)
        ftype = np.zeros(n_rows, dtype=np.int32)
        
        near_mask = valid_next & (days_before <= 7)
        clamped = np.clip(next_idx[near_mask], 0, n_fests - 1)
        importance[near_mask] = fest_importance[clamped]
        duration[near_mask] = fest_duration[clamped]
        ftype[near_mask] = fest_type[clamped]
        
        is_festival_week = ((days_before <= 7) | (days_after <= 2)).astype(int)
        
        # Write back
        df.loc[mask, "days_before_festival"] = days_before
        df.loc[mask, "days_after_festival"] = days_after
        df.loc[mask, "festival_importance"] = importance
        df.loc[mask, "is_festival_week"] = is_festival_week
        df.loc[mask, "festival_type_code"] = ftype
        df.loc[mask, "festival_duration"] = duration
    
    return df

