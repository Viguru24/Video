# Developer Guide: Cosmo Video Symphony

This guide provides practical instructions for setting up the development environment, running the application, and generating production builds.

## 1. Prerequisites

Ensure your Windows development machine has the following installed:
- **Node.js**: v18+ (LTS recommended)
- **Rust**: 1.75+ (Install via [rustup.rs](https://rustup.rs/))
- **Windows 10/11 SDK**: Required for MSIX packaging.
- **WebView2 Runtime**: Included in modern Windows, but required for the app to render.

## 2. Setup & Installation

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```

## 3. Local Development

Start the development server with Hot Module Replacement (HMR):
```bash
npm run tauri dev
```
This launches a debug window and listens for changes in both the React frontend and Rust backend.

### Environment Reset
If you encounter port locks or zombie processes, run:
```powershell
./Elite-Reset.ps1
```

## 4. Build & Release Pipeline

The application uses a custom PowerShell-based pipeline to generate signed MSIX installers.

### Building for Production
Run the master build script from the root:
```powershell
./release/build_msix.ps1
```

**What this script does:**
1.  Cleans the `dist/` and `src-tauri/target/` folders.
2.  Compiles the React frontend (`npm run build`).
3.  Builds the MSIX bundle via Tauri (`npm run tauri:windows:build`).
4.  Renames the output to include the current version (e.g., `CosmoVideo_v2.2.0.msixbundle`).
5.  Digitally signs the package using `CosmoVideo_Store.pfx`.

## 5. Persistence & Logs

- **Persistence Path**: `%APPDATA%/com.cosmovideo.pro/persistence/`
- **Activity Logs**: `%APPDATA%/com.cosmovideo.pro/cosmo_activity.log`

## 6. Key Configuration Files

- `tauri.conf.json`: Core application settings, versioning, and window definitions.
- `package.json`: Frontend dependencies and build scripts.
- `Cargo.toml`: Rust dependencies (crates).
- `src/App.tsx`: Main UI orchestration logic.
- `src-tauri/src/main.rs`: Backend command definitions.
