import zipfile

zip_path = r"c:\Users\louis\OneDrive\Documents\GitHub\Video\CosmoSymphony_backup_2026-06-08_17-01.zip"
with zipfile.ZipFile(zip_path, 'r') as z:
    for name in z.namelist():
        if "json" in name or "persistence" in name or "cosmo" in name:
            print(name)
