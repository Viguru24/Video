with open("c:/Users/louis/OneDrive/Documents/GitHub/Video/src/App.tsx", "r", encoding="utf-8") as f:
    lines = f.readlines()
for idx, line in enumerate(lines):
    if "convertToVideoUrl" in line:
        print(f"{idx+1}: {line.strip()}")
