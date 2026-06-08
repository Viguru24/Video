import json
import os

p = r"C:\Users\louis\AppData\Roaming\com.cosmovideo.pro\persistence\cosmo-v2.json"
if os.path.exists(p):
    data = json.load(open(p, encoding='utf-8'))
    print(f"v2 loaded. Length: {len(data)}")
    existing_count = 0
    missing_count = 0
    for item in data:
        rp = item.get('realPath')
        if rp:
            if os.path.exists(rp):
                existing_count += 1
            else:
                missing_count += 1
        else:
            print(f"  Item has no realPath: {item}")
    print(f"  Existing files on disk: {existing_count}")
    print(f"  Missing files on disk: {missing_count}")
    for item in data:
        print(f"  Path: {item.get('realPath')} (Exists: {os.path.exists(item.get('realPath'))})")
else:
    print("File not found")
