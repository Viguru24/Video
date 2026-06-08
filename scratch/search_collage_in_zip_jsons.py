import zipfile
import glob
import json
import os

zips = glob.glob(r"C:\Users\louis\OneDrive\Documents\GitHub\CosmoSymphony_backup_*.zip")
for zip_path in zips:
    try:
        with zipfile.ZipFile(zip_path, 'r') as z:
            for name in z.namelist():
                if name.endswith('.json'):
                    try:
                        content = z.read(name).decode('utf-8', errors='ignore')
                        if 'collage' in content.lower():
                            print(f"Found 'collage' inside: {os.path.basename(zip_path)} -> {name}")
                            # Try to parse and find context
                            try:
                                data = json.loads(content)
                                if isinstance(data, dict):
                                    for k, v in data.items():
                                        if 'collage' in str(k).lower() or 'collage' in str(v).lower():
                                            print(f"  Key/Value match: {k} -> {str(v)[:100]}")
                                elif isinstance(data, list):
                                    for idx, item in enumerate(data):
                                        if 'collage' in str(item).lower():
                                            print(f"  List item match at index {idx}: {str(item)[:100]}")
                            except Exception:
                                idx = content.lower().find('collage')
                                print(f"  Raw context: {content[max(0, idx-100):min(len(content), idx+200)]}")
                    except Exception as e:
                        pass
    except Exception as e:
        print(f"Error reading {zip_path}: {e}")
