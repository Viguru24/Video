import json
import os

path = r"C:\Users\louis\AppData\Roaming\com.cosmo.symphony\persistence\cosmo-v2.json.bak"
if os.path.exists(path):
    with open(path, 'r', encoding='utf-8') as f:
        try:
            data = json.load(f)
            print(f"Loaded {len(data)} items")
            for item in data[:5]:
                print(f"Title: {item.get('title')}, URL: {item.get('url')}, Path: {item.get('realPath')}")
        except Exception as e:
            print("Error parsing JSON:", e)
else:
    print("File does not exist")
