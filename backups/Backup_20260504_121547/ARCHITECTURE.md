# Architecture: Cosmo Video Symphony

Cosmo Video Symphony is a high-performance, multi-video workspace built on the **Tauri v2** framework. It leverages a hybrid architecture combining a high-fidelity React frontend with a secure, low-overhead Rust backend.

## 1. System Overview

The application follows a standard Tauri architectural pattern:
- **Core (Backend)**: Written in Rust, handles system-level operations (telemetry, filesystem, persistence).
- **Webview (Frontend)**: React + Vite + TypeScript, handles UI orchestration, user interactions, and video rendering.
- **Inter-Process Communication (IPC)**: Secured via Tauri's "Invoke" system with strict capability definitions.

## 2. Frontend Architecture (Webview)

The frontend is a Single Page Application (SPA) optimized for high-density media management.

### Key Technologies
- **React 18**: Component-based UI logic.
- **Framer Motion**: Smooth glassmorphic transitions and animations.
- **@dnd-kit**: Drag-and-drop orchestration for the video grid.
- **Lucide React**: Unified iconography.

### State Orchestration
- **Symphony Orchestrator**: A global state management pattern within `App.tsx` that synchronizes playback, mute states, and auto-rotation across all active video units.
- **Dynamic Grid**: Implements row-based calculations to support auto-rotation cycles.

## 3. Backend Architecture (Core)

The Rust backend serves as the "Symphony Controller," providing the hardware-level telemetry and secure data access.

### Critical Components
- **Telemetry Engine**: Uses the `sysinfo` crate to poll CPU/Memory usage and expose it to the frontend via the `get_telemetry` command.
- **Persistence Layer**: Implements a lightweight JSON-based storage system. Data is persisted to `%APPDATA%/com.cosmovideo.pro/persistence/`.
- **Media Engine**: Handles folder scanning and file discovery using asynchronous blocking tasks to keep the UI thread fluid.

### Commands List
- `get_telemetry`: Real-time hardware stats.
- `save_persistence` / `load_persistence`: Local state recovery.
- `select_folder_cmd` / `get_folder_videos`: Media ingestion.
- `save_snapshot`: Base64 frame capture to disk.

## 4. Security & Permissions

Cosmo Video Symphony operates under a strict "Least Privilege" model:
- **Capabilities**: Defined in `src-tauri/capabilities/default.json`.
- **Filesystem Access**: Limited to the application's data directory and user-selected media folders.
- **Shell Access**: Restricted to specific safe commands (e.g., opening File Explorer).

## 5. Data Flow

1. **Boot**: UI initializes and requests persisted state via `load_persistence`.
2. **Ingestion**: User selects a folder -> Rust scans for video files -> Metadata is passed to React.
3. **Orchestration**: Global controls trigger state updates -> Components re-render or perform HMR-like updates.
4. **Shutdown**: App state is serialized and saved via `save_persistence`.
