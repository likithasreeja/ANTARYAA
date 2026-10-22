"""
Quick API probe — runs BEFORE writing the full ingestion pipeline.
Tests the actual data.gov.in endpoint, prints the real response structure.
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import requests
import json

API_KEY = "579b464db66ec23bdd000001c90c13d6e59a41e553d954c8c15c84d6"
RESOURCE_ID = "35985678-0d79-46b4-9ed6-6f13308a1d24"
BASE_URL = f"https://api.data.gov.in/resource/{RESOURCE_ID}"

print("=" * 60)
print("PROBING data.gov.in AGMARKNET API")
print("=" * 60)

# Test 1: Basic call, 3 records
print("\n[TEST 1] Basic call — 3 records, no filter")
resp = requests.get(BASE_URL, params={
    "api-key": API_KEY,
    "format": "json",
    "limit": 3,
    "offset": 0
}, timeout=30)

print(f"  Status: {resp.status_code}")
if resp.status_code == 200:
    data = resp.json()
    print(f"  Total records: {data.get('total', 'N/A')}")
    print(f"  Fields: {data.get('field', [])}")
    print(f"  First record:")
    records = data.get('records', data.get('data', []))
    if records:
        print(json.dumps(records[0], indent=4, ensure_ascii=False))
else:
    print(f"  ERROR: {resp.text[:500]}")

# Test 2: Filter Telangana
print("\n[TEST 2] Filter Telangana — 5 records")
resp2 = requests.get(BASE_URL, params={
    "api-key": API_KEY,
    "format": "json",
    "limit": 5,
    "offset": 0,
    "filters[State.Keyword]": "Telangana"
}, timeout=30)

print(f"  Status: {resp2.status_code}")
if resp2.status_code == 200:
    data2 = resp2.json()
    print(f"  Total Telangana records: {data2.get('total', 'N/A')}")
    records2 = data2.get('records', data2.get('data', []))
    for r in records2[:2]:
        print(f"  -> {r}")
else:
    print(f"  ERROR: {resp2.text[:300]}")

# Test 3: Filter Andhra Pradesh
print("\n[TEST 3] Filter Andhra Pradesh — count only")
resp3 = requests.get(BASE_URL, params={
    "api-key": API_KEY,
    "format": "json",
    "limit": 1,
    "offset": 0,
    "filters[State.Keyword]": "Andhra Pradesh"
}, timeout=30)
if resp3.status_code == 200:
    print(f"  Total AP records: {resp3.json().get('total', 'N/A')}")

# Test 4: Check all available field names
print("\n[TEST 4] Field names from API")
if resp.status_code == 200:
    data = resp.json()
    fields = data.get('field', [])
    for f in fields:
        print(f"  - {f}")
