import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pandas as pd
from pathlib import Path

df = pd.read_csv(
    r'c:\Users\DELL\OneDrive\Desktop\antarya\ml-service\data\agmarknet\Andhra_Pradesh_Last_2_Year.csv',
    on_bad_lines='skip'
)
df['Arrival_Date'] = pd.to_datetime(df['Arrival_Date'], format='%d/%m/%Y', errors='coerce')

print(f"Shape: {df.shape}")
print(f"Date range: {df['Arrival_Date'].min().date()} to {df['Arrival_Date'].max().date()}")
print(f"Total rows: {len(df):,}")
print(f"Null prices: {df[['Min_Price','Max_Price','Modal_Price']].isnull().sum().sum()}")
print()

print("=== ALL COMMODITIES (sorted by row count) ===")
comm_stats = df.groupby('Commodity').agg(
    rows=('Modal_Price', 'count'),
    avg_price=('Modal_Price', 'mean'),
    min_price=('Modal_Price', 'min'),
    max_price=('Modal_Price', 'max')
).sort_values('rows', ascending=False)

for i, (comm, row) in enumerate(comm_stats.iterrows(), 1):
    print(f"  {i:2d}. {comm:<35} rows={int(row['rows']):5d}  avg=Rs.{row['avg_price']:.0f}  range=Rs.{row['min_price']:.0f}-{row['max_price']:.0f}")

print()
print("=== DISTRICTS COVERED ===")
print(sorted(df['District'].unique()))

print()
print("=== DATE COVERAGE (rows per month) ===")
df['YearMonth'] = df['Arrival_Date'].dt.to_period('M')
monthly = df.groupby('YearMonth').size()
for ym, cnt in monthly.items():
    print(f"  {ym}: {cnt:,} records")
