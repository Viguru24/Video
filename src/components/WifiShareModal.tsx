import React from 'react';
import {
  FolderOpen,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Smartphone
} from 'lucide-react';
import { PhoneUploadsTab } from './wifishare/PhoneUploadsTab';
import { PcFilesTab } from './wifishare/PcFilesTab';
import { WifiShareConnectionCard, WifiShareHeader } from './wifishare/WifiShareHeaderCard';
import { useWifiShareRoom } from './wifishare/useWifiShareRoom';

interface WifiShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  setWifiShareItems?: React.Dispatch<React.SetStateAction<any[]>>;
  onClearSharedFiles?: () => void;
  onLog: (m: string) => void;
  onAddMultipleFiles: (paths: string[]) => void;
}

export function WifiShareModal({
  isOpen,
  onClose,
  setWifiShareItems,
  onClearSharedFiles,
  onLog,
  onAddMultipleFiles
}: WifiShareModalProps) {
  const room = useWifiShareRoom({
    isOpen,
    onClose,
    setWifiShareItems,
    onClearSharedFiles,
    onLog,
    onAddMultipleFiles
  });

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999999,
        padding: '16px'
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, rgba(24, 24, 29, 0.98) 0%, rgba(12, 12, 15, 0.99) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '470px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 70px rgba(0, 0, 0, 0.9), 0 0 30px rgba(0, 210, 255, 0.08)',
          position: 'relative',
          color: '#ffffff',
          fontFamily: 'sans-serif',
          overflow: 'hidden'
        }}
      >
        <WifiShareHeader receiverConnected={room.receiverConnected} onClose={onClose} />

        <div style={{ padding: '12px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {room.loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '160px', gap: '8px' }}>
              <RefreshCw size={22} className="spin" style={{ color: '#00d2ff' }} />
              <span style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.6)' }}>Initializing Wi-Fi connection...</span>
            </div>
          ) : room.error ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '160px', gap: '8px', textAlign: 'center' }}>
              <ShieldCheck size={28} style={{ color: '#ff4d4d' }} />
              <p style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.7)', maxWidth: '280px', margin: 0 }}>{room.error}</p>
            </div>
          ) : (
            <>
              <WifiShareConnectionCard
                qrDataUrl={room.qrDataUrl}
                shareUrl={room.shareUrl}
                pairingToken={room.pairingToken}
                copied={room.copied}
                tokenCopied={room.tokenCopied}
                onCopyLink={room.handleCopyLink}
                onCopyToken={room.handleCopyToken}
              />

              {/* Segmented Control Tabs */}
              <div style={{
                display: 'flex',
                background: 'rgba(0, 0, 0, 0.45)',
                padding: '2px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                gap: '2px'
              }}>
                <button
                  onClick={() => room.setActiveTab('phone')}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: room.activeTab === 'phone'
                      ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.2) 0%, rgba(0, 200, 110, 0.12) 100%)'
                      : 'transparent',
                    color: room.activeTab === 'phone' ? '#00ff88' : 'rgba(255, 255, 255, 0.5)',
                    boxShadow: room.activeTab === 'phone' ? '0 2px 6px rgba(0, 255, 136, 0.15), inset 0 0 0 1px rgba(0, 255, 136, 0.3)' : 'none',
                    fontSize: '10.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Smartphone size={12} />
                  <span>Phone Uploads</span>
                  <span style={{
                    fontSize: '8.5px',
                    padding: '0.5px 5px',
                    borderRadius: '8px',
                    background: room.activeTab === 'phone' ? 'rgba(0, 255, 136, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                    color: room.activeTab === 'phone' ? '#00ff88' : 'rgba(255, 255, 255, 0.6)',
                    fontWeight: 800
                  }}>
                    {room.phoneFiles.length}
                  </span>
                </button>

                <button
                  onClick={() => room.setActiveTab('pc')}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: room.activeTab === 'pc'
                      ? 'linear-gradient(135deg, rgba(0, 210, 255, 0.2) 0%, rgba(0, 150, 255, 0.12) 100%)'
                      : 'transparent',
                    color: room.activeTab === 'pc' ? '#00d2ff' : 'rgba(255, 255, 255, 0.5)',
                    boxShadow: room.activeTab === 'pc' ? '0 2px 6px rgba(0, 210, 255, 0.15), inset 0 0 0 1px rgba(0, 210, 255, 0.3)' : 'none',
                    fontSize: '10.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Monitor size={12} />
                  <span>Shared from PC</span>
                  <span style={{
                    fontSize: '8.5px',
                    padding: '0.5px 5px',
                    borderRadius: '8px',
                    background: room.activeTab === 'pc' ? 'rgba(0, 210, 255, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                    color: room.activeTab === 'pc' ? '#00d2ff' : 'rgba(255, 255, 255, 0.6)',
                    fontWeight: 800
                  }}>
                    {room.pcFiles.length}
                  </span>
                </button>
              </div>

              {room.activeTab === 'phone' && (
                <PhoneUploadsTab
                  phoneFiles={room.phoneFiles}
                  isImportingAll={room.isImportingAll}
                  importProgress={room.importProgress}
                  importError={room.importError}
                  importingFileIds={room.importingFileIds}
                  deletingFileIds={room.deletingFileIds}
                  onImportAll={room.handleImportAll}
                  onClearAll={() => room.handleClearAllSide(true)}
                  onDismissError={() => room.setImportError(null)}
                  onImportSingle={(id, name) => room.handleImportUploaded(id, name)}
                  onDeleteFile={(id, name) => room.handleDeleteRoomFile(id, name, true)}
                />
              )}

              {room.activeTab === 'pc' && (
                <PcFilesTab
                  pcFiles={room.pcFiles}
                  deletingFileIds={room.deletingFileIds}
                  onClearAll={() => room.handleClearAllSide(false)}
                  onDeleteFile={(id, name) => room.handleDeleteRoomFile(id, name, false)}
                />
              )}

              {/* Bottom Settings Bar */}
              <div style={{
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.07)',
                borderRadius: '8px',
                padding: '5px 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '9px', color: 'rgba(255,255,255,0.7)', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={room.autoRemoveAfterImport}
                      onChange={room.toggleAutoRemove}
                      style={{ accentColor: '#00ff88', cursor: 'pointer', width: '12px', height: '12px' }}
                    />
                    <span>Auto-remove</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '9px', color: 'rgba(255,255,255,0.7)', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={room.addToGrid}
                      onChange={room.toggleAddToGrid}
                      style={{ accentColor: '#00ff88', cursor: 'pointer', width: '12px', height: '12px' }}
                    />
                    <span>Add to Grid</span>
                  </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '8.5px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontWeight: 800 }}>
                    Save:
                  </span>
                  <span
                    style={{
                      fontSize: '9px',
                      color: room.customDownloadDir ? '#00d2ff' : 'rgba(255, 255, 255, 0.7)',
                      maxWidth: '120px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                    title={room.customDownloadDir || 'Default Downloads folder'}
                  >
                    {room.customDownloadDir ? room.customDownloadDir.split(/[\\/]/).pop() || room.customDownloadDir : 'Downloads'}
                  </span>
                  <button
                    onClick={room.selectDownloadDir}
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#ffffff',
                      borderRadius: '4px',
                      padding: '2px 5px',
                      fontSize: '8.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px'
                    }}
                    title="Change destination folder"
                  >
                    <FolderOpen size={8} />
                    <span>Change</span>
                  </button>
                  {room.customDownloadDir && (
                    <button
                      onClick={room.resetDownloadDir}
                      style={{
                        background: 'rgba(255, 77, 77, 0.1)',
                        border: '1px solid rgba(255, 77, 77, 0.25)',
                        color: '#ff6666',
                        borderRadius: '4px',
                        padding: '2px 6px',
                        fontSize: '9px',
                        cursor: 'pointer'
                      }}
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
