import { X, Scissors, Share2 } from 'lucide-react';
import type { VideoItem } from '../../types';
import { useStore } from '../../store/useStore';
import { TrimCropToolbar } from './trimcrop/TrimCropToolbar';
import { formatTime } from './trimcrop/trimCropUtils';
import { TrimCropTimeline } from './trimcrop/TrimCropTimeline';
import { CropOverlayBox } from './trimcrop/CropOverlayBox';
import { TrimCropFooter } from './trimcrop/TrimCropFooter';
import { useTrimCropStudio } from './trimcrop/useTrimCropStudio';

interface VideoTrimCropModalProps {
  target: VideoItem | null;
  onClose: () => void;
  onSuccess: (newPath: string, isOverwrite: boolean, targetId?: string) => void;
  addLog: (msg: string) => void;
}

export function VideoTrimCropModal(props: VideoTrimCropModalProps) {
  if (!props.target) return null;
  return <VideoTrimCropModalContent key={props.target.id} {...props} target={props.target} />;
}

interface VideoTrimCropModalContentProps extends Omit<VideoTrimCropModalProps, 'target'> {
  target: VideoItem;
}

function VideoTrimCropModalContent({
  target,
  onClose,
  onSuccess,
  addLog,
}: VideoTrimCropModalContentProps) {
  const {
    videoRef,
    containerRef,
    viewportRef,
    timelineRef,
    mediaSrc,
    isPlaying,
    currentTime,
    duration,
    isMuted,
    setIsMuted,
    playbackRate,
    nativeDim,
    startTime,
    endTime,
    loopSelection,
    setLoopSelection,
    zoomScale,
    setZoomScale,
    panOffset,
    setPanOffset,
    isPanningViewport,
    enableCrop,
    setEnableCrop,
    aspectRatio,
    cropBox,
    isDraggingTimeline,
    hoverTime,
    setHoverTime,
    hoverPos,
    setHoverPos,
    isProcessing,
    processingMsg,
    errorMessage,
    trimDuration,
    croppedPixelW,
    croppedPixelH,
    isLossless,
    handleLoadedMetadata,
    handleTimeUpdate,
    togglePlay,
    seekTo,
    stepFrame,
    setInPoint,
    setOutPoint,
    jumpToIn,
    jumpToOut,
    resetTrim,
    resetCrop,
    centerCropBox,
    applyAspectRatio,
    cyclePlaybackRate,
    handleWheelZoom,
    handleViewportMouseDown,
    handleTimelineMouseDown,
    handleCropMouseDown,
    handleExport,
  } = useTrimCropStudio({ target, onClose, onSuccess, addLog });

  return (
    <div
      className="modal-backdrop active"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 5, 7, 0.88)',
        backdropFilter: 'blur(28px) saturate(180%)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
        overflowY: 'auto',
        animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isProcessing) onClose();
      }}
    >
      <div
        className="trim-crop-studio-container"
        style={{
          background:
            'linear-gradient(180deg, rgba(24, 24, 29, 0.97) 0%, rgba(12, 12, 15, 0.99) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '1180px',
          maxHeight: 'calc(100vh - 24px)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow:
            '0 32px 80px rgba(0, 0, 0, 0.85), 0 0 1px 1px rgba(255, 255, 255, 0.1), 0 0 45px rgba(0, 255, 136, 0.12)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Ambient Top Glow Line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '15%',
            right: '15%',
            height: '2px',
            background:
              'linear-gradient(90deg, transparent 0%, var(--accent, #00ff88) 50%, transparent 100%)',
            opacity: 0.8,
            pointerEvents: 'none',
          }}
        />

        {/* Header Bar */}
        <div
          style={{
            padding: '10px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background:
                  'linear-gradient(135deg, rgba(0, 255, 136, 0.25) 0%, rgba(0, 229, 255, 0.15) 100%)',
                border: '1px solid rgba(0, 255, 136, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent, #00ff88)',
                boxShadow: '0 0 15px rgba(0, 255, 136, 0.2)',
              }}
            >
              <Scissors size={18} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '15px',
                    fontWeight: 800,
                    color: '#fff',
                    letterSpacing: '0.6px',
                    textTransform: 'uppercase',
                  }}
                >
                  Trim, Crop & Pan Studio
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: '12px',
                    background: isLossless
                      ? 'rgba(0, 255, 136, 0.15)'
                      : 'rgba(0, 229, 255, 0.15)',
                    color: isLossless ? 'var(--accent, #00ff88)' : '#00e5ff',
                    border: `1px solid ${isLossless ? 'rgba(0, 255, 136, 0.3)' : 'rgba(0, 229, 255, 0.3)'}`,
                  }}
                >
                  {isLossless ? '⚡ Lossless Stream Cut' : '🎨 Re-encode Render'}
                </span>
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: 'rgba(255, 255, 255, 0.5)',
                  marginTop: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span
                  style={{
                    color: '#fff',
                    fontWeight: 600,
                    maxWidth: '320px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {target.title}
                </span>
                <span>•</span>
                <span>
                  {nativeDim.width} × {nativeDim.height}
                </span>
                <span>•</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => useStore.getState().setWhatsAppShareTarget(target)}
              title="Share"
              style={{
                background: 'rgba(0, 255, 136, 0.12)',
                border: '1px solid rgba(0, 255, 136, 0.35)',
                color: 'var(--accent, #00ff88)',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0, 255, 136, 0.22)';
                e.currentTarget.style.borderColor = 'var(--accent, #00ff88)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0, 255, 136, 0.12)';
                e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.35)';
              }}
            >
              <Share2 size={14} />
              <span>Share</span>
            </button>

            <button
              onClick={onClose}
              disabled={isProcessing}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: 'rgba(255, 255, 255, 0.7)',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#fff';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                e.currentTarget.style.transform = 'scale(1.08) rotate(90deg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Viewport Stage */}
        <div
          ref={viewportRef}
          onWheel={handleWheelZoom}
          onMouseDown={handleViewportMouseDown}
          style={{
            display: 'flex',
            flex: '1 1 auto',
            minHeight: '140px',
            maxHeight: 'min(50vh, calc(100vh - 360px))',
            background: 'radial-gradient(circle at 50% 50%, #141418 0%, #060608 100%)',
            position: 'relative',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            cursor: zoomScale > 1 ? (isPanningViewport ? 'grabbing' : 'grab') : 'default',
            userSelect: 'none',
            padding: '8px',
          }}
        >
          {/* Subtle Grid Background */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage:
                'radial-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 0)',
              backgroundSize: '24px 24px',
              pointerEvents: 'none',
              opacity: 0.5,
            }}
          />

          {/* Floating Zoom Indicator & Reset View Badge */}
          {zoomScale > 1 && (
            <div
              style={{
                position: 'absolute',
                top: '12px',
                right: '16px',
                background: 'rgba(0, 0, 0, 0.75)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '20px',
                padding: '4px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                zIndex: 30,
                boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
              }}
            >
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--accent, #00ff88)',
                }}
              >
                {Math.round(zoomScale * 100)}% Zoom
              </span>
              <button
                onClick={() => {
                  setZoomScale(1);
                  setPanOffset({ x: 0, y: 0 });
                }}
                style={{
                  background: 'rgba(255, 255, 255, 0.12)',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '10px',
                  padding: '2px 6px',
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Reset Fit
              </button>
            </div>
          )}

          {/* Video Container */}
          <div
            ref={containerRef}
            style={{
              position: 'relative',
              maxWidth: '100%',
              maxHeight: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'visible',
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
              transition: isPanningViewport
                ? 'none'
                : 'transform 0.12s cubic-bezier(0.16, 1, 0.3, 1)',
              transformOrigin: 'center center',
            }}
          >
            <video
              ref={videoRef}
              src={mediaSrc}
              muted={isMuted}
              playsInline
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onClick={togglePlay}
              style={{
                maxWidth: '100%',
                maxHeight: 'min(46vh, calc(100vh - 380px))',
                height: 'auto',
                width: 'auto',
                display: 'block',
                borderRadius: '6px',
                cursor: 'pointer',
                boxShadow: '0 12px 40px rgba(0, 0, 0, 0.8)',
              }}
            />

            {enableCrop && (
              <CropOverlayBox
                cropBox={cropBox}
                croppedPixelW={croppedPixelW}
                croppedPixelH={croppedPixelH}
                aspectRatio={aspectRatio}
                centerCropBox={centerCropBox}
                handleCropMouseDown={handleCropMouseDown}
              />
            )}
          </div>
        </div>

        <TrimCropToolbar
          enableCrop={enableCrop}
          setEnableCrop={setEnableCrop}
          aspectRatio={aspectRatio}
          applyAspectRatio={applyAspectRatio}
          centerCropBox={centerCropBox}
          resetCrop={resetCrop}
          zoomScale={zoomScale}
          setZoomScale={setZoomScale}
          setPanOffset={setPanOffset}
          playbackRate={playbackRate}
          cyclePlaybackRate={cyclePlaybackRate}
          isMuted={isMuted}
          setIsMuted={setIsMuted}
        />

        <TrimCropTimeline
          timelineRef={timelineRef}
          startTime={startTime}
          endTime={endTime}
          currentTime={currentTime}
          duration={duration}
          trimDuration={trimDuration}
          hoverTime={hoverTime}
          hoverPos={hoverPos}
          setHoverTime={setHoverTime}
          setHoverPos={setHoverPos}
          isDraggingTimeline={isDraggingTimeline}
          handleTimelineMouseDown={handleTimelineMouseDown}
          seekTo={seekTo}
          jumpToIn={jumpToIn}
          jumpToOut={jumpToOut}
          stepFrame={stepFrame}
          togglePlay={togglePlay}
          isPlaying={isPlaying}
          loopSelection={loopSelection}
          setLoopSelection={setLoopSelection}
          setInPoint={setInPoint}
          setOutPoint={setOutPoint}
          resetTrim={resetTrim}
        />

        <TrimCropFooter
          target={target}
          errorMessage={errorMessage}
          isProcessing={isProcessing}
          processingMsg={processingMsg}
          onClose={onClose}
          onExport={handleExport}
        />
      </div>
    </div>
  );
}
