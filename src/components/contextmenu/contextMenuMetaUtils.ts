import { formatDuration, toRealPath } from '../../utils/videoUtils';

export interface MediaLocationInfo {
  fullPath: string;
  folderPath: string;
  folderName: string;
  fileName: string;
}

/**
 * Extracts clean full path, containing folder path, immediate parent folder name,
 * and filename from any local disk path, Tauri asset/cosmo URL, or demo path.
 */
export function extractLocationInfo(rawPath?: string | null): MediaLocationInfo | null {
  if (!rawPath || typeof rawPath !== 'string') return null;
  const trimmed = rawPath.trim();
  if (!trimmed || trimmed.startsWith('blob:')) return null;

  let cleanPath = '';
  try {
    cleanPath = toRealPath(trimmed) ?? '';
  } catch {
    // Fallback when browser globals like localStorage are unavailable
  }

  if (!cleanPath) {
    const withoutQuery = trimmed.split('?')[0].split('#')[0];
    if (/^https?:\/\//i.test(withoutQuery)) {
      try {
        const parsed = new URL(withoutQuery);
        const segments = parsed.pathname.split('/').filter(Boolean);
        const fileName = segments.length > 0 ? decodeURIComponent(segments[segments.length - 1]) : parsed.hostname;
        const dirSegments = segments.slice(0, -1).map((s) => {
          try {
            return decodeURIComponent(s);
          } catch {
            return s;
          }
        });
        const folderPath = dirSegments.length > 0
          ? `${parsed.origin}/${dirSegments.join('/')}`
          : parsed.origin;
        const folderName = dirSegments.length > 0
          ? dirSegments[dirSegments.length - 1]
          : parsed.hostname;
        return {
          fullPath: withoutQuery,
          folderPath,
          folderName,
          fileName,
        };
      } catch {
        return null;
      }
    }

    const stripped = withoutQuery.replace(/^local:\/\//i, '');
    try {
      cleanPath = decodeURIComponent(stripped);
    } catch {
      cleanPath = stripped;
    }
  }

  cleanPath = cleanPath.replace(/\x00/g, '').trim();
  if (!cleanPath) return null;

  const isUnc = cleanPath.startsWith('\\\\') || cleanPath.startsWith('//');
  const isWindows = isUnc || /^[A-Za-z]:[/\\]/.test(cleanPath) || cleanPath.includes('\\');

  if (isWindows) {
    let normalized = cleanPath.replace(/\//g, '\\');
    if (isUnc) {
      normalized = '\\\\' + normalized.replace(/^\\+/, '').replace(/\\{2,}/g, '\\');
    } else {
      normalized = normalized.replace(/\\{2,}/g, '\\');
    }

    // Trim trailing backslash except drive root (e.g. "C:\")
    if (normalized.length > 3 && normalized.endsWith('\\')) {
      normalized = normalized.replace(/\\+$/, '');
    }

    const lastSep = normalized.lastIndexOf('\\');
    if (lastSep === -1) {
      return {
        fullPath: normalized,
        folderPath: '',
        folderName: '',
        fileName: normalized,
      };
    }

    const fileName = normalized.slice(lastSep + 1);
    const isDriveRoot = /^[A-Za-z]:\\$/.test(normalized.slice(0, lastSep + 1)) && lastSep === 2;
    const folderPath = isDriveRoot ? normalized.slice(0, 3) : normalized.slice(0, lastSep);

    let folderName = folderPath;
    if (!isDriveRoot) {
      const parentParts = folderPath.split('\\').filter(Boolean);
      folderName = parentParts[parentParts.length - 1] || folderPath;
    }

    return {
      fullPath: normalized,
      folderPath,
      folderName,
      fileName,
    };
  }

  // POSIX / relative path (e.g. "/demos/sample.mp4")
  let normalized = cleanPath.replace(/\/{2,}/g, '/');
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.replace(/\/+$/, '');
  }

  const lastSep = normalized.lastIndexOf('/');
  if (lastSep === -1) {
    return {
      fullPath: normalized,
      folderPath: '',
      folderName: '',
      fileName: normalized,
    };
  }

  const fileName = normalized.slice(lastSep + 1);
  const folderPath = lastSep === 0 ? '/' : normalized.slice(0, lastSep);
  const parentParts = folderPath.split('/').filter(Boolean);
  const folderName = parentParts[parentParts.length - 1] || '/';

  return {
    fullPath: normalized,
    folderPath,
    folderName,
    fileName,
  };
}

export function formatAspectRatioLabel(width?: number | null, height?: number | null): string | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  const r = width / height;
  if (Math.abs(r - 16 / 9) < 0.05) return '16:9 (Widescreen)';
  if (Math.abs(r - 4 / 3) < 0.05) return '4:3 (Standard)';
  if (Math.abs(r - 1) < 0.05) return '1:1 (Square)';
  if (Math.abs(r - 9 / 16) < 0.05) return '9:16 (Vertical)';
  return `${r.toFixed(2)}:1`;
}

export function formatMegapixels(width?: number | null, height?: number | null): string | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  return `${((width * height) / 1_000_000).toFixed(2)} Megapixels`;
}

export function formatPlayTime(duration?: number | string | null): string | null {
  if (duration === undefined || duration === null || duration === '' || duration === 'Static') {
    return null;
  }
  if (typeof duration === 'string') {
    const trimmed = duration.trim();
    if (/^\d+:\d{2}(:\d{2})?$/.test(trimmed)) {
      return trimmed;
    }
  }
  const seconds = Number(duration);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  return formatDuration(seconds);
}
