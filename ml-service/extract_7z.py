import py7zr
from pathlib import Path
import os
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

data_dir = Path(r"c:\Users\DELL\OneDrive\Desktop\antarya\ml-service\data")

for file_name in ['train.csv.7z']: # We already extracted items.csv
    src = data_dir / file_name
    if src.exists():
        print(f"Extracting {file_name}...")
        try:
            with py7zr.SevenZipFile(src, mode='r') as z:
                z.extractall(path=data_dir)
            print(f"Extracted {file_name.replace('.7z', '')}")
            os.remove(src) # Clean up the archive
        except Exception as e:
            print(f"Failed to extract {file_name}: {e}")
    else:
        print(f"Could not find {file_name}")
