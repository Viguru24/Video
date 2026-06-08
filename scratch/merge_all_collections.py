import os
import json
import zipfile

active_path = r"C:\Users\louis\AppData\Roaming\com.cosmo.symphony\persistence\cosmo-collections.json"
pro_path = r"C:\Users\louis\AppData\Roaming\com.cosmovideo.pro\persistence\cosmo-collections.json"
backup_path = r"C:\Users\louis\AppData\Roaming\com.cosmo.symphony_backup_3.4.2\persistence\cosmo-collections.json"
zip_path = r"C:\Users\louis\OneDrive\Documents\GitHub\CosmoSymphony_backup_2026-06-08.zip"
zip_entry = "backup_before_sticker_feature/persistence_bak/cosmo-collections.json"

merged = {}

def load_and_merge(path, source_name):
    if not os.path.exists(path):
        print(f"Path does not exist: {path}")
        return
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if isinstance(data, dict):
                for k, v in data.items():
                    if k not in merged:
                        merged[k] = v
                        print(f"  Merged collection '{k}' from {source_name} ({len(v)} items)")
                    else:
                        print(f"  Skipped duplicate collection '{k}' from {source_name}")
    except Exception as e:
        print(f"Error loading {path}: {e}")

# 1. Load active path
print("Loading active collections...")
load_and_merge(active_path, "active directory")

# 2. Load com.cosmovideo.pro path
print("Loading pro collections...")
load_and_merge(pro_path, "com.cosmovideo.pro")

# 3. Load backup_3.4.2 path
print("Loading backup 3.4.2 collections...")
load_and_merge(backup_path, "symphony_backup_3.4.2")

# 4. Load zip path
print("Loading zip collections...")
if os.path.exists(zip_path):
    try:
        with zipfile.ZipFile(zip_path, 'r') as z:
            if zip_entry in z.namelist():
                data = json.loads(z.read(zip_entry).decode('utf-8'))
                if isinstance(data, dict):
                    for k, v in data.items():
                        if k not in merged:
                            merged[k] = v
                            print(f"  Merged collection '{k}' from zip backup ({len(v)} items)")
                        else:
                            print(f"  Skipped duplicate collection '{k}' from zip backup")
            else:
                print(f"  Entry {zip_entry} not found in zip")
    except Exception as e:
        print(f"Error loading from zip: {e}")
else:
    print(f"Zip file does not exist: {zip_path}")

# Save merged collections
if len(merged) > 0:
    # Backup active first
    if os.path.exists(active_path):
        bak = active_path + ".before_merge"
        if os.path.exists(bak): os.remove(bak)
        os.rename(active_path, bak)
        print(f"Backed up active collections to {bak}")
    
    with open(active_path, 'w', encoding='utf-8') as f:
        json.dump(merged, f, indent=2)
    print(f"Successfully saved {len(merged)} merged collections to {active_path}!")
else:
    print("No collections to save.")
