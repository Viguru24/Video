import json
import os

p = r"C:\Users\louis\AppData\Roaming\com.cosmo.symphony\persistence\cosmo-collections.json"
if os.path.exists(p):
    data = json.load(open(p, encoding='utf-8'))
    print(f"Collections loaded. Keys: {list(data.keys())}")
    for name, items in data.items():
        print(f"Collection '{name}': {len(items)} items")
        existing_count = 0
        missing_count = 0
        for item in items:
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
        if len(items) > 0:
            print(f"  Sample path: {items[0].get('realPath')}")
else:
    print("File not found")
