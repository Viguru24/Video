import zipfile
import glob
import json
import os

zips = glob.glob(r"C:\Users\louis\OneDrive\Documents\GitHub\CosmoSymphony_backup_*.zip")
print(f"Found {len(zips)} zip files to inspect.\n")

for zip_path in zips:
    print(f"Inspecting: {os.path.basename(zip_path)}")
    try:
        with zipfile.ZipFile(zip_path, 'r') as z:
            entries = z.namelist()
            persistence_entries = [e for e in entries if 'persistence' in e.lower() and e.endswith('.json')]
            for entry in persistence_entries:
                size = z.getinfo(entry).file_size
                print(f"  Entry: {entry} ({size} bytes)")
                if 'cosmo-collections.json' in entry and not entry.endswith('.bak'):
                    try:
                        content = z.read(entry).decode('utf-8')
                        data = json.loads(content)
                        print(f"    Collections: {list(data.keys())}")
                    except Exception as e:
                        print(f"    Failed to read/parse collection: {e}")
                elif 'cosmo-v2.json' in entry and not entry.endswith('.bak'):
                    try:
                        content = z.read(entry).decode('utf-8')
                        data = json.loads(content)
                        print(f"    V2 contains {len(data)} video items")
                    except Exception as e:
                        print(f"    Failed to read/parse V2: {e}")
    except Exception as e:
        print(f"  Error reading zip: {e}")
    print("-" * 50)
