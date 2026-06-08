import zipfile

zip_path = r"C:\Users\louis\OneDrive\Documents\GitHub\CosmoSymphony_backup_2026-06-08.zip"
with zipfile.ZipFile(zip_path, 'r') as z:
    for name in z.namelist():
        if "json" in name or "persistence" in name or "cosmo" in name:
            print(name)
