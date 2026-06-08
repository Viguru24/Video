import zipfile
import json
import os

zip_path = r"C:\Users\louis\OneDrive\Documents\GitHub\CosmoSymphony_backup_2026-06-08.zip"
entry_name = "backup_before_sticker_feature/persistence_bak/cosmo-collections.json"

if os.path.exists(zip_path):
    with zipfile.ZipFile(zip_path, 'r') as z:
        if entry_name in z.namelist():
            data = json.loads(z.read(entry_name).decode('utf-8'))
            print(f"Loaded collections: {list(data.keys())}")
            for col_name, items in data.items():
                print(f"Collection '{col_name}': {len(items)} items")
                exist = sum(1 for x in items if os.path.exists(x.get('realPath', '')))
                print(f"  Existing files on disk: {exist}/{len(items)}")
                if len(items) > 0:
                    print(f"  First path: {items[0].get('realPath')}")
        else:
            print("Entry not found in zip")
else:
    print("Zip file not found")
