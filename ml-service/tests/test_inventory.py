import io
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from inventory.excel_loader import (  # noqa: E402
    SpreadsheetError, read_table, suggest_mapping, normalize_rows, parse_dates, describe_table,
    discount_to_percent,
)
from inventory.forecaster import build_inventory_plan, ForecastInputError  # noqa: E402
from inventory.festivals import festival_days  # noqa: E402


def _xlsx_bytes(sheets):
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        for name, (df, startrow) in sheets.items():
            df.to_excel(writer, sheet_name=name, index=False, startrow=startrow)
    return buf.getvalue()


def _synthetic_rows(days=120, end="2026-09-27", upload_id="u1"):
    """Rice sells far more on weekends, milk is steady, candles stopped selling."""
    rng = np.random.default_rng(0)
    rows = []
    for d in pd.date_range(end=end, periods=days, freq="D"):
        weekend = d.dayofweek >= 5
        rice = rng.poisson(30 if weekend else 8)
        milk = rng.poisson(20)
        rows.append({"date": d.strftime("%Y-%m-%d"), "product": "Rice 1kg", "quantity": float(rice),
                     "category": "Grains", "price": 60.0, "upload_id": upload_id})
        rows.append({"date": d.strftime("%Y-%m-%d"), "product": "Milk 500ml", "quantity": float(milk),
                     "category": "Dairy", "price": 28.0, "upload_id": upload_id})
        if d < pd.Timestamp(end) - pd.Timedelta(days=40):
            rows.append({"date": d.strftime("%Y-%m-%d"), "product": "Candles", "quantity": 2.0,
                         "category": "Pooja", "price": 10.0, "upload_id": upload_id})
    return rows


# ─── Loader ─────────────────────────────────────────────────

def test_suggest_mapping_understands_common_shop_headers():
    mapping = suggest_mapping(["Bill Date", "Item Name", "Qty", "Rate", "Closing Stock", "Customer Name", "Amount"])
    assert mapping == {
        "date": "Bill Date", "product": "Item Name", "quantity": "Qty",
        "category": None, "price": "Rate", "stock": "Closing Stock",
        "cost": None, "discount": None, "festival": None, "promotion": None,
    }


def test_suggest_mapping_finds_cost_discount_festival_promotion():
    mapping = suggest_mapping(["Date", "Product", "Qty", "Selling Price", "Purchase Price",
                               "Offer %", "Festival", "Promo", "Total Amount"])
    assert mapping["price"] == "Selling Price"
    assert mapping["cost"] == "Purchase Price"
    assert mapping["discount"] == "Offer %"
    assert mapping["festival"] == "Festival"
    assert mapping["promotion"] == "Promo"


def test_discount_percent_fraction_and_rupees():
    qty = pd.Series([1.0, 2.0])
    price = pd.Series([100.0, 50.0])
    assert discount_to_percent(pd.Series([10, 25]), "Discount %", price, qty).tolist() == [10, 25]
    assert discount_to_percent(pd.Series([0.1, 0.25]), "Discount", price, qty).tolist() == [10, 25]
    # ₹10 off a ₹100 item (per unit) and ₹20 off a line of 2 x ₹50 (per line)
    assert discount_to_percent(pd.Series([10, 60]), "Discount Amount", price, qty).tolist() == [10, 60]
    per_line = discount_to_percent(pd.Series([10, 20]), "Disc Amt", pd.Series([100.0, 10.0]), pd.Series([1.0, 4.0]))
    assert per_line.tolist() == [10, 50]


def test_festival_and_promotion_columns_become_flags():
    csv = ("Date,Item,Qty,Festival,Promo\n"
           "01/09/2026,Sweets,3,No,0\n"
           "02/09/2026,Sweets,9,Diwali,1\n"
           "03/09/2026,Sweets,8,Yes,yes\n").encode()
    table, _, _ = read_table("s.csv", csv)
    rows, _ = normalize_rows(table, suggest_mapping(list(table.columns)))
    assert [r["festival"] for r in rows] == [0, 1, 1]
    assert [r["festival_name"] for r in rows] == [None, "Diwali", None]
    assert [r["promotion"] for r in rows] == [0, 1, 1]


def test_customer_name_is_never_used_as_product():
    mapping = suggest_mapping(["Customer Name", "Phone", "Total Orders", "Last Purchase Date"])
    assert mapping["product"] is None


def test_indian_day_first_dates_and_excel_serials():
    parsed = parse_dates(pd.Series(["5/9/2026", "26/09/2026", "2026-09-05", 46270, None, "not a date"], dtype=object))
    assert parsed.iloc[0] == pd.Timestamp("2026-09-05")
    assert parsed.iloc[1] == pd.Timestamp("2026-09-26")
    assert parsed.iloc[2] == pd.Timestamp("2026-09-05")
    assert parsed.iloc[3] == pd.Timestamp("2026-09-05")
    assert pd.isna(parsed.iloc[4]) and pd.isna(parsed.iloc[5])


def test_xlsx_with_title_rows_is_read_from_real_header():
    df = pd.DataFrame({"Date": ["01/09/2026", "02/09/2026"], "Product": ["Sugar", "Sugar"], "Qty Sold": [4, 6]})
    content = _xlsx_bytes({"Notes": (pd.DataFrame(), 0), "Sales": (df, 3)})
    table, sheet, sheets = read_table("september.xlsx", content)
    assert sheet == "Sales" and sheets == ["Notes", "Sales"]
    info = describe_table(table)
    assert info["suggested_mapping"]["quantity"] == "Qty Sold"
    rows, stats = normalize_rows(table, info["suggested_mapping"])
    assert [r["date"] for r in rows] == ["2026-09-01", "2026-09-02"]
    assert stats["valid_rows"] == 2 and stats["product_count"] == 1


def test_csv_rows_with_bad_values_are_skipped_and_counted():
    csv = ("Date,Item,Quantity\n"
           "01/09/2026,Atta 5kg,\"1,200\"\n"
           "bad,Atta 5kg,3\n"
           "02/09/2026,,3\n"
           "03/09/2026,Atta 5kg,abc\n"
           "04/09/2026,Atta 5kg,2 pcs\n").encode()
    table, _, _ = read_table("sales.csv", csv)
    rows, stats = normalize_rows(table, suggest_mapping(list(table.columns)))
    assert [r["quantity"] for r in rows] == [1200.0, 2.0]
    assert stats["skipped_reasons"] == {"invalid_date": 1, "missing_product": 1, "invalid_quantity": 1}


def test_csv_with_title_lines_and_semicolons():
    csv = ("Sharma Kirana - Sales Report\n"
           "Period: Sept 2026\n"
           "\n"
           "Date;Product;Qty;Category\n"
           "01/09/2026;Toor Dal;3;Pulses\n"
           "02/09/2026;Toor Dal;5;Pulses\n").encode()
    table, _, _ = read_table("report.csv", csv)
    mapping = suggest_mapping(list(table.columns))
    assert mapping["category"] == "Category"
    rows, stats = normalize_rows(table, mapping)
    assert stats["valid_rows"] == 2 and rows[1] == {
        "date": "2026-09-02", "product": "Toor Dal", "quantity": 5.0, "category": "Pulses"}


def test_missing_required_mapping_is_rejected():
    table, _, _ = read_table("x.csv", b"Date,Item\n01/09/2026,Salt\n")
    with pytest.raises(SpreadsheetError, match="quantity"):
        normalize_rows(table, suggest_mapping(list(table.columns)))


def test_unsupported_extension_is_rejected():
    with pytest.raises(SpreadsheetError, match="Unsupported"):
        read_table("photo.png", b"123")


# ─── Forecaster ─────────────────────────────────────────────

def test_catboost_plan_beats_moving_average_on_weekly_pattern():
    plan = build_inventory_plan(_synthetic_rows(), review_days=7, lead_time_days=2)
    assert plan["method"] == "catboost"
    v = plan["validation"]
    assert v["catboost_wmape"] < v["baseline_wmape"]
    by_name = {p["product"]: p for p in plan["products"]}
    assert len(plan["forecast_dates"]) == 9 and plan["forecast_dates"][0] == "2026-09-28"
    rice = by_name["Rice 1kg"]["daily_forecast"]
    weekend_idx = [i for i, d in enumerate(plan["forecast_dates"]) if pd.Timestamp(d).dayofweek >= 5]
    weekday_idx = [i for i, d in enumerate(plan["forecast_dates"]) if pd.Timestamp(d).dayofweek < 5]
    assert np.mean([rice[i] for i in weekend_idx]) > 2 * np.mean([rice[i] for i in weekday_idx])


def test_stock_statuses_and_order_quantities():
    stock = {"rice 1kg": 0, "MILK 500ML": 5000}
    plan = build_inventory_plan(_synthetic_rows(), current_stock=stock, review_days=7, lead_time_days=2)
    by_name = {p["product"]: p for p in plan["products"]}

    rice = by_name["Rice 1kg"]
    assert rice["status"] == "critical" and rice["stock_source"] == "shop_inventory"
    assert rice["order_quantity"] == rice["recommended_stock"] > 0
    assert rice["estimated_order_value"] == rice["order_quantity"] * 60.0

    milk = by_name["Milk 500ml"]
    assert milk["status"] == "overstock" and milk["order_quantity"] == 0

    candles = by_name["Candles"]
    assert candles["status"] == "slow_moving" and candles["order_quantity"] == 0
    assert plan["products"][0]["product"] == "Rice 1kg"


def test_sheet_stock_used_when_product_not_in_shop_inventory():
    rows = _synthetic_rows()
    rows.append({"date": "2026-09-27", "product": "Milk 500ml", "quantity": 0, "stock": 10, "upload_id": "u1"})
    plan = build_inventory_plan(rows)
    milk = next(p for p in plan["products"] if p["product"] == "Milk 500ml")
    assert milk["stock_source"] == "uploaded_sheet" and milk["current_stock"] == 10
    assert milk["stock_as_of"] == "2026-09-27"
    assert milk["order_quantity"] == milk["recommended_stock"] - 10


def test_multiple_uploads_are_combined_case_insensitively_and_overlaps_reported():
    first = [r for r in _synthetic_rows(upload_id="jan") if r["date"] < "2026-08-01"]
    second = [dict(r, product=r["product"].upper()) for r in _synthetic_rows(upload_id="feb") if r["date"] >= "2026-07-25"]
    plan = build_inventory_plan(first + second)
    assert plan["data"]["uploads"] == 2
    assert plan["data"]["products"] == 3
    assert plan["data"]["overlapping_entries"] == 7 * 3
    assert any("more than one uploaded file" in n for n in plan["notes"])


def test_short_history_falls_back_to_moving_average_with_warning():
    rows = _synthetic_rows(days=10)
    plan = build_inventory_plan(rows)
    assert plan["method"] == "moving_average" and plan["validation"] is None
    assert any("At least 28 days" in n for n in plan["notes"])


def test_fractional_units_rounded_to_one_decimal():
    rows = [{"date": d.strftime("%Y-%m-%d"), "product": "Loose Dal", "quantity": 1.25}
            for d in pd.date_range(end="2026-09-27", periods=10)]
    plan = build_inventory_plan(rows, current_stock={"loose dal": 0}, review_days=3, lead_time_days=1)
    p = plan["products"][0]
    assert p["order_quantity"] == pytest.approx(5.0)


def test_invalid_inputs_raise():
    with pytest.raises(ForecastInputError):
        build_inventory_plan([])
    with pytest.raises(ForecastInputError):
        build_inventory_plan(_synthetic_rows(days=5), review_days=0)
    with pytest.raises(ForecastInputError, match="valid date"):
        build_inventory_plan(_synthetic_rows(days=5), local_festival_dates=["someday"])
    with pytest.raises(ForecastInputError, match="discount"):
        build_inventory_plan(_synthetic_rows(days=5), planned_discount_pct=95)


# ─── Attributes: discount, festival, cost ──────────────────

def _discount_rows(days=150, end="2026-09-27"):
    """Biscuits sell ~3x when discounted 20%; days alternate in random blocks."""
    rng = np.random.default_rng(1)
    rows = []
    for d in pd.date_range(end=end, periods=days, freq="D"):
        disc = 20.0 if rng.random() < 0.35 else 0.0
        qty = rng.poisson(30 if disc else 10)
        rows.append({"date": d.strftime("%Y-%m-%d"), "product": "Biscuits", "quantity": float(qty),
                     "price": 20.0, "cost": 15.0, "discount_pct": disc, "category": "Snacks"})
        rows.append({"date": d.strftime("%Y-%m-%d"), "product": "Salt", "quantity": float(rng.poisson(8)),
                     "price": 25.0, "cost": 20.0, "discount_pct": 0.0, "category": "Staples"})
    return rows


def test_planned_discount_raises_forecast_when_history_shows_discount_effect():
    rows = _discount_rows()
    with_disc = build_inventory_plan(rows, planned_discount_pct=20)
    no_disc = build_inventory_plan(rows, planned_discount_pct=0)
    b1 = next(p for p in with_disc["products"] if p["product"] == "Biscuits")
    b0 = next(p for p in no_disc["products"] if p["product"] == "Biscuits")
    assert b1["forecast_period_demand"] > 1.8 * b0["forecast_period_demand"]
    assert with_disc["attributes_used"]["discount"] is True
    assert with_disc["attribute_effects"]["discount"]["uplift_pct"] > 100
    assert b1["discount_pct"] == 20.0 and b0["discount_pct"] == 0.0


def test_cost_gives_order_cost_margin_and_profit():
    plan = build_inventory_plan(_discount_rows(), current_stock={"salt": 0, "biscuits": 0}, planned_discount_pct=0)
    salt = next(p for p in plan["products"] if p["product"] == "Salt")
    assert salt["unit_cost"] == 20.0 and salt["margin_pct"] == 20.0
    assert salt["estimated_order_cost"] == salt["order_quantity"] * 20.0
    assert salt["expected_profit"] == pytest.approx(salt["forecast_period_demand"] * 5.0, abs=0.05)
    assert plan["summary"]["total_order_cost"] > 0


def test_discount_below_cost_is_flagged():
    rows = _discount_rows()
    plan = build_inventory_plan(rows, planned_discount_pct=30)  # 20 * 0.7 = 14 < cost 15
    assert any("below cost" in n and "Biscuits" in n for n in plan["notes"])


def test_festival_calendar_covers_2026_diwali():
    days = festival_days()
    assert days[pd.Timestamp("2026-11-08")][0] == "Diwali"
    assert pd.Timestamp("2026-11-09") in days  # multi-day festival


def test_catboost_learns_festival_uplift_from_calendar():
    """Sweets sell 4x on calendar festival days; the plan window contains Diwali 2026."""
    rng = np.random.default_rng(2)
    fest = festival_days()
    rows = []
    for d in pd.date_range(end="2026-11-01", periods=420, freq="D"):
        base = 40 if d in fest else 10
        rows.append({"date": d.strftime("%Y-%m-%d"), "product": "Sweets Box", "quantity": float(rng.poisson(base)),
                     "price": 200.0})
        rows.append({"date": d.strftime("%Y-%m-%d"), "product": "Soap", "quantity": float(rng.poisson(12)),
                     "price": 35.0})
    plan = build_inventory_plan(rows, review_days=10, lead_time_days=0)
    sweets = next(p for p in plan["products"] if p["product"] == "Sweets Box")["daily_forecast"]
    fest_idx = [i for i, d in enumerate(plan["forecast_dates"]) if pd.Timestamp(d) in fest]
    normal_idx = [i for i in range(len(plan["forecast_dates"])) if i not in fest_idx]
    assert fest_idx, "Diwali/Dhanteras should fall in the window"
    assert np.mean([sweets[i] for i in fest_idx]) > 2 * np.mean([sweets[i] for i in normal_idx])
    assert any(f["name"] == "Diwali" for f in plan["upcoming_festivals"])
    assert plan["attribute_effects"]["festival"]["uplift_pct"] > 50


def test_sheet_festival_flags_and_local_dates_scale_short_history():
    rows = []
    for i, d in enumerate(pd.date_range(end="2026-09-27", periods=21, freq="D")):
        flagged = i in (3, 10, 17)
        rows.append({"date": d.strftime("%Y-%m-%d"), "product": "Flowers", "quantity": 30.0 if flagged else 10.0,
                     "festival": 1 if flagged else 0, "festival_name": "Bonalu" if flagged else None})
    plan = build_inventory_plan(rows, review_days=5, lead_time_days=0, local_festival_dates=["2026-09-30"])
    assert plan["method"] == "moving_average"
    daily = plan["products"][0]["daily_forecast"]
    idx = plan["forecast_dates"].index("2026-09-30")
    assert daily[idx] > 1.8 * daily[0]
    assert plan["attributes_used"]["festival_flags_in_sheets"] == 3
