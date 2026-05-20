import os
import re

file_path = r"c:\Users\louis\OneDrive\Documents\GitHub\Video\src\components\ControlBar.tsx"
modal_path = r"c:\Users\louis\OneDrive\Documents\GitHub\Video\src\components\modals\SettingsModal.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# find {showSettings && ( ... )}
match = re.search(r"      \{showSettings && \(\n        <div className=\"settings-overlay\">.*?      \)\}\n", content, flags=re.DOTALL)

if not match:
    print("Warning: Could not find Settings modal JSX")
    exit(1)

settings_jsx = match.group(0)

# Create SettingsModal.tsx
modal_content = f"""import {{ X, Monitor, MousePointer2 }} from 'lucide-react';
import {{ useStore }} from '../../store/useStore';

interface SettingsModalProps {{
  confirmDeletion: boolean;
  setConfirmDeletion: React.Dispatch<React.SetStateAction<boolean>>;
  onClose: () => void;
}}

export function SettingsModal({{ confirmDeletion, setConfirmDeletion, onClose }}: SettingsModalProps) {{
  const {{ theme, setTheme, alwaysOnTop, setAlwaysOnTop }} = useStore();

  return (
{settings_jsx.replace('showSettings && (', '').replace(')}', ');').replace('setShowSettings(false)', 'onClose()')}
}}
"""

with open(modal_path, "w", encoding="utf-8") as f:
    f.write(modal_content)

# Update ControlBar.tsx
import_stmt = "import { SettingsModal } from './modals/SettingsModal';\n"
if "import { SettingsModal }" not in content:
    content = content.replace("import { CollectionsModal } from './modals/CollectionsModal';", "import { CollectionsModal } from './modals/CollectionsModal';\n" + import_stmt)

new_modal_jsx = """      {showSettings && (
        <SettingsModal
          confirmDeletion={confirmDeletion}
          setConfirmDeletion={setConfirmDeletion}
          onClose={() => setShowSettings(false)}
        />
      )}\n"""

content = content[:match.start()] + new_modal_jsx + content[match.end():]

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("SettingsModal extracted successfully.")
