import json

path = r"C:\Users\louis\AppData\Roaming\com.cosmo.symphony_backup_3.4.2\persistence\cosmo-collections.json"
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)
    print("Collection Keys in backup_3.4.2:")
    for key, val in data.items():
        print(f"  {key}: {len(val)} items")
