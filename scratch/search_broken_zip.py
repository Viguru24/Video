import zipfile

zip_path = r"C:\Users\louis\OneDrive\Documents\GitHub\CosmoSymphony_broken_before_restore.zip"
with zipfile.ZipFile(zip_path, 'r') as z:
    for name in z.namelist():
        if "json" in name or "persistence" in name or "cosmo" in name:
            print(name)
