import os

roaming_dir = r"C:\Users\louis\AppData\Roaming"
for root, dirs, files in os.walk(roaming_dir):
    # Only search matching directories to avoid scanning everything in AppData
    if not any(kw in root.lower() for kw in ["cosmo", "symphony", "video", "quanta"]):
        continue
    for file in files:
        if file.endswith(".json") or file.endswith(".bak"):
            filepath = os.path.join(root, file)
            try:
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    if "Micky_012" in content or "NINO_001" in content:
                        print(f"FOUND in: {filepath} (size: {os.path.getsize(filepath)} bytes)")
            except Exception as e:
                pass
