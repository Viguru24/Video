import os

p = r"C:\Users\louis\OneDrive\Documents\GitHub"
print(f"Searching recursively in: {p}")

for root, dirs, files in os.walk(p):
    # prune large directories
    dirs[:] = [d for d in dirs if d not in ['.git', 'node_modules', 'target', '.cosmo_models', 'dist', 'src-tauri']]
    for f in files:
        if 'cosmo-collections' in f or 'cosmo-v2.json' in f:
            fp = os.path.join(root, f)
            print(f"  Found: {fp} ({os.path.getsize(fp)} bytes)")
