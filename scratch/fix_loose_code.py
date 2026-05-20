file_path = r"c:\Users\louis\OneDrive\Documents\GitHub\Video\src\components\ControlBar.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    code = f.read()

start_tag = "    // Target selected videos, or fallback to all visible videos if none are selected"
end_tag = '    addLog(mediaMode === \'picture\' ? "BATCH IMAGE RENAME COMPLETE." : "SMART BATCH ORCHESTRATION COMPLETE.");\n  };'

idx_start = code.find(start_tag)
idx_end = code.find(end_tag)

if idx_start != -1 and idx_end != -1:
    code = code[:idx_start] + code[idx_end + len(end_tag):]
    print("Loose batch rename code removed successfully!")
else:
    print(f"ERROR: locate failed! start={idx_start}, end={idx_end}")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(code)
