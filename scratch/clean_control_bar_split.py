import os

file_path = r"c:\Users\louis\OneDrive\Documents\GitHub\Video\src\components\ControlBar.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    code = f.read()

# 1. Imports
target_import = "import { HelpModal } from './HelpModal';"
replacement_import = """import { HelpModal } from './HelpModal';
import { useStore } from '../store/useStore';
import { BatchRenameModal } from './modals/BatchRenameModal';
import { CollectionsModal } from './modals/CollectionsModal';
import { SettingsModal } from './modals/SettingsModal';"""

code = code.replace(target_import, replacement_import)

# 2. ControlBarProps interface
target_props = """interface ControlBarProps {
  videos: VideoItem[];
  collections: Record<string, VideoItem[]>;
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  setCollections: React.Dispatch<React.SetStateAction<Record<string, VideoItem[]>>>;
  rotationInterval: number;
  setRotationInterval: React.Dispatch<React.SetStateAction<number>>;
  snapshotDir: string;
  setSnapshotDir: React.Dispatch<React.SetStateAction<string>>;
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  speed: number;
  setSpeed: React.Dispatch<React.SetStateAction<number>>;
  theme: string;
  setTheme: (t: string) => void;
  alwaysOnTop: boolean;
  setAlwaysOnTop: React.Dispatch<React.SetStateAction<boolean>>;
  masterPlaying: boolean;
  setMasterPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  masterMuted: boolean;
  setMasterMuted: React.Dispatch<React.SetStateAction<boolean>>;
  globalVolume: number;
  setGlobalVolume: React.Dispatch<React.SetStateAction<number>>;
  globalRepeat: RepeatMode;
  setGlobalRepeat: React.Dispatch<React.SetStateAction<RepeatMode>>;
  immersive: boolean;
  setImmersive: React.Dispatch<React.SetStateAction<boolean>>;
  rotating: boolean;
  setRotating: React.Dispatch<React.SetStateAction<boolean>>;
  sessionDuration: number;
  setSessionDuration: React.Dispatch<React.SetStateAction<number>>;
  fitMode: 'cover' | 'contain';
  setFitMode: React.Dispatch<React.SetStateAction<'cover' | 'contain'>>;
  masterShowUI: boolean;
  setMasterShowUI: React.Dispatch<React.SetStateAction<boolean>>;
  addLog: (msg: string) => void;
  onUpdateVideo: (id: string, updates: Partial<VideoItem>) => void;
  onRemoveVideo: (id: string) => void;
  onToggleFocus: (id: string | null) => void;
  onLog: (msg: string) => void;
  onBatchRemove: () => void;
  onBatchMute: (mute: boolean) => void;
  onBatchPlay: (play: boolean) => void;
  filtered: VideoItem[];
  focusedId: string | null;
  showSettings: boolean;
  setShowSettings: React.Dispatch<React.SetStateAction<boolean>>;
  showCollections: boolean;
  setShowCollections: React.Dispatch<React.SetStateAction<boolean>>;
  showLogs: boolean;
  setShowLogs: React.Dispatch<React.SetStateAction<boolean>>;
  newCollectionName: string;
  setNewCollectionName: React.Dispatch<React.SetStateAction<string>>;
  logs: { t: string; m: string }[];
  setGlobalControl: React.Dispatch<React.SetStateAction<string | null>>;
  confirmDeletion: boolean;
  setConfirmDeletion: React.Dispatch<React.SetStateAction<boolean>>;
  isFS: boolean;

  setIsFS: React.Dispatch<React.SetStateAction<boolean>>;
  isPopout: boolean;
  showHelp: boolean;
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>;
  showSymphonyWorkshop: boolean;
  setShowSymphonyWorkshop: (val: boolean) => void;
  toggleMasterMute: (soloId?: string) => void;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectionMode: boolean;
  setSelectionMode: React.Dispatch<React.SetStateAction<boolean>>;
  globalControl: string | null;
  mediaMode: 'video' | 'picture';
  setMediaMode: (mode: 'video' | 'picture') => void;
}"""

replacement_props = """interface ControlBarProps {
  videos: VideoItem[];
  collections: Record<string, VideoItem[]>;
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  setCollections: React.Dispatch<React.SetStateAction<Record<string, VideoItem[]>>>;
  rotationInterval: number;
  setRotationInterval: React.Dispatch<React.SetStateAction<number>>;
  snapshotDir: string;
  setSnapshotDir: React.Dispatch<React.SetStateAction<string>>;
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  addLog: (msg: string) => void;
  onUpdateVideo: (id: string, updates: Partial<VideoItem>) => void;
  onRemoveVideo: (id: string) => void;
  onToggleFocus: (id: string | null) => void;
  onLog: (msg: string) => void;
  onBatchRemove: () => void;
  onBatchMute: (mute: boolean) => void;
  onBatchPlay: (play: boolean) => void;
  filtered: VideoItem[];
  focusedId: string | null;
  showSettings: boolean;
  setShowSettings: React.Dispatch<React.SetStateAction<boolean>>;
  showCollections: boolean;
  setShowCollections: React.Dispatch<React.SetStateAction<boolean>>;
  showLogs: boolean;
  setShowLogs: React.Dispatch<React.SetStateAction<boolean>>;
  newCollectionName: string;
  setNewCollectionName: React.Dispatch<React.SetStateAction<string>>;
  logs: { t: string; m: string }[];
  setGlobalControl: React.Dispatch<React.SetStateAction<string | null>>;
  confirmDeletion: boolean;
  setConfirmDeletion: React.Dispatch<React.SetStateAction<boolean>>;

  isPopout: boolean;
  showHelp: boolean;
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>;
  showSymphonyWorkshop: boolean;
  setShowSymphonyWorkshop: (val: boolean) => void;
  toggleMasterMute: (soloId?: string) => void;
  globalControl: string | null;
}"""

code = code.replace(target_props, replacement_props)

# 3. ControlBar Function Declaration & Destructuring
target_destruct = """export function ControlBar({
  videos,
  collections,
  setVideos,
  setCollections,
  rotationInterval,
  setRotationInterval,
  snapshotDir,
  setSnapshotDir,
  search,
  setSearch,
  zoom,
  setZoom,
  speed,
  setSpeed,
  alwaysOnTop,
  setAlwaysOnTop,
  masterPlaying,
  setMasterPlaying,
  masterMuted,
  setMasterMuted,
  globalVolume,
  setGlobalVolume,
  globalRepeat,
  setGlobalRepeat,
  immersive,
  setImmersive,
  rotating,
  setRotating,
  sessionDuration,
  setSessionDuration,
  fitMode,
  setFitMode,
  masterShowUI,
  setMasterShowUI,
  addLog,
  onUpdateVideo,
  onRemoveVideo,
  onToggleFocus,
  onLog,
  onBatchRemove,
  onBatchMute,
  onBatchPlay,
  filtered,
  focusedId,
  showSettings,
  setShowSettings,
  showCollections,
  setShowCollections,
  showLogs,
  setShowLogs,
  newCollectionName,
  setNewCollectionName,
  logs,
  setGlobalControl,
  confirmDeletion,
  setConfirmDeletion,
  isFS,

  setIsFS,
  isPopout,
  showHelp,
  setShowHelp,
  showSymphonyWorkshop,
  setShowSymphonyWorkshop,
  theme,
  setTheme,
  toggleMasterMute,
  selectedIds,
  setSelectedIds,
  selectionMode,
  setSelectionMode,
  globalControl,
  mediaMode,
  setMediaMode,
}: ControlBarProps) {"""

replacement_destruct = """export function ControlBar({
  videos,
  collections,
  setVideos,
  setCollections,
  rotationInterval,
  setRotationInterval,
  snapshotDir,
  setSnapshotDir,
  search,
  setSearch,
  addLog,
  onUpdateVideo,
  onRemoveVideo,
  onToggleFocus,
  onLog,
  onBatchRemove,
  onBatchMute,
  onBatchPlay,
  filtered,
  focusedId,
  showSettings,
  setShowSettings,
  showCollections,
  setShowCollections,
  showLogs,
  setShowLogs,
  newCollectionName,
  setNewCollectionName,
  logs,
  setGlobalControl,
  confirmDeletion,
  setConfirmDeletion,
  isPopout,
  showHelp,
  setShowHelp,
  showSymphonyWorkshop,
  setShowSymphonyWorkshop,
  toggleMasterMute,
  globalControl,
}: ControlBarProps) {
  const {
    mediaMode, setMediaMode,
    theme, setTheme,
    alwaysOnTop, setAlwaysOnTop,
    isFS, setIsFS,
    masterPlaying, setMasterPlaying,
    masterMuted, setMasterMuted,
    globalVolume, setGlobalVolume,
    speed, setSpeed,
    globalRepeat, setGlobalRepeat,
    fitMode, setFitMode,
    zoom, setZoom,
    immersive, setImmersive,
    masterShowUI, setMasterShowUI,
    selectedIds, setSelectedIds,
    selectionMode, setSelectionMode
  } = useStore();"""

code = code.replace(target_destruct, replacement_destruct)

# 4. Remove local state variables and functions that have been extracted
target_states_and_funcs = """  const [collectionName, setCollectionName] = useState('');
  const [showBatchRename, setShowBatchRename] = useState(false);
  const [batchPrefix, setBatchPrefix] = useState('UNIT');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameHistory, setRenameHistory] = useState<string[]>([]);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);

  useEffect(() => {
    if (showBatchRename) {
      // Load from Tauri persistent storage
      invoke<string | null>('load_persistence', { key: 'rename_history' }).then(saved => {
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) setRenameHistory(parsed);
          } catch { setRenameHistory([]); }
        } else {
          setRenameHistory([]);
        }
      }).catch(() => setRenameHistory([]));
      setShowHistoryDropdown(false);
    }
  }, [showBatchRename]);

  const toggleMasterPlay = useCallback(() => {
    const newState = !masterPlaying;
    setMasterPlaying(newState);
    setVideos((p) => p.map((v) => ({ ...v, playing: newState })));
  }, [masterPlaying, setMasterPlaying, setVideos]);

  useEffect(() => {
    if (globalControl?.startsWith('batch-rename-selected-')) {
      setShowBatchRename(true);
      setGlobalControl(null);
    }
  }, [globalControl, setGlobalControl]);

  const saveCollection = () => {
    if (!collectionName.trim()) return;
    setCollections(p => ({ ...p, [collectionName]: videos }));
    setCollectionName('');
    addLog(`Saved Set: ${collectionName}`);
  };

  const loadCollection = (col: VideoItem[]) => {
    setVideos(col);
    setShowCollections(false);
    addLog('Loaded workspace set.');
  };

  const deleteCollection = (name: string) => {
    setCollections(p => {
      const n = { ...p };
      delete n[name];
      return n;
    });
  };
  
  const executeBatchRename = async () => {"""

replacement_states_and_funcs = """  const [showBatchRename, setShowBatchRename] = useState(false);

  const toggleMasterPlay = useCallback(() => {
    const newState = !masterPlaying;
    setMasterPlaying(newState);
    setVideos((p) => p.map((v) => ({ ...v, playing: newState })));
  }, [masterPlaying, setMasterPlaying, setVideos]);

  useEffect(() => {
    if (globalControl?.startsWith('batch-rename-selected-')) {
      setShowBatchRename(true);
      setGlobalControl(null);
    }
  }, [globalControl, setGlobalControl]);"""

code = code.replace(target_states_and_funcs, replacement_states_and_funcs)

# Since executeBatchRename starts with a huge block of code that ends with a lot of stuff,
# let's locate the entire executeBatchRename function block.
# We find: const executeBatchRename = async () => { ... }
# To do this safely, we can search for the end of it: "addLog(mediaMode === 'picture' ? \"BATCH IMAGE RENAME COMPLETE.\" : \"SMART BATCH ORCHESTRATION COMPLETE.\");\n  };"
# Let's locate from `const executeBatchRename = async () => {` to the end of the method block.

start_tag = "  const executeBatchRename = async () => {"
end_tag = '    addLog(mediaMode === \'picture\' ? "BATCH IMAGE RENAME COMPLETE." : "SMART BATCH ORCHESTRATION COMPLETE.");\n  };'

idx_start = code.find(start_tag)
idx_end = code.find(end_tag)

if idx_start != -1 and idx_end != -1:
    code = code[:idx_start] + code[idx_end + len(end_tag):]
else:
    print(f"ERROR: executeBatchRename locate failed! start={idx_start}, end={idx_end}")

# 5. Let's do the modal JSX replacements!
# We can search for each modal's open/close blocks exactly to avoid regex issues.

# SettingsModal JSX Replacement
settings_modal_start = "      {showSettings && (\n        <div className=\"settings-overlay\">"
settings_modal_end = """              <div className="settings-footer" style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.6, fontSize: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Info size={12} />
                  <span>COSMO SYMPHONY v3.4.0</span>
                </div>
                <span>SYSTEM STABLE</span>
              </div>
            </div>
          </div>
        </div>
      )}"""

idx_settings_start = code.find(settings_modal_start)
idx_settings_end = code.find(settings_modal_end)

if idx_settings_start != -1 and idx_settings_end != -1:
    settings_replacement = """      {showSettings && (
        <SettingsModal
          confirmDeletion={confirmDeletion}
          setConfirmDeletion={setConfirmDeletion}
          onClose={() => setShowSettings(false)}
        />
      )}"""
    code = code[:idx_settings_start] + settings_replacement + code[idx_settings_end + len(settings_modal_end):]
else:
    print(f"ERROR: Settings modal locate failed! start={idx_settings_start}, end={idx_settings_end}")

# CollectionsModal JSX Replacement
collections_modal_start = "      {showCollections && (\n        <div className=\"modal-overlay\">"
collections_modal_end = """              </div>
            </div>
          </div>
        </div>
      )}"""

idx_coll_start = code.find(collections_modal_start)
idx_coll_end = code.find(collections_modal_end, idx_coll_start if idx_coll_start != -1 else 0)

if idx_coll_start != -1 and idx_coll_end != -1:
    collections_replacement = """      {showCollections && (
        <CollectionsModal
          videos={videos}
          setVideos={setVideos}
          collections={collections}
          setCollections={setCollections}
          addLog={addLog}
          onClose={() => setShowCollections(false)}
        />
      )}"""
    code = code[:idx_coll_start] + collections_replacement + code[idx_coll_end + len(collections_modal_end):]
else:
    print(f"ERROR: Collections modal locate failed! start={idx_coll_start}, end={idx_coll_end}")

# BatchRenameModal JSX Replacement
rename_modal_start = "      {showBatchRename && (\n        <div className=\"modal-overlay\">"
rename_modal_end = """              </div>
            </div>
          </div>
        </div>
      )}"""

idx_rename_start = code.find(rename_modal_start)
idx_rename_end = code.find(rename_modal_end, idx_rename_start if idx_rename_start != -1 else 0)

if idx_rename_start != -1 and idx_rename_end != -1:
    rename_replacement = """      {showBatchRename && (
        <BatchRenameModal
          videos={videos}
          setVideos={setVideos}
          addLog={addLog}
          onClose={() => setShowBatchRename(false)}
        />
      )}"""
    code = code[:idx_rename_start] + rename_replacement + code[idx_rename_end + len(rename_modal_end):]
else:
    print(f"ERROR: Batch Rename modal locate failed! start={idx_rename_start}, end={idx_rename_end}")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(code)

print("ControlBar split completed perfectly!")
