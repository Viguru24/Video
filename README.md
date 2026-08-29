<div align="center">

# 🌌 Cosmo Symphony

**The Ultimate GPU-Accelerated Multi-Media Orchestrator & AI Creative Studio for Windows**

[![Windows](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/Viguru24/Video/releases)
[![MSIX](https://img.shields.io/badge/Package-MSIX%20Bundle-00a4ef?style=for-the-badge&logo=microsoft&logoColor=white)](https://github.com/Viguru24/Video/releases)
[![Rust](https://img.shields.io/badge/Core-Rust%20%2B%20Tauri%20v2-dea584?style=for-the-badge&logo=rust&logoColor=white)](https://tauri.app)
[![React](https://img.shields.io/badge/Frontend-React%20%2B%20TypeScript-61dafb?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org)
[![Local First](https://img.shields.io/badge/Privacy-100%25%20Local%20Sovereignty-00ff88?style=for-the-badge&logo=shield&logoColor=black)](https://github.com/Viguru24/Video)

<br/>

**Cosmo Symphony** is a high-performance, hardware-accelerated media workspace designed for creators, editors, collectors, and power users. Built on a blazing-fast **Rust (Tauri v2)** backend and dynamic **React 18 + Framer Motion** glassmorphic interface, it orchestrates dozens of 4K/8K videos, high-resolution RAW photos, audio tracks, and live web streams concurrently with zero cloud dependency.

---

</div>

## ✨ Key Highlights & Features

### 🎬 1. Hyper-Density Multi-Media Mosaic Wall
* **Unified Symphony Orchestration**: Master Play, Pause, Mute, Volume, and Speed control across all active media cards simultaneously.
* **Fluid Drag-and-Drop Grid**: Dynamic column density scaling (1 to 16 columns) powered by `@dnd-kit` with silky spring animations.
* **Instant Free Show & Slideshow Mode**: Continuous full-screen showcase with intelligent resume memory and Ken Burns pan-zoom motion.

### 🤖 2. On-Device Local AI Studio (Zero Cloud)
* **⚡ 4x AI Super-Resolution Upscaling**: Restore low-res clips and images to crisp 4K/8K using local DirectML/CUDA neural weights.
* **✨ AI Portrait Bokeh & Depth Blur**: Automatic depth map generation and subject masking with customizable aperture, focal point, and feathered bokeh.
* **✂️ 1-Click AI Instant Subject Cutout**: Hold on any image to extract clean transparent PNG stickers with automatic adjacent comparison placement.

### 🖼️ 3. Artisanal Hardwood Frame Studio
* **Procedural 4-Plank Mitered Molding**: Authentic 45° corner joinery, directional natural grain fibers, gold inner fillet, and physical ambient drop shadow.
* **Resolution-Independent Dynamic Scaling**: Perfect border proportions whether framing 720p thumbnails or 48MP camera photos.
* **Non-Destructive Dual Export**: Save as an adjacent comparison copy or overwrite in place.

### 📱 4. Instant Wi-Fi Phone Transfer (AirDrop for PC)
* **Zero-Config Mobile Sync**: Scan an animated QR code to instantly share, stream, and download files bidirectionally between Windows and iOS/Android devices on local Wi-Fi.
* **Native Companion APK**: Included `CosmoShare.apk` for seamless background downloads on Android.
* **Batch ZIP & Direct Streaming**: Download single files or full albums with one tap.

### 🖥️ 5. Multi-Monitor Detached Popout Players
* **Detached Native Windows**: Pop out any video or image into a dedicated floating window with Picture-in-Picture and Always-On-Top modes.
* **Independent Zoom & Pan**: Pinch-to-zoom up to 800% with real-time HUD and 1-click `1:1` reset.

### 🛡️ 6. Hardware-Aware Secure Deletion
* **Direct NVMe/SSD Block Trim**: Detects solid-state media and executes kernel-level `FSCTL_FILE_LEVEL_TRIM` to protect drive endurance.
* **3-Pass Cryptographic Wipe for HDDs**: DoD 5220.22-M compliant overwriting (Zero, 0xFF, Random) before file truncation.

---

## ⌨️ Master Keyboard Shortcuts Reference

| Shortcut | Function | Description |
|---|---|---|
| <kbd>Space</kbd> or <kbd>K</kbd> | **Play / Pause** | Toggle master playback or current focused video |
| <kbd>+</kbd> or <kbd>=</kbd> | **Volume Up** | Increase audio volume by +5% |
| <kbd>-</kbd> or <kbd>_</kbd> | **Volume Down** | Decrease audio volume by -5% |
| <kbd>]</kbd> or <kbd>&gt;</kbd> | **Speed Up** | Accelerate playback by +0.25x (up to 8x) |
| <kbd>[</kbd> or <kbd>&lt;</kbd> | **Speed Down** | Slow playback by -0.25x (down to 0.1x) |
| <kbd>0</kbd> | **Reset Speed** | Snap playback rate back to 1.00x |
| <kbd>F</kbd> | **Solo Mode** | Enter / Exit focused theater view |
| <kbd>I</kbd> | **Immersive Mode** | Hide all toolbars and UI chrome |
| <kbd>M</kbd> | **Mute / Unmute** | Toggle master audio mute |
| <kbd>L</kbd> | **Loop Mode** | Cycle Repeat (None ➔ Once ➔ Always ➔ Folder) |
| <kbd>S</kbd> | **Snapshot** | Capture lossless frame screenshot |
| <kbd>←</kbd> / <kbd>→</kbd> | **Rotate 90°** | Rotate focused media counter-clockwise / clockwise |
| <kbd>↑</kbd> / <kbd>↓</kbd> | **Navigate** | Jump to previous / next media asset |
| <kbd>1</kbd> – <kbd>8</kbd> | **Grid Density** | Instant column count preset (2 to 16 columns) |
| <kbd>Ctrl</kbd> + <kbd>A</kbd> | **Select All** | Select all visible media cards for batch operations |
| <kbd>Delete</kbd> | **Decommission** | Remove from workspace |
| <kbd>Shift</kbd> + <kbd>Delete</kbd> | **Secure Shred** | Hardware-aware permanent recycling |
| <kbd>Esc</kbd> | **Escape / Reset** | Exit modals, clear selection, or reset zoom to 100% |

---

## 📥 Installation

### Windows 10 & 11 (MSIX 1-Click Install)

1. Download the latest release from the **[Releases](https://github.com/Viguru24/Video/releases)** page:
   * `Cosmo Symphony_1.4.0.0.msixbundle`
2. **First-Time Install Certificate Setup** (for sideloaded MSIX):
   * Right-click `CosmoSymphony-Developer.cer` ➔ **Install Certificate**.
   * Choose **Local Machine** ➔ Place in **Trusted People** (or **Trusted Root Certification Authorities**).
   * *(Alternatively, right-click `TrustCertificate.bat` and click "Run as Administrator").*
3. Double-click `Cosmo Symphony_1.4.0.0.msixbundle` and click **Install**.

---

## 🛠️ Building from Source

### Prerequisites
* [Node.js](https://nodejs.org/) (v18+)
* [Rust](https://www.rust-lang.org/) (Latest Stable)
* [Visual Studio 2022 / C++ Build Tools](https://visualstudio.microsoft.com/)
* Windows 10/11 SDK

### Development Setup
```bash
# 1. Clone the repository
git clone https://github.com/Viguru24/Video.git
cd Video

# 2. Install NPM dependencies
npm install

# 3. Launch Tauri Development Server
npm run tauri dev
```

### Production Build
```bash
# Build production bundle with MSIX packaging
.\Elite-Build.ps1
```

---

## 📄 License & Attribution

Cosmo Symphony is released under the **MIT License**.  
© 2026 MicroMeadow / Cosmo Symphony. Built with passion for high-performance media orchestration.
