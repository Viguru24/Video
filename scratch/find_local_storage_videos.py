import os

local_dir = r"C:\Users\louis\AppData\Local"
for root, dirs, files in os.walk(local_dir):
    if not any(kw in root.lower() for kw in ["cosmo", "symphony", "video", "quanta"]):
        continue
    for file in files:
        # Avoid huge log files or temp files if any, but search leveldb/log/json/ldb/localstorage
        if any(file.endswith(ext) for ext in [".log", ".json", ".bak", ".ldb", ".localstorage", ".sqlite"]):
            filepath = os.path.join(root, file)
            try:
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    if "Micky_012" in content or "NINO_001" in content:
                        print(f"FOUND in Local: {filepath} (size: {os.path.getsize(filepath)} bytes)")
            except Exception as e:
                pass
