import kagglehub
import shutil
from pathlib import Path
import os
import py7zr

# Set up the target directory
target_dir = Path(r"c:\Users\DELL\OneDrive\Desktop\antarya\ml-service\data")
target_dir.mkdir(parents=True, exist_ok=True)

print(f"Downloading dataset to: {target_dir}")

# Download latest version
path = kagglehub.competition_download('favorita-grocery-sales-forecasting')

print(f"Dataset downloaded to temporary cache: {path}")

# The Kaggle Hub downloads files into a cached path.
# We need to copy 'train.csv.7z' and 'items.csv.7z' to our data directory,
# and then extract them.

cached_path = Path(path)

files_to_copy = ['train.csv.7z', 'items.csv.7z']

for file_name in files_to_copy:
    src = cached_path / file_name
    dst = target_dir / file_name
    
    if src.exists():
        print(f"Copying {file_name}...")
        shutil.copy2(src, dst)
        
        print(f"Extracting {file_name}...")
        try:
            with py7zr.SevenZipFile(dst, mode='r') as z:
                z.extractall(path=target_dir)
            print(f"✅ Extracted {file_name.replace('.7z', '')}")
            
            # Optionally remove the .7z file after extraction to save space
            os.remove(dst)
        except Exception as e:
            print(f"❌ Failed to extract {file_name}: {e}")
    else:
        print(f"⚠️ Warning: Could not find {file_name} in downloaded files.")

print("\n🎉 Dataset download and extraction complete!")
