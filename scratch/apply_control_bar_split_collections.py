import os
import re

file_path = r"c:\Users\louis\OneDrive\Documents\GitHub\Video\src\components\ControlBar.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add the import
import_stmt = "import { CollectionsModal } from './modals/CollectionsModal';\n"
if "import { CollectionsModal }" not in content:
    content = content.replace("import { BatchRenameModal } from './modals/BatchRenameModal';", "import { BatchRenameModal } from './modals/BatchRenameModal';\n" + import_stmt)

# 2. Remove states related to collections
states_to_remove = [
    r"  const \[collectionName, setCollectionName\] = useState\(''\);\n"
]
for state_pattern in states_to_remove:
    content = re.sub(state_pattern, "", content)

# 3. Remove the save/load/delete functions
funcs_pattern = r"  const saveCollection = \(\) => \{.*?  const deleteCollection = \(name: string\) => \{.*?  \};\n"
content = re.sub(funcs_pattern, "", content, flags=re.DOTALL)

# 4. Replace the inline modal JSX with the new component
new_modal_jsx = """      {showCollections && (
        <CollectionsModal
          videos={videos}
          setVideos={setVideos}
          collections={collections}
          setCollections={setCollections}
          addLog={addLog}
          onClose={() => setShowCollections(false)}
        />
      )}\n"""

# find {showCollections && ( ... )}
match = re.search(r"      \{showCollections && \(\n        <div className=\"modal-overlay\">\n          <div className=\"modal-content\".*?      \)\}\n", content, flags=re.DOTALL)
if match:
    content = content[:match.start()] + new_modal_jsx + content[match.end():]
else:
    print("Warning: Could not find the inline Collections modal JSX")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("ControlBar.tsx Collections split applied successfully.")
