import re
import os

app_path = r"c:\Users\louis\OneDrive\Documents\GitHub\Video\src\App.tsx"
controlbar_path = r"c:\Users\louis\OneDrive\Documents\GitHub\Video\src\components\ControlBar.tsx"

with open(app_path, "r", encoding="utf-8") as f:
    app_code = f.read()

with open(controlbar_path, "r", encoding="utf-8") as f:
    cb_code = f.read()

# 1. Update ControlBar.tsx
# Remove from interface
props_to_remove = [
    "theme", "setTheme", "alwaysOnTop", "setAlwaysOnTop", "masterPlaying", "setMasterPlaying",
    "masterMuted", "setMasterMuted", "globalVolume", "setGlobalVolume", "globalRepeat", "setGlobalRepeat",
    "immersive", "setImmersive", "zoom", "setZoom", "speed", "setSpeed", "fitMode", "setFitMode",
    "masterShowUI", "setMasterShowUI", "isFS", "setIsFS", "selectedIds", "setSelectedIds",
    "selectionMode", "setSelectionMode", "mediaMode", "setMediaMode"
]

cb_code = re.sub(r"import type \{ VideoItem, RepeatMode \} from '../types';", "import type { VideoItem, RepeatMode } from '../types';\nimport { useStore } from '../store/useStore';", cb_code)

# Remove props from interface and function args
for prop in props_to_remove:
    cb_code = re.sub(r"^\s*" + prop + r"\s*:[^\n]*\n", "", cb_code, flags=re.MULTILINE)
    cb_code = re.sub(r"^\s*" + prop + r"\s*,\n", "", cb_code, flags=re.MULTILINE)

# Inject useStore
store_destructure = "  const { " + ", ".join(props_to_remove) + " } = useStore();"
cb_code = cb_code.replace("export function ControlBar({", "export function ControlBar({")
cb_code = re.sub(r"(export function ControlBar\(\{[\s\S]*?\}\s*:\s*ControlBarProps\)\s*\{)", r"\1\n" + store_destructure, cb_code)

with open(controlbar_path, "w", encoding="utf-8") as f:
    f.write(cb_code)

# 2. Update App.tsx
app_code = re.sub(r"import \{ ControlBar \} from '\./components/ControlBar';", "import { ControlBar } from './components/ControlBar';\nimport { useStore } from './store/useStore';", app_code)

# Replace useStates
states_to_remove = [
    r"const \[speed, setSpeed\] = useState.*?;",
    r"const \[alwaysOnTop, setAlwaysOnTop\] = useState.*?;",
    r"const \[isFS, setIsFS\] = useState.*?;",
    r"const \[masterPlaying, setMasterPlaying\] = useState.*?;",
    r"const \[masterMuted, setMasterMuted\] = useState.*?;",
    r"const \[globalVolume, setGlobalVolume\] = useState.*?;",
    r"const \[masterShowUI, setMasterShowUI\] = useState.*?;",
    r"const \[mediaMode, setMediaMode\] = useState[\s\S]*?\n  \}\);",
    r"const \[fitMode, setFitMode\] = useState.*?;",
    r"const \[selectedIds, setSelectedIds\] = useState.*?;",
    r"const \[selectionMode, setSelectionMode\] = useState.*?;",
    r"const \[theme, setTheme\] = useState.*?;",
    r"const \[globalRepeat, setGlobalRepeat\] = useState.*?;",
    r"const \[zoom, setZoom\] = useState.*?;",
    r"const \[immersive, setImmersive\] = useState.*?;",
    r"const \[showImmersiveUI, setShowImmersiveUI\] = useState.*?;"
]

# Note: App.tsx has some of these inside hooks. Let's do it via string replace for precision.
app_code = app_code.replace("const [speed, setSpeed] = useState(1);", "")
app_code = app_code.replace("const [alwaysOnTop, setAlwaysOnTop] = useState(false);", "")
app_code = app_code.replace("const [isFS, setIsFS] = useState(false);", "")
app_code = app_code.replace("const [masterPlaying, setMasterPlaying] = useState(true);", "")
app_code = app_code.replace("const [masterMuted, setMasterMuted] = useState(true);", "")
app_code = app_code.replace("const [globalVolume, setGlobalVolume] = useState(0);", "")
app_code = app_code.replace("const [masterShowUI, setMasterShowUI] = useState(true);", "")
app_code = app_code.replace("const [fitMode, setFitMode] = useState<'cover' | 'contain'>('contain');", "")
app_code = app_code.replace("const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());", "")
app_code = app_code.replace("const [selectionMode, setSelectionMode] = useState(false);", "")

# mediaMode is a callback useState
media_mode_str = """const [mediaMode, setMediaMode] = useState<'video' | 'picture'>(() => {
    const saved = localStorage.getItem('cosmo-media-mode');
    return saved === 'picture' ? 'picture' : 'video';
  });"""
app_code = app_code.replace(media_mode_str, "")

app_code = app_code.replace("const [showImmersiveUI, setShowImmersiveUI] = useState(true);", "const showImmersiveUI = immersive;") # Replace showImmersiveUI mapping

# Inject useStore into App
app_destructure = "  const { mediaMode, setMediaMode, theme, setTheme, alwaysOnTop, setAlwaysOnTop, isFS, setIsFS, masterPlaying, setMasterPlaying, masterMuted, setMasterMuted, globalVolume, setGlobalVolume, speed, setSpeed, globalRepeat, setGlobalRepeat, fitMode, setFitMode, zoom, setZoom, immersive, setImmersive, masterShowUI, setMasterShowUI, selectedIds, setSelectedIds, selectionMode, setSelectionMode } = useStore();"

app_code = app_code.replace("export default function App() {\n  const urlParams", "export default function App() {\n" + app_destructure + "\n  const urlParams")

# Remove props from <ControlBar ... />
for prop in props_to_remove:
    # Match `prop={prop}` or `prop={something}`
    app_code = re.sub(r"\s*" + prop + r"=\{[^}]+\}", "", app_code)

with open(app_path, "w", encoding="utf-8") as f:
    f.write(app_code)

print("Refactor complete")
