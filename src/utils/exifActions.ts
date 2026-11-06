import { invoke } from '@tauri-apps/api/core';
import type { VideoItem } from '../types';
import { toRealPath } from './videoUtils';

interface QuickStripExifParams {
  action: string;
  selectedIds: Set<string>;
  videos: VideoItem[];
  v: VideoItem;
  metadataCache: React.MutableRefObject<Record<string, any>>;
  addLog: (m: string) => void;
  setToast: (m: string | null) => void;
}

export async function executeQuickStripExif({
  action,
  selectedIds,
  videos,
  v,
  metadataCache,
  addLog,
  setToast,
}: QuickStripExifParams): Promise<void> {
  const isBatch = action.endsWith('_selected') && selectedIds.size > 0;
  const targetItems = isBatch
    ? videos.filter(item => selectedIds.has(item.id))
    : [v];
  const paths = targetItems
    .map(item => {
      const raw = (item.folderFiles && item.currentIdx !== undefined && item.folderFiles[item.currentIdx])
        ? (item.folderFiles[item.currentIdx]?.path || item.folderFiles[item.currentIdx]?.url)
        : (item.realPath || item.url);
      return toRealPath(raw || '') || raw || '';
    })
    .filter(p => p && !p.startsWith('/demos/'));

  if (paths.length === 0) {
    addLog('Metadata Strip Error: No valid disk paths found.');
    return;
  }

  const backendAction = action.includes('comfyui')
    ? 'strip_comfyui'
    : action.includes('exif')
    ? 'strip_exif'
    : 'strip_all';

  const label = backendAction === 'strip_comfyui'
    ? 'ComfyUI workflow/prompt data'
    : backendAction === 'strip_exif'
    ? 'EXIF metadata'
    : 'all ComfyUI & EXIF metadata';

  try {
    const res = await invoke<{
      results: { original_path: string; output_path: string; success: boolean }[];
      success_count: number;
      fail_count: number;
      total_bytes_saved: number;
    }>('strip_or_update_metadata_batch', {
      request: {
        paths,
        action: backendAction,
        overwrite: true,
        editable_exif: null,
        comfyui_entries: null,
      },
    });
    metadataCache.current = {};
    const kb = Math.max(0, res.total_bytes_saved / 1024).toFixed(1);
    const msg = `✓ Stripped ${label} from ${res.success_count} file(s)${res.total_bytes_saved > 0 ? ` (${kb} KB freed)` : ''}`;
    addLog(msg);
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  } catch (err) {
    console.error('Quick metadata strip failed:', err);
    addLog(`Metadata Strip Failed: ${err}`);
    setToast(`Metadata strip failed: ${err}`);
    setTimeout(() => setToast(null), 4000);
  }
}
