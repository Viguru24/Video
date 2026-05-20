# Utils Directory

This directory contains shared utility modules used across the Cosmo Video Symphony application.

## Files

### `videoUtils.ts`
Video-related utility functions for URL conversion and validation.

**Functions:**
- `convertToVideoUrl(video)` - Convert file paths to playable URLs using Tauri's asset protocol
- `isValidVideoExtension(path)` - Check if a file has a valid video extension
- `getFileNameFromPath(path)` - Extract filename from full path

**Usage:**
```typescript
import { convertToVideoUrl, isValidVideoExtension } from './utils/videoUtils';

const video = { url: 'video.mp4', realPath: '/path/to/video.mp4' };
const url = convertToVideoUrl(video);
// Returns: 'asset://localhost/path/to/video.mp4'

if (isValidVideoExtension('movie.mp4')) {
  // Handle video file
}
```

### `validation.ts`
Input validation utilities for user-provided data.

**Functions:**
- `validateCollectionName(name)` - Validate collection names (length, characters)
- `validateVideoPath(path)` - Check for path traversal attempts
- `validateUrl(url)` - Validate URL format
- `sanitizeText(text)` - Escape HTML to prevent XSS
- `validateSnapshotDir(path)` - Validate snapshot directory paths

**Usage:**
```typescript
import { validateCollectionName, sanitizeText } from './utils/validation';

const error = validateCollectionName('My Collection');
if (error) {
  console.error(error);
}

const safe = sanitizeText('<script>alert("xss")</script>');
// Returns: '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
```

### `errorHandler.ts`
Centralized error handling with consistent logging and user notifications.

**Types:**
- `ErrorContext` - Context where error occurred (telemetry, persistence, video_load, etc.)
- `ErrorOptions` - Options for error handling (silent, logToConsole)

**Functions:**
- `handleError(error, context, options)` - Handle errors with logging and notifications
- `isAbortError(error)` - Check if error is from AbortController
- `safeExecute(fn, context, fallback)` - Safely execute async operations

**Usage:**
```typescript
import { handleError, safeExecute } from './utils/errorHandler';

try {
  await riskyOperation();
} catch (err) {
  await handleError(err, 'video_load');
}

const result = await safeExecute(
  () => fetchData(),
  'persistence',
  defaultValue
);
```

### `constants.ts`
Application-wide constants to avoid magic numbers.

**Constants:**
- Telemetry: `TELEMETRY_INTERVAL`
- Layout: `ROW_THRESHOLD_PX`, `ROW_MATCH_THRESHOLD`, `LAYOUT_CALC_DELAY`
- Zoom: `MIN_ZOOM`, `MAX_ZOOM`
- Interaction: `SWIPE_THRESHOLD`, `DRAG_ACTIVATION_DISTANCE`
- Persistence: `PERSISTENCE_DEBOUNCE`
- Video: `FPS`, `STEP_INTERVAL`, `STEP_DELAY`
- UI: `SNAPSHOT_TOAST_DURATION`, `IMMERSIVE_HIDE_DELAY`

**Usage:**
```typescript
import { TELEMETRY_INTERVAL, MIN_ZOOM } from './constants';

setInterval(poll, TELEMETRY_INTERVAL);
if (zoom < MIN_ZOOM) zoom = MIN_ZOOM;
```

## Guidelines

### When to Add New Utilities
- Function is used in 3+ places
- Function has a single, clear responsibility
- Function is pure (no side effects) or clearly documents side effects
- Function has comprehensive JSDoc comments

### Testing
All utility functions should be:
- Pure functions when possible
- Have clear input/output types
- Include JSDoc with examples
- Covered by unit tests (when test infrastructure is added)
