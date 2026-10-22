"""
Pan-India festival calendar used by the inventory planner (2024-2027).

Lunar festivals (Holi, Eid, Diwali, ...) are published a year ahead and can
shift by a day depending on region or moon sighting. Shops can add local
festivals or correct a date through a "festival" column in their sheets or the
planner's "local festival dates" setting; those dates are merged with this list.
"""

import pandas as pd

# (date, name, importance 1-5, days the festival lasts)
FESTIVALS = [
    ("2024-01-14", "Makar Sankranti / Pongal", 4, 2), ("2024-01-26", "Republic Day", 2, 1),
    ("2024-03-25", "Holi", 5, 2), ("2024-04-09", "Ugadi / Gudi Padwa", 4, 1),
    ("2024-04-11", "Eid al-Fitr", 5, 2), ("2024-04-17", "Ram Navami", 3, 1),
    ("2024-06-17", "Eid al-Adha", 4, 2), ("2024-08-15", "Independence Day", 2, 1),
    ("2024-08-19", "Raksha Bandhan", 4, 1), ("2024-08-26", "Janmashtami", 3, 1),
    ("2024-09-07", "Ganesh Chaturthi", 5, 3), ("2024-09-15", "Onam", 4, 2),
    ("2024-10-12", "Dussehra", 4, 1), ("2024-10-29", "Dhanteras", 4, 1),
    ("2024-10-31", "Diwali", 5, 3), ("2024-11-07", "Chhath Puja", 3, 2),
    ("2024-12-25", "Christmas", 3, 1), ("2024-12-31", "New Year's Eve", 3, 2),

    ("2025-01-14", "Makar Sankranti / Pongal", 4, 2), ("2025-01-26", "Republic Day", 2, 1),
    ("2025-03-14", "Holi", 5, 2), ("2025-03-30", "Ugadi / Gudi Padwa", 4, 1),
    ("2025-03-31", "Eid al-Fitr", 5, 2), ("2025-04-06", "Ram Navami", 3, 1),
    ("2025-06-07", "Eid al-Adha", 4, 2), ("2025-08-09", "Raksha Bandhan", 4, 1),
    ("2025-08-15", "Independence Day", 2, 1), ("2025-08-16", "Janmashtami", 3, 1),
    ("2025-08-27", "Ganesh Chaturthi", 5, 3), ("2025-09-05", "Onam", 4, 2),
    ("2025-10-02", "Dussehra", 4, 1), ("2025-10-18", "Dhanteras", 4, 1),
    ("2025-10-20", "Diwali", 5, 3), ("2025-10-27", "Chhath Puja", 3, 2),
    ("2025-12-25", "Christmas", 3, 1), ("2025-12-31", "New Year's Eve", 3, 2),

    ("2026-01-14", "Makar Sankranti / Pongal", 4, 2), ("2026-01-26", "Republic Day", 2, 1),
    ("2026-03-04", "Holi", 5, 2), ("2026-03-19", "Ugadi / Gudi Padwa", 4, 1),
    ("2026-03-21", "Eid al-Fitr", 5, 2), ("2026-03-26", "Ram Navami", 3, 1),
    ("2026-05-27", "Eid al-Adha", 4, 2), ("2026-08-15", "Independence Day", 2, 1),
    ("2026-08-26", "Onam", 4, 2), ("2026-08-28", "Raksha Bandhan", 4, 1),
    ("2026-09-04", "Janmashtami", 3, 1), ("2026-09-14", "Ganesh Chaturthi", 5, 3),
    ("2026-10-20", "Dussehra", 4, 1), ("2026-11-06", "Dhanteras", 4, 1),
    ("2026-11-08", "Diwali", 5, 3), ("2026-11-15", "Chhath Puja", 3, 2),
    ("2026-12-25", "Christmas", 3, 1), ("2026-12-31", "New Year's Eve", 3, 2),

    ("2027-01-14", "Makar Sankranti / Pongal", 4, 2), ("2027-01-26", "Republic Day", 2, 1),
    ("2027-03-10", "Eid al-Fitr", 5, 2), ("2027-03-22", "Holi", 5, 2),
    ("2027-04-07", "Ugadi / Gudi Padwa", 4, 1), ("2027-04-15", "Ram Navami", 3, 1),
    ("2027-05-17", "Eid al-Adha", 4, 2), ("2027-08-15", "Independence Day", 2, 1),
    ("2027-08-17", "Raksha Bandhan", 4, 1), ("2027-08-25", "Janmashtami", 3, 1),
    ("2027-09-04", "Ganesh Chaturthi", 5, 3), ("2027-09-12", "Onam", 4, 2),
    ("2027-10-09", "Dussehra", 4, 1), ("2027-10-27", "Dhanteras", 4, 1),
    ("2027-10-29", "Diwali", 5, 3), ("2027-12-25", "Christmas", 3, 1),
]

CALENDAR_START = pd.Timestamp(FESTIVALS[0][0])
CALENDAR_END = pd.Timestamp(FESTIVALS[-1][0])


def festival_days(extra_dates=None, extra_names=None):
    """
    Returns {Timestamp: (name, importance)} for every day a festival is running.
    extra_dates: iterable of dates flagged by the shop (sheet column / local settings).
    """
    days = {}
    for date, name, importance, duration in FESTIVALS:
        start = pd.Timestamp(date)
        for d in range(duration):
            days[start + pd.Timedelta(days=d)] = (name, importance)
    extra_names = extra_names or {}
    for d in extra_dates or []:
        ts = pd.Timestamp(d).normalize()
        if ts not in days:
            days[ts] = (extra_names.get(ts) or "Local festival", 4)
    return days


def upcoming(days_map, start, end):
    """Distinct festivals starting within [start, end]."""
    out, seen = [], set()
    for ts in sorted(k for k in days_map if start <= k <= end):
        name, importance = days_map[ts]
        prev = days_map.get(ts - pd.Timedelta(days=1))
        if prev and prev[0] == name:
            continue
        key = (name, ts)
        if key not in seen:
            seen.add(key)
            out.append({"date": ts.strftime("%Y-%m-%d"), "name": name, "importance": importance})
    return out
