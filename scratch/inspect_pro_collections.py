import json

path = r"C:\Users\louis\AppData\Roaming\com.cosmovideo.pro\persistence\cosmo-collections.json"
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)
    print("Collection Keys in com.cosmovideo.pro:")
    for key, val in data.items():
        print(f"  {key}: {len(val)} items")
