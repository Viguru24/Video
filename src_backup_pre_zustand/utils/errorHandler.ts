/**
 * Centralized error handling for Cosmo Video Symphony
 */

import { invoke } from '@tauri-apps/api/core';

export type ErrorContext = 
  | 'telemetry'
  | 'persistence'
  | 'video_load'
  | 'snapshot'
  | 'folder_ingest'
  | 'ui'
  | 'unknown';

export interface ErrorOptions {
  context?: ErrorContext;
  silent?: boolean;
  logToConsole?: boolean;
}

/**
 * Handle errors consistently across the application
 * @param error - The error to handle
 * @param context - Context where error occurred
 * @param options - Handling options
 * 
 * @example
 * try {
 *   await riskyOperation();
 * } catch (err) {
 *   await handleError(err, 'video_load');
 * }
 */
export async function handleError(
  error: unknown, 
  context: ErrorContext = 'unknown',
  options: ErrorOptions = {}
): Promise<void> {
  const { silent = false, logToConsole = true } = options;
  
  const errorMessage = error instanceof Error 
    ? error.message 
    : typeof error === 'string' 
      ? error 
      : 'Unknown error';
  
  const errorStack = error instanceof Error ? error.stack : undefined;
  
  // Log to console if enabled
  if (logToConsole) {
    console.error(`[${context.toUpperCase()}] ${errorMessage}`, errorStack || '');
  }
  
  // Log to telemetry file
  try {
    await invoke('cosmo_log', { 
      msg: `ERROR [${context}]: ${errorMessage}` 
    }).catch(() => {}); // Don't throw if logging fails
  } catch {
    // Ignore logging errors
  }
  
  // Show user notification for critical errors (unless silent)
  if (!silent && isCriticalError(context)) {
    // Could dispatch to a notification system here
    console.warn(`Critical error in ${context}: ${errorMessage}`);
  }
}

/**
 * Determine if an error context is critical
 */
function isCriticalError(context: ErrorContext): boolean {
  const criticalContexts: ErrorContext[] = [
    'telemetry',
    'persistence',
    'video_load'
  ];
  return criticalContexts.includes(context);
}

/**
 * Check if error is an abort error (from AbortController)
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * Safely execute async operation with error handling
 */
export async function safeExecute<T>(
  fn: () => Promise<T>,
  context: ErrorContext,
  fallback?: T
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    await handleError(error, context, { logToConsole: true });
    return fallback;
  }
}