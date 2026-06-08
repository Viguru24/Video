import os
paths = [
    r"C:\Users\louis\AppData\Roaming\com.cosmo.symphony\persistence",
    r"C:\Users\louis\AppData\Roaming\com.cosmo.symphony_backup_3.4.2\persistence",
    r"C:\Users\louis\AppData\Roaming\com.cosmovideo.pro\persistence"
]
for p in paths:
    print(f"Searching path: {p}")
    if not os.path.exists(p): continue
    for f in os.listdir(p):
        if f.endswith('.json'):
            fp = os.path.join(p, f)
            txt = open(fp, 'r', encoding='utf-8', errors='ignore').read()
            if 'collage' in txt.lower():
                print(f"Found 'collage' in file: {f}")
                idx = txt.lower().find('collage')
                print("Context:", txt[max(0, idx-100):min(len(txt), idx+200)])
