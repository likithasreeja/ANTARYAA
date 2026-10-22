"""
Spreadsheet loading and normalisation for the inventory planner.

Shop owners export sales from many different tools, so column names,
header positions and date formats vary. This module:
  1. Reads .xlsx / .xlsm / .xls / .csv bytes into a DataFrame
  2. Finds the header row (title rows above the table are common)
  3. Suggests which column is date / product / quantity / ...
  4. Converts rows into a clean, uniform list of sales records
"""

import csv
import io
import re
from pathlib import Path

import numpy as np
import pandas as pd

SUPPORTED_EXTENSIONS = {".xlsx", ".xlsm", ".xls", ".csv"}
MAX_ROWS = 200_000
HEADER_SCAN_ROWS = 15

REQUIRED_FIELDS = ("date", "product", "quantity")
OPTIONAL_FIELDS = ("category", "price", "stock", "cost", "discount", "festival", "promotion")
ALL_FIELDS = REQUIRED_FIELDS + OPTIONAL_FIELDS

FIELD_ALIASES = {
    "date": [
        "date", "bill date", "invoice date", "sale date", "sales date", "transaction date",
        "txn date", "order date", "purchase date", "day", "dt",
    ],
    "product": [
        "product", "product name", "item", "item name", "item description", "sku", "sku name",
        "description", "particulars", "goods", "article", "commodity", "name", "product description",
    ],
    "quantity": [
        "quantity", "qty", "units", "units sold", "qty sold", "quantity sold", "sold qty",
        "sales qty", "sale qty", "sold", "pcs", "nos", "no of units", "count",
    ],
    "category": [
        "category", "product category", "item category", "group", "item group", "department",
        "type", "segment", "product type",
    ],
    "price": [
        "price", "unit price", "rate", "mrp", "selling price", "sale price", "sp", "unit rate",
        "price per unit",
    ],
    "stock": [
        "stock", "current stock", "closing stock", "stock on hand", "on hand", "balance",
        "balance qty", "available stock", "stock qty", "inventory", "stock left", "closing qty",
    ],
    "cost": [
        "cost", "cost price", "unit cost", "purchase price", "purchase rate", "buying price",
        "buy price", "cp", "landing cost", "landed cost", "wholesale price", "cost per unit",
    ],
    "discount": [
        "discount", "discount %", "discount percent", "discount pct", "disc", "disc %",
        "discount amount", "disc amt", "offer %", "off %", "markdown",
    ],
    "festival": [
        "festival", "festival name", "holiday", "is festival", "is holiday", "occasion", "event",
        "festival flag", "holiday flag", "special day",
    ],
    "promotion": [
        "promotion", "promo", "on promotion", "onpromotion", "offer", "scheme", "promo flag",
        "on offer", "campaign",
    ],
}

# Short/generic aliases are only trusted on an exact header match.
_EXACT_ONLY = {"name", "day", "dt", "type", "sold", "sp", "nos", "pcs", "group", "balance",
               "count", "rate", "units", "item", "stock", "segment", "cp", "disc", "event",
               "offer", "scheme", "cost"}
# Headers containing these words never map to the given field.
_FIELD_EXCLUDES = {
    "product": ("customer", "phone", "mobile", "shop", "store", "supplier", "vendor", "city", "area"),
    "date": ("update", "expiry", "birth"),
    "price": ("total", "amount", "value", "cost", "discount", "purchase", "buying", "wholesale"),
    "quantity": ("amount", "value", "price", "discount", "cost"),
    "cost": ("total",),
}


class SpreadsheetError(ValueError):
    """Raised for files the user must fix (wrong format, missing columns, ...)."""


def _norm_header(value) -> str:
    text = str(value).strip().lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _field_for_header(header: str, raw=None):
    """Return (field, strength) for a normalised header, strength 2=exact, 1=contains."""
    if not header:
        return None, 0
    if raw is not None and "%" in str(raw) and re.search(r"\b(offer|off|disc|discount|promo)\b", header):
        return "discount", 2
    for field, aliases in FIELD_ALIASES.items():
        if any(word in header for word in _FIELD_EXCLUDES.get(field, ())):
            continue
        if header in aliases:
            return field, 2
    for field, aliases in FIELD_ALIASES.items():
        if any(word in header for word in _FIELD_EXCLUDES.get(field, ())):
            continue
        for alias in aliases:
            if alias in _EXACT_ONLY:
                continue
            if re.search(rf"\b{re.escape(alias)}\b", header):
                return field, 1
    return None, 0


def suggest_mapping(columns):
    """Map each known field to the best matching column name (or None)."""
    candidates = []
    for col in columns:
        field, strength = _field_for_header(_norm_header(col), raw=col)
        if field:
            candidates.append((strength, field, col))
    candidates.sort(key=lambda c: -c[0])

    mapping = {field: None for field in ALL_FIELDS}
    used = set()
    for _, field, col in candidates:
        if mapping[field] is None and col not in used:
            mapping[field] = col
            used.add(col)
    return mapping


def _header_score(values) -> int:
    fields = set()
    for v in values:
        if v is None or (isinstance(v, float) and np.isnan(v)):
            continue
        field, _ = _field_for_header(_norm_header(v), raw=v)
        if field:
            fields.add(field)
    return len(fields)


def _apply_header_row(raw: pd.DataFrame) -> pd.DataFrame:
    """Pick the row that looks most like a header and use it as column names."""
    raw = raw.dropna(how="all").dropna(axis=1, how="all")
    if raw.empty:
        return raw

    best_idx, best_score = 0, -1
    for pos in range(min(HEADER_SCAN_ROWS, len(raw))):
        score = _header_score(raw.iloc[pos].tolist())
        if score > best_score:
            best_idx, best_score = pos, score

    header_values = raw.iloc[best_idx].tolist()
    columns, seen = [], {}
    for i, v in enumerate(header_values):
        name = str(v).strip() if v is not None and not (isinstance(v, float) and np.isnan(v)) else ""
        name = name or f"Column {i + 1}"
        if name in seen:
            seen[name] += 1
            name = f"{name} ({seen[name]})"
        else:
            seen[name] = 1
        columns.append(name)

    table = raw.iloc[best_idx + 1:].copy()
    table.columns = columns
    return table.dropna(how="all").reset_index(drop=True)


def _read_csv_raw(content: bytes) -> pd.DataFrame:
    """Read CSV rows of uneven width (title lines above the header are common)."""
    text = None
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            text = content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise SpreadsheetError("Could not decode CSV file. Save it as UTF-8 and try again.")

    lines = [line for line in text.splitlines() if line.strip()]
    if not lines:
        raise SpreadsheetError("The file is empty.")
    sample = lines[-50:]

    def median_fields(delimiter):
        counts = sorted(len(r) for r in csv.reader(sample, delimiter=delimiter))
        return counts[len(counts) // 2]

    delimiter = max(",;\t|", key=median_fields)

    try:
        rows = list(csv.reader(io.StringIO(text), delimiter=delimiter))
    except csv.Error as exc:
        raise SpreadsheetError(f"Could not read CSV file: {exc}") from exc
    width = max(len(r) for r in rows)
    padded = [[(c if c.strip() else None) for c in r] + [None] * (width - len(r)) for r in rows]
    return pd.DataFrame(padded, dtype=object)


def read_table(file_name: str, content: bytes):
    """Read spreadsheet bytes. Returns (DataFrame, sheet_name, all_sheet_names)."""
    ext = Path(file_name or "").suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise SpreadsheetError(
            f"Unsupported file type '{ext or 'unknown'}'. Upload .xlsx, .xls or .csv files."
        )
    if not content:
        raise SpreadsheetError("The file is empty.")

    if ext == ".csv":
        table = _apply_header_row(_read_csv_raw(content))
        sheet_name, sheet_names = "CSV", ["CSV"]
    else:
        try:
            sheets = pd.read_excel(io.BytesIO(content), sheet_name=None, header=None, dtype=object)
        except ImportError as exc:
            if ext == ".xls":
                raise SpreadsheetError(
                    "Old .xls files need the 'xlrd' package on the ML service. "
                    "Save the sheet as .xlsx and upload again."
                ) from exc
            raise
        except Exception as exc:
            raise SpreadsheetError(f"Could not read Excel file: {exc}") from exc

        sheet_names = list(sheets.keys())
        table, sheet_name, best_score = None, None, -1
        for name, raw in sheets.items():
            candidate = _apply_header_row(raw)
            if candidate.empty:
                continue
            score = _header_score(candidate.columns)
            if score > best_score:
                table, sheet_name, best_score = candidate, name, score
        if table is None:
            raise SpreadsheetError("All sheets in this workbook are empty.")

    if table.empty:
        raise SpreadsheetError("No data rows found under the header row.")
    if len(table) > MAX_ROWS:
        raise SpreadsheetError(f"File has {len(table)} rows; the limit is {MAX_ROWS} per file.")
    return table, sheet_name, sheet_names


def _preview_value(v):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return ""
    if isinstance(v, (pd.Timestamp,)) or hasattr(v, "strftime"):
        try:
            return v.strftime("%Y-%m-%d")
        except Exception:
            pass
    return str(v)


def describe_table(table: pd.DataFrame, preview_rows: int = 8):
    columns = [str(c) for c in table.columns]
    preview = [
        {col: _preview_value(v) for col, v in zip(columns, row)}
        for row in table.head(preview_rows).itertuples(index=False, name=None)
    ]
    return {
        "columns": columns,
        "row_count": int(len(table)),
        "preview": preview,
        "suggested_mapping": suggest_mapping(columns),
    }


_NUMBER_RE = re.compile(r"-?\d+(?:\.\d+)?")


def _to_number(series: pd.Series) -> pd.Series:
    def convert(v):
        if v is None:
            return np.nan
        if isinstance(v, (int, float, np.integer, np.floating)) and not isinstance(v, bool):
            return float(v)
        match = _NUMBER_RE.search(str(v).replace(",", ""))
        return float(match.group()) if match else np.nan
    return series.map(convert).astype(float)


_FALSE_WORDS = {"", "no", "n", "0", "false", "none", "nil", "na", "n/a", "-", "normal", "regular", "nan"}


def _flag_and_label(series: pd.Series):
    """Yes/No, 1/0, or a festival name ("Diwali") -> (0/1 flag, name or None)."""
    def convert(v):
        if v is None or (isinstance(v, float) and np.isnan(v)):
            return 0, None
        if isinstance(v, (bool, np.bool_)):
            return int(v), None
        if isinstance(v, (int, float, np.integer, np.floating)):
            return int(float(v) > 0), None
        text = str(v).strip()
        if text.lower() in _FALSE_WORDS:
            return 0, None
        if text.lower() in {"yes", "y", "1", "true", "t", "holiday", "festival", "promo", "offer"}:
            return 1, None
        return 1, text
    pairs = series.map(convert)
    return pairs.map(lambda p: p[0]).astype(int), pairs.map(lambda p: p[1])


def discount_to_percent(series: pd.Series, header: str, price, quantity) -> pd.Series:
    """
    Discount columns come as percent (10), fraction (0.1) or rupees (₹5 per unit or per line).
    Percent/fraction is used when the header says so (%/pct/percent) or all values are <= 100;
    rupee headers (amount/amt/rs/₹/value) or values above 100 are converted using the unit price.
    """
    values = _to_number(series)
    h = header.lower()
    is_amount = "₹" in h or bool(re.search(r"\b(amount|amt|rs|value|inr|rupees?)\b", h))
    is_pct = "%" in h or bool(re.search(r"\b(pct|percent|percentage)\b", h))
    valid = values.dropna()

    if is_pct or (not is_amount and (valid.empty or valid.max() <= 100)):
        pct = values * 100 if (not valid.empty and valid.max() <= 1) else values
    elif price is not None:
        unit_price = pd.to_numeric(price, errors="coerce").reindex(values.index)
        qty = pd.to_numeric(quantity, errors="coerce").reindex(values.index).abs().clip(lower=1)
        per_unit = values < unit_price
        pct = np.where(per_unit, values / unit_price * 100, values / (unit_price * qty) * 100)
        pct = pd.Series(pct, index=values.index)
    else:
        pct = pd.Series(np.nan, index=values.index)
    return pct.clip(lower=0, upper=100)


def parse_dates(series: pd.Series) -> pd.Series:
    """Parse mixed date cells. Text dates are read day-first (Indian format: 26/9/2026)."""
    out = pd.Series(pd.NaT, index=series.index, dtype="datetime64[ns]")

    is_dt = series.map(lambda v: isinstance(v, (pd.Timestamp, np.datetime64)) or hasattr(v, "year"))
    if is_dt.any():
        out[is_dt] = pd.to_datetime(series[is_dt], errors="coerce")

    is_num = series.map(lambda v: isinstance(v, (int, float, np.integer, np.floating))
                        and not isinstance(v, bool)) & ~is_dt
    if is_num.any():
        serial = pd.to_numeric(series[is_num], errors="coerce")
        valid = serial.between(20000, 80000)
        out[serial[valid].index] = pd.to_datetime(serial[valid], unit="D", origin="1899-12-30")

    rest = ~is_dt & ~is_num & series.notna()
    if rest.any():
        text = series[rest].astype(str).str.strip()
        iso = text.str.match(r"^\d{4}-\d{1,2}-\d{1,2}")
        if iso.any():
            out[text[iso].index] = pd.to_datetime(text[iso].str[:10], errors="coerce", format="%Y-%m-%d")
        if (~iso).any():
            out[text[~iso].index] = pd.to_datetime(text[~iso], errors="coerce", dayfirst=True, format="mixed")

    return out.dt.normalize()


def normalize_rows(table: pd.DataFrame, mapping: dict):
    """Convert a raw table into uniform sales records using the column mapping."""
    mapping = {k: v for k, v in (mapping or {}).items() if v}
    missing = [f for f in REQUIRED_FIELDS if f not in mapping]
    if missing:
        raise SpreadsheetError(f"Select a column for: {', '.join(missing)}.")
    unknown = [col for col in mapping.values() if col not in table.columns]
    if unknown:
        raise SpreadsheetError(f"Columns not found in file: {', '.join(map(str, unknown))}.")

    total = int(len(table))
    dates = parse_dates(table[mapping["date"]])
    products = table[mapping["product"]].map(
        lambda v: "" if v is None or (isinstance(v, float) and np.isnan(v)) else re.sub(r"\s+", " ", str(v)).strip()
    )
    quantity = _to_number(table[mapping["quantity"]])

    bad_date = dates.isna()
    missing_product = products == ""
    bad_quantity = quantity.isna()
    keep = ~(bad_date | missing_product | bad_quantity)

    df = pd.DataFrame({
        "date": dates[keep].dt.strftime("%Y-%m-%d"),
        "product": products[keep],
        "quantity": quantity[keep],
    })
    if "category" in mapping:
        cat = table.loc[keep, mapping["category"]].map(
            lambda v: "" if v is None or (isinstance(v, float) and np.isnan(v)) else str(v).strip()
        )
        df["category"] = cat.replace("", None)
    if "price" in mapping:
        df["price"] = _to_number(table.loc[keep, mapping["price"]])
    if "stock" in mapping:
        df["stock"] = _to_number(table.loc[keep, mapping["stock"]])
    if "cost" in mapping:
        df["cost"] = _to_number(table.loc[keep, mapping["cost"]])
    if "discount" in mapping:
        df["discount_pct"] = discount_to_percent(
            table.loc[keep, mapping["discount"]], str(mapping["discount"]),
            df["price"] if "price" in df.columns else None, df["quantity"],
        )
    if "festival" in mapping:
        flags, names = _flag_and_label(table.loc[keep, mapping["festival"]])
        df["festival"] = flags
        df["festival_name"] = names
    if "promotion" in mapping:
        df["promotion"], _ = _flag_and_label(table.loc[keep, mapping["promotion"]])

    df = df.replace({np.nan: None})
    rows = df.to_dict(orient="records")

    stats = {
        "total_rows": total,
        "valid_rows": len(rows),
        "skipped_rows": total - len(rows),
        "skipped_reasons": {
            "invalid_date": int(bad_date.sum()),
            "missing_product": int((missing_product & ~bad_date).sum()),
            "invalid_quantity": int((bad_quantity & ~bad_date & ~missing_product).sum()),
        },
        "date_from": min((r["date"] for r in rows), default=None),
        "date_to": max((r["date"] for r in rows), default=None),
        "product_count": int(df["product"].str.lower().nunique()) if rows else 0,
    }
    if not rows:
        raise SpreadsheetError(
            "No usable rows: check that the date, product and quantity columns are mapped correctly."
        )
    return rows, stats
