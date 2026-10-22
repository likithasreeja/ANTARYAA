"""
ANTARYA Ingestion Layer — AGMARKNET data.gov.in API
====================================================
Fetches commodity mandi prices from the Government of India API.

Features:
  - Pagination (offset + limit, handles up to millions of records)
  - Retry logic with exponential backoff
  - Structured logging
  - State-wise filtering
  - Saves raw JSON + processed CSV
  - Idempotent (won't re-fetch already downloaded data)

Resource ID: 35985678-0d79-46b4-9ed6-6f13308a1d24
API Docs: https://api.data.gov.in/resource/{id}?api-key={key}&format=json
"""

import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import os
import time
import json
import logging
import requests
import pandas as pd
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

# ─── Load .env ───
load_dotenv(Path(__file__).parent.parent / ".env")

# ─── Config ───
API_KEY       = os.getenv("DATA_GOV_API_KEY", "")
RESOURCE_ID   = "35985678-0d79-46b4-9ed6-6f13308a1d24"
BASE_URL      = f"https://api.data.gov.in/resource/{RESOURCE_ID}"
PAGE_SIZE     = 1000          # Records per request (API max is usually 1000-5000)
MAX_RETRIES   = 3
RETRY_DELAY   = 2             # seconds, doubled on each retry

# ─── Paths ───
BASE_DIR   = Path(__file__).parent.parent
RAW_DIR    = BASE_DIR / "data" / "agmarknet_api"
RAW_DIR.mkdir(parents=True, exist_ok=True)

# ─── Kirana-relevant commodities ───
KIRANA_COMMODITIES = {
    # Vegetables (daily purchase, high price sensitivity)
    "Tomato", "Onion", "Potato", "Green Chilli", "Brinjal",
    "Cabbage", "Cauliflower", "Cluster beans", "Ridgeguard(Tori)",
    "Bitter Gourd", "Ladies Finger", "Radish",

    # Fruits
    "Banana", "Lemon", "Lime", "Mango", "Papaya", "Orange",

    # Grains & Staples
    "Rice", "Wheat", "Maize", "Jowar(Sorghum)", "Bajra(Pearl Millet/Cumbu)",
    "Paddy(Dhan)(Common)", "Paddy(Common)", "Atta (Wheat)",

    # Pulses / Dal
    "Black Gram (Urd Beans)(Whole)", "Black Gram(Urd Beans)(Whole)",
    "Arhar (Tur/Red Gram)(Whole)", "Arhar(Tur/Red Gram)(Whole)",
    "Bengal Gram(Gram)(Whole)", "Bengal Gram Dal (Chana Dal)",
    "Green Gram (Moong)(Whole)", "Green Gram Dal (Moong Dal)",
    "Masoor Dal", "Red Gram",

    # Sweeteners & Spices
    "Gur(Jaggery)", "Jaggery", "Sugar", "Turmeric", "Green Chilli",

    # Oils
    "Groundnut", "Sunflower", "Ground Nut Oil", "Sunflower Oil",

    # Other kirana staples
    "Groundnut", "Cashewnuts",
}

# ─── Logging ───
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(RAW_DIR / "ingestion.log", encoding="utf-8")
    ]
)
log = logging.getLogger("agmarknet")


def _fetch_page(state: str, offset: int, limit: int = PAGE_SIZE) -> dict:
    """
    Fetch a single page from the API.
    Returns the parsed JSON or raises after MAX_RETRIES.
    """
    if not API_KEY:
        raise ValueError("DATA_GOV_API_KEY not set in .env")

    params = {
        "api-key": API_KEY,
        "format":  "json",
        "limit":   limit,
        "offset":  offset,
    }
    if state and state.lower() != "all":
        params["filters[State.Keyword]"] = state

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(BASE_URL, params=params, timeout=30)
            if resp.status_code == 200:
                return resp.json()
            elif resp.status_code == 429:
                wait = RETRY_DELAY * (2 ** attempt)
                log.warning(f"Rate limited. Waiting {wait}s... (attempt {attempt})")
                time.sleep(wait)
            else:
                log.error(f"HTTP {resp.status_code}: {resp.text[:200]}")
                resp.raise_for_status()
        except requests.RequestException as e:
            log.warning(f"Request failed (attempt {attempt}/{MAX_RETRIES}): {e}")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY * attempt)
            else:
                raise

    raise RuntimeError(f"Failed after {MAX_RETRIES} attempts")


def _parse_records(raw_data: dict) -> list[dict]:
    """
    Extract records from API response.
    Handles both 'records' and 'data' key formats.
    """
    return raw_data.get("records", raw_data.get("data", []))


def fetch_state(state: str = "Telangana", force_refetch: bool = False) -> pd.DataFrame:
    """
    Fetch ALL commodity price records for a given state.

    Args:
        state: State name as per API (e.g. "Telangana", "Andhra Pradesh", "all")
        force_refetch: If True, re-downloads even if cache exists

    Returns:
        DataFrame with all records for the state
    """
    safe_state = state.replace(" ", "_").lower()
    cache_path = RAW_DIR / f"{safe_state}_raw.csv"

    if cache_path.exists() and not force_refetch:
        log.info(f"Cache hit: {cache_path} — loading existing data")
        return pd.read_csv(cache_path)

    log.info(f"Fetching AGMARKNET data for: {state}")
    if not API_KEY:
        raise ValueError("DATA_GOV_API_KEY missing from .env file")

    # Get total count first
    first_page = _fetch_page(state, offset=0, limit=1)
    total = int(first_page.get("total", 0))
    log.info(f"Total records available for {state}: {total:,}")

    if total == 0:
        log.warning(f"No records found for state: {state}")
        return pd.DataFrame()

    all_records = []
    offset = 0
    page_num = 0

    while offset < total:
        page_num += 1
        log.info(f"  Page {page_num}: fetching offset={offset} to {min(offset+PAGE_SIZE, total):,} / {total:,}")

        page_data = _fetch_page(state, offset=offset)
        records = _parse_records(page_data)

        if not records:
            log.warning(f"  Empty page at offset {offset}, stopping.")
            break

        all_records.extend(records)
        offset += len(records)

        # Polite delay to avoid rate limiting
        time.sleep(0.3)

    log.info(f"Fetched {len(all_records):,} records for {state}")

    # Save raw JSON snapshot
    json_path = RAW_DIR / f"{safe_state}_raw.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(all_records[:1000], f, indent=2, ensure_ascii=False)  # Sample only
    log.info(f"Raw JSON sample saved: {json_path}")

    # Convert to DataFrame
    df = pd.DataFrame(all_records)
    df.to_csv(cache_path, index=False, encoding="utf-8")
    log.info(f"Saved: {cache_path}")

    return df


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Normalize column names from whatever the API returns
    to our internal schema. Handles different API versions.
    """
    # Map possible API column names → our standard names
    col_map = {
        # Common variations from data.gov.in
        "State":          "state",
        "state":          "state",
        "District":       "district",
        "district":       "district",
        "Market":         "market",
        "market":         "market",
        "Commodity":      "commodity",
        "commodity":      "commodity",
        "Variety":        "variety",
        "variety":        "variety",
        "Grade":          "grade",
        "grade":          "grade",
        "Arrival_Date":   "date",
        "arrival_date":   "date",
        "Min_Price":      "min_price",
        "min_price":      "min_price",
        "Max_Price":      "max_price",
        "max_price":      "max_price",
        "Modal_Price":    "modal_price",
        "modal_price":    "modal_price",
        "Commodity_Code": "commodity_code",
        "commodity_code": "commodity_code",
    }

    df = df.rename(columns={k: v for k, v in col_map.items() if k in df.columns})

    # Parse date
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], infer_datetime_format=True, errors="coerce")

    # Parse prices to numeric
    for col in ["min_price", "max_price", "modal_price"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    return df


def filter_kirana(df: pd.DataFrame) -> pd.DataFrame:
    """
    Keep only kirana-relevant commodities.
    Logs what was filtered out.
    """
    if "commodity" not in df.columns:
        return df

    before = len(df)
    mask = df["commodity"].isin(KIRANA_COMMODITIES)
    df_filtered = df[mask].copy()
    after = len(df_filtered)

    dropped_commodities = sorted(df[~mask]["commodity"].unique())
    log.info(f"Kirana filter: {before:,} → {after:,} rows")
    log.info(f"Dropped non-kirana commodities ({len(dropped_commodities)}): {dropped_commodities}")
    log.info(f"Kirana commodities retained: {sorted(df_filtered['commodity'].unique())}")

    return df_filtered


def fetch_and_process(states: list[str] = None, force_refetch: bool = False) -> pd.DataFrame:
    """
    Main entry point. Fetches data for multiple states, normalizes, filters.

    Args:
        states: List of state names. Defaults to ["Telangana", "Andhra Pradesh"]
        force_refetch: Re-download even if cache exists

    Returns:
        Combined, normalized, kirana-filtered DataFrame
    """
    if states is None:
        states = ["Telangana", "Andhra Pradesh"]

    all_dfs = []

    for state in states:
        log.info(f"\n{'='*50}")
        log.info(f"Processing state: {state}")
        log.info(f"{'='*50}")

        try:
            raw_df = fetch_state(state, force_refetch=force_refetch)
            if raw_df.empty:
                log.warning(f"No data returned for {state}")
                continue

            df = normalize_columns(raw_df)
            df = filter_kirana(df)

            if df.empty:
                log.warning(f"After kirana filter, no records for {state}")
                continue

            all_dfs.append(df)
            log.info(f"✅ {state}: {len(df):,} kirana records ready")

        except Exception as e:
            log.error(f"❌ Failed to fetch {state}: {e}")
            continue

    if not all_dfs:
        log.error("No data fetched for any state. Check API key and internet connection.")
        return pd.DataFrame()

    combined = pd.concat(all_dfs, ignore_index=True)

    # Deduplicate
    key_cols = [c for c in ["date", "state", "market", "commodity", "variety"] if c in combined.columns]
    combined = combined.drop_duplicates(subset=key_cols)

    # Sort
    if "date" in combined.columns:
        combined = combined.sort_values(["commodity", "date"]).reset_index(drop=True)

    # Save combined
    out_path = RAW_DIR / "kirana_commodities_combined.csv"
    combined.to_csv(out_path, index=False, encoding="utf-8")
    log.info(f"\n✅ Combined kirana dataset: {len(combined):,} rows")
    log.info(f"   Date range: {combined['date'].min().date() if 'date' in combined.columns else 'N/A'} "
             f"→ {combined['date'].max().date() if 'date' in combined.columns else 'N/A'}")
    log.info(f"   Saved: {out_path}")

    return combined


if __name__ == "__main__":
    print("\n" + "█"*60)
    print("  ANTARYA — AGMARKNET INGESTION")
    print("  Fetching Indian commodity prices...")
    print("█"*60 + "\n")

    df = fetch_and_process(
        states=["Telangana", "Andhra Pradesh"],
        force_refetch=False
    )

    if not df.empty:
        print(f"\n{'='*60}")
        print("INGESTION COMPLETE")
        print(f"{'='*60}")
        print(f"Total kirana records: {len(df):,}")
        print(f"Commodities: {sorted(df['commodity'].unique())}")
        print(f"States: {sorted(df['state'].unique())}")
        if "date" in df.columns:
            print(f"Date range: {df['date'].min().date()} → {df['date'].max().date()}")
        print(f"\nSample:")
        print(df.head(5).to_string(index=False))
    else:
        print("❌ INGESTION FAILED — check logs in data/agmarknet_api/ingestion.log")
