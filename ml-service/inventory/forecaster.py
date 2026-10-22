"""
CatBoost inventory planner.

Input: every sales record uploaded for one market (many files combined).
Output: per product — forecast demand, safety stock, the stock level the
shop should hold, and how much to order now.

Method
  * Daily demand per product (transactions summed, missing days = 0 sales).
  * One CatBoost regressor across all products of the market. Product and
    category are native categorical features, so products with little
    history borrow patterns from similar ones.
  * Features use only information available before the day being predicted
    (lags, rolling means, calendar, salary-cycle), plus attributes the shop
    controls or knows in advance: selling price, discount %, promotion flag
    and festival proximity (built-in calendar + festivals flagged in sheets +
    local festival dates). Future days are forecast recursively using the
    latest price, the planned (or latest) discount, and upcoming festivals.
  * Cost price does not drive customer demand, so it is not a model feature;
    it is used for the cash needed to place the order and the expected profit.
  * The model is checked on the most recent days (holdout) against a
    28-day moving-average baseline; both errors are reported.
  * Order-up-to policy: target = demand over (restock interval + supplier
    lead time) + safety stock; order = target - current stock.
"""

import math
import warnings
from statistics import NormalDist

import numpy as np
import pandas as pd

from .festivals import festival_days, upcoming

MIN_HISTORY_DAYS_FOR_MODEL = 28
MAX_TRAINING_DAYS = 730
SLOW_MOVING_WINDOW = 28
FESTIVAL_LOOKAHEAD_CLIP = 21
FESTIVAL_AFTER_CLIP = 7
UPCOMING_FESTIVAL_DAYS = 30

FEATURE_NAMES = [
    "product", "category",
    "lag_1", "lag_7", "lag_14",
    "mean_7", "mean_28", "std_7", "same_weekday_mean_4w", "zero_share_28",
    "days_since_first_sale",
    "day_of_week", "day_of_month", "month", "is_weekend",
    "is_salary_week", "is_month_end",
    "price", "price_vs_usual", "discount_pct", "on_promotion",
    "is_festival", "days_to_festival", "days_after_festival", "festival_importance",
]
CAT_FEATURES = ["product", "category"]

CATBOOST_PARAMS = dict(
    iterations=500,
    depth=6,
    learning_rate=0.06,
    loss_function="RMSE",
    # Target-statistic (CTR) combinations of product x category cost ~30s even on a few
    # hundred rows; one-hot encoding is sub-second for typical shop catalogues.
    one_hot_max_size=255,
    max_ctr_complexity=1,
    random_seed=42,
    verbose=False,
    allow_writing_files=False,
    thread_count=-1,
)

STATUS_ORDER = {"critical": 0, "reorder": 1, "stock_unknown": 2, "ok": 3, "overstock": 4, "slow_moving": 5}


class ForecastInputError(ValueError):
    pass


# ─── Data preparation ───────────────────────────────────────

def _prepare(rows):
    if not rows:
        raise ForecastInputError("No sales rows uploaded for this market yet.")

    df = pd.DataFrame(rows)
    for col in ("category", "price", "stock", "upload_id", "cost", "discount_pct", "festival",
                "festival_name", "promotion"):
        if col not in df.columns:
            df[col] = None
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    for col in ("quantity", "price", "stock", "cost", "discount_pct", "festival", "promotion"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["product"] = df["product"].astype(str).str.strip()
    df = df.dropna(subset=["date", "quantity"])
    df = df[df["product"] != ""]
    if df.empty:
        raise ForecastInputError("No valid sales rows (date, product, quantity) found.")

    df["key"] = df["product"].str.lower().str.replace(r"\s+", " ", regex=True)

    overlapping = 0
    if df["upload_id"].notna().any():
        per_key = df.dropna(subset=["upload_id"]).groupby(["key", "date"])["upload_id"].nunique()
        overlapping = int((per_key > 1).sum())

    meta = {}
    for key, g in df.groupby("key", sort=True):
        g = g.sort_values("date")
        cats = g["category"].dropna().astype(str)
        cats = cats[cats.str.strip() != ""]
        prices = g["price"].dropna()
        costs = g["cost"].dropna()
        discounts = g["discount_pct"].dropna()
        stock_rows = g.dropna(subset=["stock"])
        meta[key] = {
            "name": g["product"].mode().iloc[0],
            "category": cats.mode().iloc[0] if not cats.empty else "General",
            "last_price": float(prices.iloc[-1]) if not prices.empty else None,
            "last_cost": float(costs.iloc[-1]) if not costs.empty else None,
            "last_discount": float(discounts.iloc[-1]) if not discounts.empty else None,
            "sheet_stock": float(stock_rows["stock"].iloc[-1]) if not stock_rows.empty else None,
            "sheet_stock_date": stock_rows["date"].iloc[-1].strftime("%Y-%m-%d") if not stock_rows.empty else None,
            "integer_units": bool(np.all(np.isclose(g["quantity"], np.round(g["quantity"])))),
        }

    daily = df.groupby(["key", "date"])["quantity"].sum().clip(lower=0)

    end = df["date"].max()
    start = max(df["date"].min(), end - pd.Timedelta(days=MAX_TRAINING_DAYS - 1))
    dates = pd.date_range(start, end, freq="D")
    keys = sorted(meta.keys())

    Y = np.full((len(keys), len(dates)), np.nan)
    first_idx = np.zeros(len(keys), dtype=int)
    date_pos = {d: i for i, d in enumerate(dates)}
    for p, key in enumerate(keys):
        series = daily.loc[key]
        series = series[series.index >= start]
        first = series.index.min() if not series.empty else end
        first_idx[p] = date_pos[first]
        Y[p, first_idx[p]:] = 0.0
        for d, q in series.items():
            Y[p, date_pos[d]] = q

    def daily_matrix(col, how):
        sub = df.dropna(subset=[col])
        sub = sub[sub["date"] >= start]
        if sub.empty:
            return np.full((len(keys), len(dates)), np.nan)
        wide = sub.groupby(["key", "date"])[col].agg(how).unstack("date")
        return wide.reindex(index=keys, columns=dates).to_numpy(dtype=float)

    festival_rows = df[df["festival"] > 0]
    sheet_festival_names = {}
    for d, names in festival_rows.groupby("date")["festival_name"]:
        named = names.dropna().astype(str)
        sheet_festival_names[d] = named.mode().iloc[0] if not named.empty else None

    return {
        "keys": keys,
        "meta": meta,
        "dates": dates,
        "Y": Y,
        "first_idx": first_idx,
        "price": daily_matrix("price", "mean"),
        "discount": daily_matrix("discount_pct", "mean"),
        "promotion": daily_matrix("promotion", "max"),
        "has_discount": bool(df["discount_pct"].notna().any()),
        "has_promotion": bool(df["promotion"].notna().any()),
        "has_cost": bool(df["cost"].notna().any()),
        "sheet_festival_dates": sorted(sheet_festival_names.keys()),
        "sheet_festival_names": sheet_festival_names,
        "row_count": int(len(df)),
        "overlapping_entries": overlapping,
        "uploads": int(df["upload_id"].nunique()) if df["upload_id"].notna().any() else 1,
        "raw_date_from": df["date"].min().strftime("%Y-%m-%d"),
    }


# ─── Features ───────────────────────────────────────────────

def _window(Y, t, size):
    lo = max(0, t - size)
    return Y[:, lo:t] if t > lo else np.full((Y.shape[0], 1), np.nan)


def _ffill_rows(M):
    """Forward-fill each row, then back-fill the leading gap with the first known value."""
    if M.size == 0 or np.all(np.isnan(M)):
        return M
    out = pd.DataFrame(M).ffill(axis=1).bfill(axis=1).to_numpy(dtype=float)
    return out


def _build_context(data, horizon, planned_discount_pct=None, local_festival_dates=None):
    """
    Per-day attributes for history + forecast horizon (N = T + horizon columns).
    History uses what was recorded; future days use the latest price, the planned
    discount (or latest), no promotion, and the festival calendar.
    """
    keys, dates, T = data["keys"], data["dates"], data["Y"].shape[1]
    N = T + horizon
    all_dates = pd.date_range(dates[0], periods=N, freq="D")

    def extend(M, future_value=None):
        filled = _ffill_rows(M)
        last = filled[:, -1:] if filled.shape[1] else np.full((len(keys), 1), np.nan)
        fut = np.repeat(last, horizon, axis=1)
        if future_value is not None:
            fut = np.full_like(fut, float(future_value))
        return np.concatenate([filled, fut], axis=1)

    price = extend(data["price"])
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)
        usual = np.nanmean(price[:, :T], axis=1, keepdims=True)
        price_vs_usual = np.where(usual > 0, price / usual, np.nan)

    if data["has_discount"]:
        discount = np.nan_to_num(extend(data["discount"], planned_discount_pct), nan=0.0)
    else:
        # Without discount history the model cannot learn its effect; a planned discount is ignored.
        discount = np.full((len(keys), N), np.nan)

    promo_hist = np.nan_to_num(data["promotion"], nan=0.0)
    promotion = np.concatenate([promo_hist, np.zeros((len(keys), horizon))], axis=1)

    local = [pd.Timestamp(d) for d in (local_festival_dates or [])]
    fest_map = festival_days(list(data["sheet_festival_dates"]) + local, data["sheet_festival_names"])

    is_fest = np.array([int(d in fest_map) for d in all_dates])
    importance = np.array([fest_map[d][1] if d in fest_map else 0 for d in all_dates], dtype=float)
    fest_idx = np.flatnonzero(is_fest)
    # Look beyond the planning window so "days to festival" is known near the end.
    ahead_dates = pd.date_range(all_dates[-1] + pd.Timedelta(days=1), periods=FESTIVAL_LOOKAHEAD_CLIP, freq="D")
    ahead_idx = np.array([N + i for i, d in enumerate(ahead_dates) if d in fest_map], dtype=int)
    ahead_imp = {N + i: fest_map[d][1] for i, d in enumerate(ahead_dates) if d in fest_map}
    future_starts = np.concatenate([fest_idx, ahead_idx])

    days_to = np.full(N, FESTIVAL_LOOKAHEAD_CLIP, dtype=float)
    days_after = np.full(N, FESTIVAL_AFTER_CLIP + 1, dtype=float)
    upcoming_imp = importance.copy()
    for t in range(N):
        nxt = future_starts[future_starts >= t]
        if nxt.size:
            gap = int(nxt[0] - t)
            days_to[t] = min(gap, FESTIVAL_LOOKAHEAD_CLIP)
            if gap <= 7 and upcoming_imp[t] == 0:
                upcoming_imp[t] = importance[nxt[0]] if nxt[0] < N else ahead_imp.get(int(nxt[0]), 0)
        prev = fest_idx[fest_idx <= t]
        if prev.size:
            days_after[t] = min(t - int(prev[-1]), FESTIVAL_AFTER_CLIP + 1)

    return {
        "dates": all_dates,
        "price": price,
        "price_vs_usual": price_vs_usual,
        "discount": discount,
        "promotion": promotion,
        "is_festival": is_fest,
        "days_to_festival": days_to,
        "days_after_festival": days_after,
        "festival_importance": upcoming_imp,
        "festival_map": fest_map,
    }


def _features_for_day(Y, t, keys, meta, first_idx, ctx):
    """Features for predicting column t using only sales columns < t."""
    day = ctx["dates"][t]
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)
        w7, w28 = _window(Y, t, 7), _window(Y, t, 28)
        same_dow = np.stack([Y[:, t - k] if t - k >= 0 else np.full(Y.shape[0], np.nan)
                             for k in (7, 14, 21, 28)], axis=1)
        feats = {
            "lag_1": Y[:, t - 1] if t >= 1 else np.full(Y.shape[0], np.nan),
            "lag_7": Y[:, t - 7] if t >= 7 else np.full(Y.shape[0], np.nan),
            "lag_14": Y[:, t - 14] if t >= 14 else np.full(Y.shape[0], np.nan),
            "mean_7": np.nanmean(w7, axis=1),
            "mean_28": np.nanmean(w28, axis=1),
            "std_7": np.nanstd(w7, axis=1),
            "same_weekday_mean_4w": np.nanmean(same_dow, axis=1),
            "zero_share_28": np.nanmean(np.where(np.isnan(w28), np.nan, (w28 == 0).astype(float)), axis=1),
        }
    n = len(keys)
    feats.update({
        "product": [meta[k]["name"] for k in keys],
        "category": [meta[k]["category"] for k in keys],
        "days_since_first_sale": (t - first_idx).astype(float),
        "day_of_week": np.full(n, day.dayofweek),
        "day_of_month": np.full(n, day.day),
        "month": np.full(n, day.month),
        "is_weekend": np.full(n, int(day.dayofweek >= 5)),
        "is_salary_week": np.full(n, int(day.day <= 7)),
        "is_month_end": np.full(n, int(day.day >= 25)),
        "price": ctx["price"][:, t],
        "price_vs_usual": ctx["price_vs_usual"][:, t],
        "discount_pct": ctx["discount"][:, t],
        "on_promotion": ctx["promotion"][:, t],
        "is_festival": np.full(n, ctx["is_festival"][t]),
        "days_to_festival": np.full(n, ctx["days_to_festival"][t]),
        "days_after_festival": np.full(n, ctx["days_after_festival"][t]),
        "festival_importance": np.full(n, ctx["festival_importance"][t]),
    })
    return pd.DataFrame(feats)[FEATURE_NAMES]


def _training_frame(Y, keys, meta, first_idx, t_end, ctx):
    frames, targets = [], []
    for t in range(1, t_end):
        active = first_idx < t
        if not active.any():
            continue
        X = _features_for_day(Y, t, keys, meta, first_idx, ctx)[active]
        frames.append(X)
        targets.append(Y[active, t])
    if not frames:
        return None, None
    return pd.concat(frames, ignore_index=True), np.concatenate(targets)


def _fit(X, y):
    from catboost import CatBoostRegressor
    model = CatBoostRegressor(**CATBOOST_PARAMS)
    model.fit(X, y, cat_features=CAT_FEATURES)
    return model


def _recursive_forecast(model, Y_hist, keys, meta, first_idx, horizon, ctx):
    P, T = Y_hist.shape
    Y = np.concatenate([Y_hist, np.zeros((P, horizon))], axis=1)
    for h in range(horizon):
        t = T + h
        X = _features_for_day(Y, t, keys, meta, first_idx, ctx)
        Y[:, t] = np.clip(model.predict(X), 0, None)
    return Y[:, T:]


def _moving_average_forecast(Y_hist, horizon):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)
        level = np.nan_to_num(np.nanmean(_window(Y_hist, Y_hist.shape[1], 28), axis=1))
    return np.repeat(level[:, None], horizon, axis=1)


def _wmape(actual, pred):
    mask = ~np.isnan(actual)
    denom = np.abs(actual[mask]).sum()
    if denom == 0:
        return None
    return float(np.abs(actual[mask] - pred[mask]).sum() / denom * 100)


# ─── Plan ───────────────────────────────────────────────────

def _round_up(value, integer_units):
    if value <= 0:
        return 0
    return int(math.ceil(value - 1e-9)) if integer_units else math.ceil(value * 10 - 1e-9) / 10


def _relative_effect(Y, mask, first_idx):
    """Average demand on masked product-days relative to each product's own average (in %)."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)
        base = np.nanmean(Y, axis=1, keepdims=True)
        rel = np.where(base > 0, Y / base, np.nan)
    active = np.zeros_like(Y, dtype=bool)
    for p, f in enumerate(first_idx):
        active[p, f:] = True
    on, off = rel[mask & active], rel[~mask & active]
    on, off = on[~np.isnan(on)], off[~np.isnan(off)]
    if len(on) < 5 or len(off) < 5 or off.mean() == 0:
        return None
    return round(float((on.mean() / off.mean() - 1) * 100), 1), int(len(on))


def _market_festival_uplift(Y, is_fest_hist):
    """Market-wide daily units on festival days vs normal days; None if not measurable."""
    totals = np.nansum(Y, axis=0)
    fest, normal = totals[is_fest_hist == 1], totals[is_fest_hist == 0]
    if len(fest) < 2 or len(normal) < 7 or normal.mean() <= 0:
        return None
    return float(fest.mean() / normal.mean()), int(len(fest))


def build_inventory_plan(rows, current_stock=None, review_days=7, lead_time_days=2, service_level=0.95,
                         planned_discount_pct=None, local_festival_dates=None):
    """
    rows:                 [{date, product, quantity, category?, price?, stock?, cost?, discount_pct?,
                            festival?, festival_name?, promotion?, upload_id?}]
    current_stock:        {product name (any case): quantity} from the shop's live inventory
    review_days:          how many days until the next restock after this order
    lead_time_days:       supplier delivery time
    service_level:        probability of not running out before the next delivery
    planned_discount_pct: discount the shop plans to give in the planning period (None = keep latest)
    local_festival_dates: extra festival dates (YYYY-MM-DD) for the shop's area
    """
    if not 1 <= int(review_days) <= 60:
        raise ForecastInputError("Restock interval must be between 1 and 60 days.")
    if not 0 <= int(lead_time_days) <= 30:
        raise ForecastInputError("Supplier lead time must be between 0 and 30 days.")
    if not 0.5 <= float(service_level) < 1:
        raise ForecastInputError("Service level must be between 0.50 and 0.99.")
    if planned_discount_pct is not None and not 0 <= float(planned_discount_pct) <= 90:
        raise ForecastInputError("Planned discount must be between 0 and 90%.")
    local_dates = []
    for d in local_festival_dates or []:
        ts = pd.to_datetime(d, errors="coerce")
        if pd.isna(ts):
            raise ForecastInputError(f"Local festival date '{d}' is not a valid date (use YYYY-MM-DD).")
        local_dates.append(ts.normalize())

    data = _prepare(rows)
    keys, meta, dates, Y, first_idx = data["keys"], data["meta"], data["dates"], data["Y"], data["first_idx"]
    P, T = Y.shape
    horizon = int(review_days) + int(lead_time_days)
    last_date = dates[-1]
    notes = []
    ctx = _build_context(data, horizon, planned_discount_pct, local_dates)
    is_fest_hist = ctx["is_festival"][:T]

    stock_lookup = {}
    for name, qty in (current_stock or {}).items():
        try:
            stock_lookup[str(name).strip().lower()] = float(qty)
        except (TypeError, ValueError):
            continue

    validation = None
    residual_std = None
    feature_importance = []

    if T >= MIN_HISTORY_DAYS_FOR_MODEL:
        method = "catboost"
        holdout = int(min(14, max(7, T // 5)))
        cutoff = T - holdout
        X_val, y_val = _training_frame(Y, keys, meta, first_idx, cutoff, ctx)
        if X_val is not None and len(X_val) > 50:
            val_model = _fit(X_val, y_val)
            eligible = first_idx < cutoff
            pred = _recursive_forecast(val_model, Y[:, :cutoff], keys, meta, first_idx, holdout, ctx)
            base = _moving_average_forecast(Y[:, :cutoff], holdout)
            actual = Y[:, cutoff:]
            validation = {
                "holdout_days": holdout,
                "holdout_from": dates[cutoff].strftime("%Y-%m-%d"),
                "holdout_to": dates[-1].strftime("%Y-%m-%d"),
                "catboost_wmape": _wmape(actual[eligible], pred[eligible]),
                "baseline_wmape": _wmape(actual[eligible], base[eligible]),
                "baseline": "28-day moving average",
            }
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", category=RuntimeWarning)
                residual_std = np.nanstd(np.where(eligible[:, None], actual - pred, np.nan), axis=1)

        X_all, y_all = _training_frame(Y, keys, meta, first_idx, T, ctx)
        model = _fit(X_all, y_all)
        forecast = _recursive_forecast(model, Y, keys, meta, first_idx, horizon, ctx)
        importances = model.get_feature_importance()
        feature_importance = sorted(
            ({"feature": f, "importance": round(float(v), 2)} for f, v in zip(FEATURE_NAMES, importances)),
            key=lambda x: -x["importance"],
        )[:8]
        if validation and validation["catboost_wmape"] is not None and validation["baseline_wmape"] is not None \
                and validation["catboost_wmape"] > validation["baseline_wmape"]:
            notes.append("On the most recent days the CatBoost model was less accurate than a simple moving "
                         "average. Upload more history to improve it and treat these numbers with caution.")
    else:
        method = "moving_average"
        forecast = _moving_average_forecast(Y, horizon)
        notes.append(f"Only {T} days of sales history. At least {MIN_HISTORY_DAYS_FOR_MODEL} days are needed "
                     f"to train the CatBoost model, so a moving-average estimate is shown instead.")
        uplift = _market_festival_uplift(Y, is_fest_hist)
        if uplift:
            factor = float(np.clip(uplift[0], 0.5, 3.0))
            forecast = forecast * np.where(ctx["is_festival"][T:] == 1, factor, 1.0)[None, :]

    fest_map = ctx["festival_map"]
    upcoming_festivals = upcoming(fest_map, last_date + pd.Timedelta(days=1),
                                  last_date + pd.Timedelta(days=max(horizon, UPCOMING_FESTIVAL_DAYS)))
    in_window = [f for f in upcoming_festivals if f["date"] <= (last_date + pd.Timedelta(days=horizon)).strftime("%Y-%m-%d")]
    fest_uplift = _market_festival_uplift(Y, is_fest_hist)
    if in_window and not fest_uplift:
        names = ", ".join(sorted({f["name"] for f in in_window}))
        notes.append(f"{names} falls in this planning period, but your uploaded history has too few festival days "
                     f"to measure how festivals change your sales. Consider stocking extra for festival items "
                     f"and upload sales from last year's festival season to let the model learn it.")

    attribute_effects = {
        "festival": {"uplift_pct": round((fest_uplift[0] - 1) * 100, 1), "days": fest_uplift[1]} if fest_uplift else None,
        "discount": None,
        "promotion": None,
    }
    if data["has_discount"]:
        disc_hist = ctx["discount"][:, :T]
        eff = _relative_effect(Y, np.nan_to_num(disc_hist) > 0, first_idx)
        attribute_effects["discount"] = {"uplift_pct": eff[0], "days": eff[1]} if eff else None
    if data["has_promotion"]:
        eff = _relative_effect(Y, ctx["promotion"][:, :T] > 0, first_idx)
        attribute_effects["promotion"] = {"uplift_pct": eff[0], "days": eff[1]} if eff else None
    if planned_discount_pct is not None and not data["has_discount"]:
        notes.append("A planned discount was entered, but the uploaded sheets have no discount column, so the "
                     "model cannot know how discounts change your sales. Map a discount column to use it.")

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)
        hist_std = np.nan_to_num(np.nanstd(_window(Y, T, 28), axis=1))
        recent_mean = np.nan_to_num(np.nanmean(_window(Y, T, 28), axis=1))
    sigma = hist_std if residual_std is None else np.where(np.isnan(residual_std), hist_std, residual_std)
    z = NormalDist().inv_cdf(float(service_level))

    forecast_dates = [(last_date + pd.Timedelta(days=h + 1)).strftime("%Y-%m-%d") for h in range(horizon)]
    products = []
    for p, key in enumerate(keys):
        m = meta[key]
        daily = forecast[p]
        lead_demand = float(daily[:lead_time_days].sum())
        period_demand = float(daily.sum())
        safety = float(z * sigma[p] * math.sqrt(max(1, horizon)))
        target = period_demand + safety
        avg_daily_forecast = period_demand / horizon if horizon else 0.0

        if key in stock_lookup:
            stock, stock_source = stock_lookup[key], "shop_inventory"
        elif m["sheet_stock"] is not None:
            stock, stock_source = m["sheet_stock"], "uploaded_sheet"
        else:
            stock, stock_source = None, None

        window_start = max(first_idx[p], T - SLOW_MOVING_WINDOW)
        sold_recently = float(np.nansum(Y[p, window_start:T]))
        old_enough = T - first_idx[p] >= SLOW_MOVING_WINDOW

        if old_enough and sold_recently == 0:
            status = "slow_moving"
        elif stock is None:
            status = "stock_unknown"
        elif stock <= lead_demand or stock <= 0:
            status = "critical"
        elif stock < target:
            status = "reorder"
        elif target > 0 and stock > 2 * target:
            status = "overstock"
        else:
            status = "ok"

        target_rounded = _round_up(target, m["integer_units"]) if status != "slow_moving" else 0
        base_stock = stock if stock is not None else 0
        order_qty = 0 if status in ("slow_moving", "overstock", "ok") else _round_up(target - base_stock, m["integer_units"])

        price, cost = m["last_price"], m["last_cost"]
        disc_now = float(ctx["discount"][p, T]) if data["has_discount"] and not np.isnan(ctx["discount"][p, T]) else 0.0
        effective_price = price * (1 - disc_now / 100) if price is not None else None
        unit_profit = effective_price - cost if effective_price is not None and cost is not None else None

        products.append({
            "product": m["name"],
            "category": m["category"],
            "avg_daily_sales_last_28d": round(float(recent_mean[p]), 2),
            "avg_daily_forecast": round(avg_daily_forecast, 2),
            "forecast_period_demand": round(period_demand, 2),
            "lead_time_demand": round(lead_demand, 2),
            "safety_stock": round(safety, 2),
            "recommended_stock": target_rounded,
            "current_stock": stock,
            "stock_source": stock_source,
            "stock_as_of": m["sheet_stock_date"] if stock_source == "uploaded_sheet" else None,
            "order_quantity": order_qty,
            "days_of_cover": round(stock / avg_daily_forecast, 1) if stock is not None and avg_daily_forecast > 0 else None,
            "unit_price": price,
            "unit_cost": cost,
            "discount_pct": round(disc_now, 1) if data["has_discount"] else None,
            "margin_pct": round(unit_profit / effective_price * 100, 1) if unit_profit is not None and effective_price else None,
            "estimated_order_value": round(order_qty * price, 2) if price else None,
            "estimated_order_cost": round(order_qty * cost, 2) if cost else None,
            "expected_profit": round(period_demand * unit_profit, 2) if unit_profit is not None else None,
            "status": status,
            "daily_forecast": [round(float(v), 2) for v in daily],
        })

    products.sort(key=lambda r: (STATUS_ORDER[r["status"]], -(r["estimated_order_value"] or 0), -r["forecast_period_demand"]))
    loss_makers = [r["product"] for r in products if r["margin_pct"] is not None and r["margin_pct"] < 0]
    if loss_makers:
        notes.append(f"{len(loss_makers)} product(s) sell below cost after discount: "
                     f"{', '.join(loss_makers[:5])}{'…' if len(loss_makers) > 5 else ''}.")

    today = pd.Timestamp.now().normalize()
    if (today - last_date).days > 7:
        notes.append(f"Your latest uploaded sale is from {last_date.strftime('%d %b %Y')}. The forecast starts the "
                     f"day after that date. Upload recent sales for an up-to-date plan.")
    if data["overlapping_entries"]:
        notes.append(f"{data['overlapping_entries']} product-day entries appear in more than one uploaded file and "
                     f"were added together. Remove duplicate files if the same sales were uploaded twice.")
    if any(r["status"] == "stock_unknown" for r in products):
        notes.append("Some products have no current stock (not in your shop inventory and no stock column in the "
                     "sheets). Their order quantity equals the full recommended stock.")

    status_counts = {s: 0 for s in STATUS_ORDER}
    for r in products:
        status_counts[r["status"]] += 1

    return {
        "method": method,
        "model": "CatBoostRegressor (global model across products)" if method == "catboost" else "28-day moving average",
        "settings": {
            "review_days": int(review_days),
            "lead_time_days": int(lead_time_days),
            "service_level": float(service_level),
            "forecast_horizon_days": horizon,
            "planned_discount_pct": float(planned_discount_pct) if planned_discount_pct is not None else None,
            "local_festival_dates": [d.strftime("%Y-%m-%d") for d in local_dates],
        },
        "attributes_used": {
            "price": bool(not np.all(np.isnan(data["price"]))),
            "discount": data["has_discount"],
            "promotion": data["has_promotion"],
            "cost": data["has_cost"],
            "festival_flags_in_sheets": len(data["sheet_festival_dates"]),
            "festival_calendar": True,
        },
        "attribute_effects": attribute_effects,
        "upcoming_festivals": upcoming_festivals,
        "data": {
            "rows": data["row_count"],
            "uploads": data["uploads"],
            "products": P,
            "history_days": int(T),
            "date_from": data["raw_date_from"],
            "date_to": last_date.strftime("%Y-%m-%d"),
            "overlapping_entries": data["overlapping_entries"],
        },
        "validation": validation,
        "feature_importance": feature_importance,
        "forecast_dates": forecast_dates,
        "summary": {
            "status_counts": status_counts,
            "products_to_order": sum(1 for r in products if r["order_quantity"] > 0),
            "total_order_value": round(sum(r["estimated_order_value"] or 0 for r in products), 2),
            "total_order_cost": round(sum(r["estimated_order_cost"] or 0 for r in products), 2) if data["has_cost"] else None,
            "expected_profit": round(sum(r["expected_profit"] or 0 for r in products), 2) if data["has_cost"] else None,
        },
        "notes": notes,
        "products": products,
    }
