import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
  CheckSquare,
  Square,
  FileCode2,
  Camera,
  Save,
  Copy,
  Check,
  RefreshCw,
  Layers,
  MapPin,
  Plus,
  Wand2,
} from 'lucide-react';
import type { VideoItem } from '../../types';
import { isValidPictureExtension, toRealPath } from '../../utils/videoUtils';

import type {
  MetadataKeyValue,
  EditableExifFields,
  FileMetadataReport,
  SingleFileMetadataResult,
  BatchMetadataResult,
  MetadataStudioModalProps,
  ExtractedComfySummary,
} from './metadata/MetadataTypes';
import { extractComfyUiSummary, resolveItemRealPath, formatBytes } from './metadata/MetadataTypes';
import { MetadataComfyTab } from './metadata/MetadataComfyTab';
import { MetadataExifTab } from './metadata/MetadataExifTab';
import { MetadataBatchSidebar } from './metadata/MetadataBatchSidebar';

export const MetadataStudioModal: React.FC<MetadataStudioModalProps> = ({
  targets,
  allVideos,
  onClose,
  onFilesUpdated,
  addLog,
}) => {
  const [workingItems, setWorkingItems] = useState<VideoItem[]>(targets);
  const [reports, setReports] = useState<Record<string, FileMetadataReport>>({});
  const [checkedPaths, setCheckedPaths] = useState<Set<string>>(new Set());
  const [activePath, setActivePath] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'comfyui' | 'exif'>('comfyui');
  const [overwriteMode, setOverwriteMode] = useState<boolean>(true);
  const [filterMode, setFilterMode] = useState<'all' | 'comfyui' | 'exif'>('all');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{ text: string; kind: 'success' | 'info' | 'error' } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Editable states for the currently active file
  const [editableExif, setEditableExif] = useState<EditableExifFields>({
    title: '',
    artist: '',
    copyright: '',
    description: '',
    comment: '',
    software: '',
    date_time: '',
  });
  const [editableComfyEntries, setEditableComfyEntries] = useState<MetadataKeyValue[]>([]);

  // Resolve unique disk paths from workingItems
  const itemPaths = useMemo(() => {
    const seen = new Set<string>();
    const list: { path: string; item: VideoItem }[] = [];
    for (const item of workingItems) {
      const p = resolveItemRealPath(item);
      if (p && !p.startsWith('/demos/') && !seen.has(p)) {
        seen.add(p);
        list.push({ path: p, item });
      }
    }
    return list;
  }, [workingItems]);

  const scanFiles = useCallback(
    async (pathsToScan: string[], preserveSelection = false) => {
      if (pathsToScan.length === 0) return;
      setIsScanning(true);
      try {
        const batchReports = await invoke<FileMetadataReport[]>('inspect_files_metadata_batch', {
          paths: pathsToScan,
        });
        const map: Record<string, FileMetadataReport> = {};
        for (const r of batchReports) {
          map[r.path] = r;
        }
        // Also match by original path string if normalized slightly differently
        for (let i = 0; i < pathsToScan.length; i++) {
          const orig = pathsToScan[i];
          if (!map[orig]) {
            const match = batchReports.find(
              (b) => b.path.toLowerCase().replace(/\//g, '\\') === orig.toLowerCase().replace(/\//g, '\\')
            );
            if (match) map[orig] = match;
          }
        }
        setReports(map);

        if (!preserveSelection) {
          setCheckedPaths(new Set(pathsToScan));
          const firstPath = pathsToScan[0];
          setActivePath(firstPath);
          const firstRep = map[firstPath];
          if (firstRep) {
            setActiveTab(firstRep.has_comfyui ? 'comfyui' : 'exif');
          }
        }
      } catch (err) {
        console.error('Failed to scan metadata:', err);
        addLog(`Metadata scan error: ${err}`);
      } finally {
        setIsScanning(false);
      }
    },
    [addLog]
  );

  useEffect(() => {
    const paths = itemPaths.map((x) => x.path);
    scanFiles(paths, false);
  }, [itemPaths, scanFiles]);

  // Sync active file's report into the editor fields when activePath or reports change
  const activeReport = activePath ? reports[activePath] : undefined;

  useEffect(() => {
    if (activeReport) {
      setEditableExif({ ...activeReport.editable_exif });
      setEditableComfyEntries(activeReport.comfyui_entries.map((e) => ({ ...e })));
    } else {
      setEditableExif({
        title: '',
        artist: '',
        copyright: '',
        description: '',
        comment: '',
        software: '',
        date_time: '',
      });
      setEditableComfyEntries([]);
    }
  }, [activePath, activeReport]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, isProcessing]);

  const filteredItemPaths = useMemo(() => {
    return itemPaths.filter(({ path }) => {
      const rep = reports[path];
      if (!rep) return true;
      if (filterMode === 'comfyui') return rep.has_comfyui;
      if (filterMode === 'exif') return rep.has_exif;
      return true;
    });
  }, [itemPaths, reports, filterMode]);

  const stats = useMemo(() => {
    let comfyCount = 0;
    let exifCount = 0;
    let gpsCount = 0;
    for (const { path } of itemPaths) {
      const r = reports[path];
      if (r?.has_comfyui) comfyCount++;
      if (r?.has_exif) exifCount++;
      if (r?.has_gps) gpsCount++;
    }
    return { total: itemPaths.length, comfyCount, exifCount, gpsCount };
  }, [itemPaths, reports]);

  const handleLoadAllGridPictures = () => {
    const pics = allVideos.filter((v) => {
      const p = resolveItemRealPath(v);
      return p && isValidPictureExtension(p);
    });
    if (pics.length > 0) {
      setWorkingItems(pics);
      setStatusBanner({
        text: `Loaded all ${pics.length} pictures from the workspace grid.`,
        kind: 'info',
      });
    }
  };

  const handleLoadAllGridFiles = () => {
    if (allVideos.length > 0) {
      setWorkingItems(allVideos);
      setStatusBanner({
        text: `Loaded all ${allVideos.length} media files from the workspace grid.`,
        kind: 'info',
      });
    }
  };

  const toggleCheckPath = (path: string) => {
    setCheckedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleCheckAllVisible = () => {
    const allVisibleChecked = filteredItemPaths.every(({ path }) => checkedPaths.has(path));
    setCheckedPaths((prev) => {
      const next = new Set(prev);
      if (allVisibleChecked) {
        filteredItemPaths.forEach(({ path }) => next.delete(path));
      } else {
        filteredItemPaths.forEach(({ path }) => next.add(path));
      }
      return next;
    });
  };

  const copyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const executeMetadataAction = async (
    action: 'strip_comfyui' | 'strip_exif' | 'strip_all' | 'update_metadata',
    targetPaths: string[],
    customExif?: EditableExifFields,
    customComfy?: MetadataKeyValue[]
  ) => {
    if (targetPaths.length === 0) {
      setStatusBanner({ text: 'No files checked! Select at least one file first.', kind: 'error' });
      return;
    }

    setIsProcessing(true);
    setStatusBanner(null);

    try {
      const res = await invoke<BatchMetadataResult>('strip_or_update_metadata_batch', {
        request: {
          paths: targetPaths,
          action,
          overwrite: overwriteMode,
          editable_exif: customExif || null,
          comfyui_entries: customComfy || null,
        },
      });

      const savedKb = Math.max(0, res.total_bytes_saved / 1024).toFixed(1);
      const actionLabel =
        action === 'strip_comfyui'
          ? 'Removed ComfyUI workflow/prompt data'
          : action === 'strip_exif'
          ? 'Removed EXIF/XMP metadata'
          : action === 'strip_all'
          ? 'Stripped ALL ComfyUI & EXIF metadata'
          : 'Saved updated metadata';

      const msg = `${actionLabel} on ${res.success_count} file(s)${
        res.total_bytes_saved > 0 ? ` (${savedKb} KB freed)` : ''
      }${res.fail_count > 0 ? ` • ${res.fail_count} failed` : ''}.`;

      addLog(`✅ METADATA STUDIO: ${msg}`);
      setStatusBanner({
        text: msg,
        kind: res.fail_count > 0 && res.success_count === 0 ? 'error' : 'success',
      });

      onFilesUpdated(res.results, overwriteMode);

      // Re-scan files to refresh badges and inspector immediately
      const allCurrentPaths = itemPaths.map((x) => x.path);
      await scanFiles(allCurrentPaths, true);
    } catch (err) {
      console.error('Metadata operation failed:', err);
      addLog(`❌ METADATA STUDIO ERROR: ${err}`);
      setStatusBanner({ text: `Operation failed: ${err}`, kind: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const checkedList = useMemo(() => Array.from(checkedPaths), [checkedPaths]);
  const comfySummary = useMemo(
    () => (activeReport ? extractComfyUiSummary(activeReport.comfyui_entries) : null),
    [activeReport]
  );

  const formatBytes = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(4, 5, 10, 0.85)',
        backdropFilter: 'blur(22px)',
        zIndex: 350000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        userSelect: 'none',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isProcessing) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(1140px, 96vw)',
          height: 'min(820px, 92vh)',
          background: 'linear-gradient(160deg, rgba(18, 20, 30, 0.96) 0%, rgba(10, 11, 18, 0.98) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '20px',
          boxShadow: '0 32px 80px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#fff',
        }}
      >
        {/* TOP HEADER */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.18), rgba(168, 85, 247, 0.22))',
                border: '1px solid rgba(0, 255, 136, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent, #00ff88)',
              }}
            >
              <FileCode2 size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, letterSpacing: '0.8px' }}>
                  METADATA, EXIF & COMFYUI STUDIO
                </h2>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '999px',
                    background: 'rgba(0, 255, 136, 0.12)',
                    color: 'var(--accent, #00ff88)',
                    border: '1px solid rgba(0, 255, 136, 0.3)',
                  }}
                >
                  LOSSLESS ENGINE
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginTop: '2px', display: 'flex', gap: '12px' }}>
                <span>
                  <strong style={{ color: '#fff' }}>{stats.total}</strong> File(s) Loaded
                </span>
                <span>•</span>
                <span>
                  <strong style={{ color: '#c084fc' }}>{stats.comfyCount}</strong> with ComfyUI JSON
                </span>
                <span>•</span>
                <span>
                  <strong style={{ color: '#38bdf8' }}>{stats.exifCount}</strong> with EXIF/Tags
                </span>
                {stats.gpsCount > 0 && (
                  <>
                    <span>•</span>
                    <span style={{ color: '#fbbf24', fontWeight: 700 }}>
                      ⚠️ {stats.gpsCount} with GPS Location
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleLoadAllGridPictures}
              disabled={isProcessing}
              title="Load every picture currently in the workspace grid into this batch"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                padding: '7px 12px',
                color: '#e2e8f0',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Layers size={13} style={{ color: 'var(--accent, #00ff88)' }} />
              Load All Grid Pictures
            </button>
            <button
              onClick={handleLoadAllGridFiles}
              disabled={isProcessing}
              title="Load all media files (pictures + videos) from the workspace grid"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                padding: '7px 12px',
                color: '#e2e8f0',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              All Grid Files ({allVideos.length})
            </button>
            <button
              onClick={() => scanFiles(itemPaths.map((x) => x.path), true)}
              disabled={isScanning || isProcessing}
              title="Rescan metadata from disk"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                padding: '7px 9px',
                color: '#e2e8f0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <RefreshCw size={14} className={isScanning ? 'spin' : ''} />
            </button>
            <button
              onClick={onClose}
              disabled={isProcessing}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '7px 9px',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* BATCH ACTION BAR */}
        <div
          style={{
            padding: '12px 22px',
            background: 'rgba(0, 0, 0, 0.35)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          {/* Save Mode Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '10px', fontWeight: 800, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.6px' }}>
              OUTPUT MODE:
            </span>
            <button
              onClick={() => setOverwriteMode(true)}
              style={{
                padding: '5px 11px',
                borderRadius: '7px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                background: overwriteMode ? 'rgba(0, 255, 136, 0.16)' : 'rgba(255, 255, 255, 0.04)',
                border: overwriteMode
                  ? '1px solid rgba(0, 255, 136, 0.45)'
                  : '1px solid rgba(255, 255, 255, 0.08)',
                color: overwriteMode ? 'var(--accent, #00ff88)' : 'rgba(255, 255, 255, 0.6)',
              }}
            >
              Overwrite Originals In-Place
            </button>
            <button
              onClick={() => setOverwriteMode(false)}
              style={{
                padding: '5px 11px',
                borderRadius: '7px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                background: !overwriteMode ? 'rgba(56, 189, 248, 0.16)' : 'rgba(255, 255, 255, 0.04)',
                border: !overwriteMode
                  ? '1px solid rgba(56, 189, 248, 0.45)'
                  : '1px solid rgba(255, 255, 255, 0.08)',
                color: !overwriteMode ? '#38bdf8' : 'rgba(255, 255, 255, 0.6)',
              }}
            >
              Save as Clean Copies (*_clean)
            </button>
          </div>

          {/* 1-Click Batch Strip Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              disabled={isProcessing || checkedList.length === 0}
              onClick={() => executeMetadataAction('strip_comfyui', checkedList)}
              style={{
                padding: '8px 14px',
                borderRadius: '9px',
                fontSize: '11.5px',
                fontWeight: 800,
                cursor: isProcessing || checkedList.length === 0 ? 'not-allowed' : 'pointer',
                background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.22), rgba(126, 34, 206, 0.32))',
                border: '1px solid rgba(192, 132, 252, 0.45)',
                color: '#e9d5ff',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                opacity: isProcessing || checkedList.length === 0 ? 0.45 : 1,
              }}
            >
              <Sparkles size={13} />
              Remove ComfyUI Info ({checkedList.length})
            </button>

            <button
              disabled={isProcessing || checkedList.length === 0}
              onClick={() => executeMetadataAction('strip_exif', checkedList)}
              style={{
                padding: '8px 14px',
                borderRadius: '9px',
                fontSize: '11.5px',
                fontWeight: 800,
                cursor: isProcessing || checkedList.length === 0 ? 'not-allowed' : 'pointer',
                background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(2, 132, 199, 0.3))',
                border: '1px solid rgba(56, 189, 248, 0.45)',
                color: '#bae6fd',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                opacity: isProcessing || checkedList.length === 0 ? 0.45 : 1,
              }}
            >
              <Camera size={13} />
              Delete EXIF Info ({checkedList.length})
            </button>

            <button
              disabled={isProcessing || checkedList.length === 0}
              onClick={() => executeMetadataAction('strip_all', checkedList)}
              style={{
                padding: '8px 16px',
                borderRadius: '9px',
                fontSize: '11.5px',
                fontWeight: 800,
                cursor: isProcessing || checkedList.length === 0 ? 'not-allowed' : 'pointer',
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.28), rgba(185, 28, 28, 0.4))',
                border: '1px solid rgba(248, 113, 113, 0.55)',
                color: '#fecaca',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                opacity: isProcessing || checkedList.length === 0 ? 0.45 : 1,
                boxShadow: '0 4px 16px rgba(239, 68, 68, 0.2)',
              }}
            >
              <ShieldAlert size={14} />
              Strip ALL (ComfyUI + EXIF) ({checkedList.length})
            </button>
          </div>
        </div>

        {/* STATUS BANNER */}
        {statusBanner && (
          <div
            style={{
              padding: '8px 22px',
              fontSize: '11.5px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background:
                statusBanner.kind === 'success'
                  ? 'rgba(0, 255, 136, 0.12)'
                  : statusBanner.kind === 'error'
                  ? 'rgba(239, 68, 68, 0.16)'
                  : 'rgba(56, 189, 248, 0.12)',
              color:
                statusBanner.kind === 'success'
                  ? 'var(--accent, #00ff88)'
                  : statusBanner.kind === 'error'
                  ? '#fca5a5'
                  : '#7dd3fc',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <span>{statusBanner.text}</span>
            <button
              onClick={() => setStatusBanner(null)}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '11px' }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* MAIN SPLIT BODY */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* LEFT SIDEBAR: MULTI-FILE BATCH LIST */}
          <MetadataBatchSidebar
            filteredItemPaths={filteredItemPaths}
            itemPaths={itemPaths}
            reports={reports}
            checkedPaths={checkedPaths}
            activePath={activePath}
            stats={stats}
            filterMode={filterMode}
            setFilterMode={setFilterMode}
            toggleCheckAllVisible={toggleCheckAllVisible}
            toggleCheckPath={toggleCheckPath}
            setActivePath={setActivePath}
          />

          {/* RIGHT PANE: INSPECTOR & EDITOR FOR ACTIVE FILE */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {/* Active File Bar & Tabs */}
            <div
              style={{
                padding: '12px 20px 0',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                background: 'rgba(255, 255, 255, 0.015)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', fontWeight: 700 }}>
                    INSPECTING & EDITING FILE:
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 800,
                      color: '#fff',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={activePath}
                  >
                    {activeReport?.file_name || activePath || 'No file selected'}
                  </div>
                </div>

                {activePath && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      disabled={isProcessing}
                      onClick={() => executeMetadataAction('strip_comfyui', [activePath])}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '6px',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: 'rgba(168, 85, 247, 0.14)',
                        border: '1px solid rgba(168, 85, 247, 0.35)',
                        color: '#e9d5ff',
                      }}
                    >
                      Strip ComfyUI (This File)
                    </button>
                    <button
                      disabled={isProcessing}
                      onClick={() => executeMetadataAction('strip_exif', [activePath])}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '6px',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: 'rgba(56, 189, 248, 0.14)',
                        border: '1px solid rgba(56, 189, 248, 0.35)',
                        color: '#bae6fd',
                      }}
                    >
                      Strip EXIF (This File)
                    </button>
                  </div>
                )}
              </div>

              {/* Tab Switcher */}
              <div style={{ display: 'flex', gap: '16px' }}>
                <button
                  onClick={() => setActiveTab('comfyui')}
                  style={{
                    background: 'none',
                    border: 'none',
                    borderBottom:
                      activeTab === 'comfyui' ? '2px solid #c084fc' : '2px solid transparent',
                    padding: '8px 4px',
                    color: activeTab === 'comfyui' ? '#e9d5ff' : 'rgba(255,255,255,0.5)',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                  }}
                >
                  <Sparkles size={14} style={{ color: '#c084fc' }} />
                  <span>ComfyUI & AI Workflow JSON</span>
                  <span
                    style={{
                      padding: '1px 6px',
                      borderRadius: '999px',
                      fontSize: '10px',
                      background: 'rgba(168, 85, 247, 0.2)',
                      color: '#d8b4fe',
                    }}
                  >
                    {editableComfyEntries.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('exif')}
                  style={{
                    background: 'none',
                    border: 'none',
                    borderBottom:
                      activeTab === 'exif' ? '2px solid #38bdf8' : '2px solid transparent',
                    padding: '8px 4px',
                    color: activeTab === 'exif' ? '#bae6fd' : 'rgba(255,255,255,0.5)',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                  }}
                >
                  <Camera size={14} style={{ color: '#38bdf8' }} />
                  <span>EXIF & Standard Metadata Editor</span>
                  <span
                    style={{
                      padding: '1px 6px',
                      borderRadius: '999px',
                      fontSize: '10px',
                      background: 'rgba(56, 189, 248, 0.2)',
                      color: '#7dd3fc',
                    }}
                  >
                    {activeReport?.exif_entries.length || 0}
                  </span>
                </button>
              </div>
            </div>

            {/* TAB CONTENT AREA */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', userSelect: 'text' }}>
              {activeTab === 'comfyui' ? (
                <MetadataComfyTab
                  comfySummary={comfySummary}
                  editableComfyEntries={editableComfyEntries}
                  setEditableComfyEntries={setEditableComfyEntries}
                  activePath={activePath}
                  isProcessing={isProcessing}
                  copiedKey={copiedKey}
                  copyText={copyText}
                  onSaveComfyEdits={() =>
                    executeMetadataAction(
                      'update_metadata',
                      [activePath],
                      editableExif,
                      editableComfyEntries
                    )
                  }
                />
              ) : (
                <MetadataExifTab
                  editableExif={editableExif}
                  setEditableExif={setEditableExif}
                  checkedList={checkedList}
                  activePath={activePath}
                  isProcessing={isProcessing}
                  activeReport={activeReport}
                  onSaveExifActive={() =>
                    executeMetadataAction(
                      'update_metadata',
                      [activePath],
                      editableExif,
                      editableComfyEntries
                    )
                  }
                  onSaveExifBatch={() =>
                    executeMetadataAction('update_metadata', checkedList, editableExif)
                  }
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
