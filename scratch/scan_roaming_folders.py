import os
import json

directories = [
    r"C:\Users\louis\AppData\Roaming\com.cosmo.symphony_backup_3.4.2\persistence",
    r"C:\Users\louis\AppData\Roaming\com.cosmovideo.pro\persistence",
    r"C:\Users\louis\AppData\Roaming\com.quanta.video\persistence",
    r"C:\Users\louis\AppData\Roaming\video\persistence",
]

for directory in directories:
    if os.path.exists(directory):
        print(f"\nListing directory: {directory}")
        for filename in os.listdir(directory):
            filepath = os.path.join(directory, filename)
            if os.path.isfile(filepath) and filename.endswith(".json"):
                size = os.path.getsize(filepath)
                print(f"  File: {filename} ({size} bytes)")
                if size > 100:
                    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                        try:
                            content = f.read(500)
                            print(f"    Content preview: {content[:200]}")
                        except Exception as e:
                            print(f"    Failed to read content: {e}")
    else:
        print(f"\nDirectory not found: {directory}")
