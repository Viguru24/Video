/**
 * Validation utilities for Cosmo Video Symphony
 */

/**
 * Validate collection name
 * Ensures collection names meet requirements for display and storage
 * 
 * @param name - Collection name to validate
 * @returns Error message if invalid, null if valid
 * 
 * @example
 * validateCollectionName('My Videos'); // null
 * validateCollectionName(''); // 'Collection name cannot be empty'
 */
export function validateCollectionName(name: string): string | null {
  if (!name || !name.trim()) {
    return 'Collection name cannot be empty';
  }
  if (name.length > 50) {
    return 'Collection name too long (max 50 characters)';
  }
  if (/[<>"]/.test(name)) {
    return 'Collection name contains invalid characters';
  }
  return null;
}

/**
 * Validate video file path
 * @param path - File path to validate
 * @returns true if valid video file path
 */
export function validateVideoPath(path: string): boolean {
  if (!path || typeof path !== 'string') {
    return false;
  }
  // Check for path traversal attempts
  if (path.includes('..') || path.includes('~')) {
    return false;
  }
  return true;
}

/**
 * Validate URL
 * @param url - URL to validate
 * @returns true if valid URL
 */
export function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize text for display (prevent XSS)
 * @param text - Text to sanitize
 * @returns Sanitized text
 */
export function sanitizeText(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Validate snapshot directory path
 * @param path - Directory path to validate
 * @returns Error message if invalid, null if valid
 */
export function validateSnapshotDir(path: string): string | null {
  if (!path || !path.trim()) {
    return 'Snapshot directory is required';
  }
  if (path.includes('..')) {
    return 'Invalid directory path';
  }
  return null;
}