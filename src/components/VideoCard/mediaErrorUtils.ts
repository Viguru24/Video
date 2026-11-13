export type MediaErrorKind =
  | 'file-missing'
  | 'drive-offline'
  | 'decode-error'
  | 'network-error';

export interface MediaLoadErrorInfo {
  kind: MediaErrorKind;
  code: string;
  headline: string;
  detail: string;
  fileName: string;
  filePath?: string;
  driveRoot?: string;
}

export interface DrivePathStatus {
  exists: boolean;
  drive_root: string;
  drive_accessible: boolean;
}

/**
 * Extracts a clean display filename and directory from a disk path or fallback title.
 */
export function splitPathForDisplay(
  rawPath: string | null | undefined,
  fallbackTitle?: string
): { fileName: string; parentDir: string; fullPath?: string } {
  const cleaned = (rawPath || '').trim();
  if (!cleaned) {
    return {
      fileName: fallbackTitle || 'Untitled media',
      parentDir: '',
      fullPath: undefined,
    };
  }

  const parts = cleaned.split(/[/\\]+/).filter(Boolean);
  const fileName = parts.length > 0 ? parts[parts.length - 1] : fallbackTitle || cleaned;
  const normalizedSlash = cleaned.includes('\\') ? '\\' : '/';
  const lastSepIdx = Math.max(cleaned.lastIndexOf('\\'), cleaned.lastIndexOf('/'));
  const parentDir = lastSepIdx > 0 ? cleaned.slice(0, lastSepIdx) : '';

  return {
    fileName,
    parentDir: parentDir || (cleaned.endsWith(normalizedSlash) ? cleaned : ''),
    fullPath: cleaned,
  };
}

/**
 * Maps a Rust `check_path_drive_status` response into a structured UI error description.
 */
export function classifyLocalMediaFailure(
  status: DrivePathStatus,
  rawPath: string,
  title?: string
): MediaLoadErrorInfo {
  const { fileName, fullPath } = splitPathForDisplay(rawPath, title);

  if (!status.drive_accessible && status.drive_root) {
    return {
      kind: 'drive-offline',
      code: `DRIVE ${status.drive_root} OFFLINE`,
      headline: 'Drive Disconnected',
      detail: `Reconnect ${status.drive_root} then retry`,
      fileName,
      filePath: fullPath,
      driveRoot: status.drive_root,
    };
  }

  if (!status.exists) {
    return {
      kind: 'file-missing',
      code: 'FILE MISSING',
      headline: 'File Not Found',
      detail: 'Moved, renamed, or deleted on disk',
      fileName,
      filePath: fullPath,
    };
  }

  return {
    kind: 'decode-error',
    code: 'CANNOT DECODE',
    headline: 'Preview Failed',
    detail: 'File exists on disk, but format failed to load',
    fileName,
    filePath: fullPath,
  };
}

/**
 * Maps a non-local or network media failure into a structured UI error description.
 */
export function classifyNonLocalMediaFailure(
  title?: string,
  url?: string
): MediaLoadErrorInfo {
  const { fileName, fullPath } = splitPathForDisplay(url, title);
  return {
    kind: 'network-error',
    code: 'LOAD FAILED',
    headline: 'Media Unavailable',
    detail: 'Source stream or asset could not be loaded',
    fileName: title || fileName,
    filePath: fullPath,
  };
}

/**
 * Builds an alternate Tauri local-file URL (`cosmo.localhost` vs `convertFileSrc`) for retry attempts.
 */
export function buildFallbackMediaUrl(
  rawPath: string,
  useCosmoProtocol: boolean,
  cacheBuster: number,
  convertAssetSrc: (path: string) => string
): string {
  if (useCosmoProtocol) {
    return `http://cosmo.localhost/${encodeURIComponent(rawPath)}?t=${cacheBuster}`;
  }
  const assetUrl = convertAssetSrc(rawPath);
  const sep = assetUrl.includes('?') ? '&' : '?';
  return `${assetUrl}${sep}t=${cacheBuster}`;
}

/**
 * Only `.temp.mp4` and yt-dlp `.f<id>.<ext>` intermediate filenames can be auto-resolved
 * by the custom `cosmo://` backend handler when the original filename no longer exists.
 */
export function shouldTryTempVideoFallback(rawPath: string | null | undefined): boolean {
  if (!rawPath) return false;
  return /\.temp\.mp4$/i.test(rawPath) || /\.f[\da-z-]+\.[^./\\]+$/i.test(rawPath);
}
