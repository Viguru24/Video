# Technical Documentation: Native Ingestion & Drag-and-Drop

This document outlines the complete implementation and configuration of the **Drag-and-Drop (DnD) system** in Cosmo Video Symphony. This architecture ensures that video assets and folders can be seamlessly ingested from the Windows File Explorer into the multi-video workspace.

---

## 1. Core Architecture
The system uses a hybrid approach leveraging **Tauri v2 Native Event Listeners** and **Rust-based Filesystem Scanning**.

### A. The Backend (Rust)
The Rust core provides two critical commands for ingestion defined in `src-tauri/src/main.rs`:
- `select_folder_cmd`: Invokes the native OS dialog.
- `get_folder_videos`: Performs an asynchronous recursive scan of a directory to identify video assets (MP4, MKV, MOV, etc.) while keeping the UI thread fluid.

### B. The Frontend (React/Tauri API)
The primary listener is established in `src/App.tsx` using the `@tauri-apps/api/window` `listen` API.

---

## 2. Setup & Configuration

### I. Tauri Capabilities (Security)
To allow the app to intercept files and read from the disk, the following permissions must be enabled in `src-tauri/capabilities/default.json`:

```json
{
  "permissions": [
    "fs:read-all",
    "fs:write-all",
    "dialog:allow-open",
    "opener:allow-open-path"
  ]
}
```

### II. Event Listener Implementation
The application listens for three primary native events:
1. `tauri://drag-enter`: Triggers the visual "Drop Videos Here" overlay.
2. `tauri://drag-leave`: Dismisses the overlay.
3. `tauri://drag-drop`: The payload containing an array of absolute file paths.

#### Code Reference (App.tsx):
```typescript
unlistenDrop = await win.listen('tauri://drag-drop', async (event: any) => {
  setDragFile(false);
  const paths = event.payload.paths; // Array of dropped paths
  
  // Logic Flow:
  // 1. Check if path is a folder -> If yes, invoke 'get_folder_videos'
  // 2. Check if path is a video file -> Verify extension (mp4, webm, etc.)
  // 3. Convert path to Webview URL via 'convertFileSrc'
  // 4. Update global 'videos' state
});
```

---

## 3. Critical Fixes & Hardening
To prevent "Asset Vanishing" or "Unit Crash" bugs, the following rules must be maintained:

1. **Protocol Sanitization**: Use `convertFileSrc(path)` for all local assets. This maps them to the `http://asset.localhost` origin, bypassing CORS security blocks.
2. **Native Event Suppression**: Browser default drag-and-drop behavior must be suppressed in `App.tsx` to allow Tauri's native events to take precedence:
   ```javascript
   const stopDefaults = (e) => e.preventDefault();
   window.addEventListener('dragover', stopDefaults);
   window.addEventListener('drop', stopDefaults);
   ```
3. **Reference Integrity**: Ensure that all video components (`VideoCard.tsx`) correctly initialize their `videoRef` hooks. Using an undefined `ref` variable will cause a global unit crash.

---

## 4. Supported Formats
The system strictly supports the following video extensions for ingestion:
`mp4`, `webm`, `mkv`, `mov`, `m4v`, `avi`, `flv`, `wmv`, `asf`.

---

## 5. Maintenance & Troubleshooting
- **If files vanish**: Check the `tauri.conf.json` for security scope violations.
- **If units crash**: Verify that `VideoCard.tsx` is not using the legacy `ref` variable name. It must always be `videoRef`.

> [!IMPORTANT]
> **Why it "Fucked Up" (Post-Mortem):**
> The recent crash was caused by a variable naming regression in `VideoCard.tsx`. While hardening the UI, a logic block was updated to use a variable named `ref` instead of the properly defined `videoRef`. This caused the entire grid to fail during the React render cycle. It has now been corrected and hardened.
