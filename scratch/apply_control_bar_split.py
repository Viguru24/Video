import os
import re

file_path = r"c:\Users\louis\OneDrive\Documents\GitHub\Video\src\components\ControlBar.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add the import
import_stmt = "import { BatchRenameModal } from './modals/BatchRenameModal';\n"
if "import { BatchRenameModal }" not in content:
    content = content.replace("import { ContextMenu } from './ContextMenu';", "import { ContextMenu } from './ContextMenu';\n" + import_stmt)

# 2. Remove states related to rename
states_to_remove = [
    r"  const \[batchPrefix, setBatchPrefix\] = useState\('UNIT'\);\n",
    r"  const \[isRenaming, setIsRenaming\] = useState\(false\);\n",
    r"  const \[renameHistory, setRenameHistory\] = useState<string\[\]>\(\[\]\);\n",
    r"  const \[showHistoryDropdown, setShowHistoryDropdown\] = useState\(false\);\n"
]
for state_pattern in states_to_remove:
    content = re.sub(state_pattern, "", content)

# 3. Remove the useEffect for load_persistence('rename_history')
useEffect_pattern = r"  useEffect\(\(\) => \{\n\s*if \(showBatchRename\) \{\n\s*// Load from Tauri.*?\}\n  \}, \[showBatchRename\]\);\n"
content = re.sub(useEffect_pattern, "", content, flags=re.DOTALL)

# 4. Remove the massive executeBatchRename function
executeBatch_pattern = r"  const executeBatchRename = async \(\) => \{.*?\n  \};\n"
content = re.sub(executeBatch_pattern, "", content, flags=re.DOTALL)

# 5. Replace the inline modal JSX with the new component
old_modal_pattern = r"      \{showBatchRename && \(.*?      \)\}\n"
new_modal_jsx = """      {showBatchRename && (
        <BatchRenameModal
          videos={videos}
          setVideos={setVideos}
          addLog={addLog}
          onClose={() => setShowBatchRename(false)}
        />
      )}\n"""

# To make this safer, we find the index of `{showBatchRename && (` and replace everything up to the matching `      )}`
match = re.search(r"      \{showBatchRename && \(\n        <div className=\"modal-overlay\">\n          <div className=\"modal-content premium-glass\".*?      \)\}\n", content, flags=re.DOTALL)
if match:
    content = content[:match.start()] + new_modal_jsx + content[match.end():]
else:
    print("Warning: Could not find the inline modal JSX")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("ControlBar.tsx split applied successfully.")
