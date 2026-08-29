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

## ✨ Comprehensive Feature Matrix

### 📸 1. Professional Photo & Image Creative Suite
* **High-Res RAW & Ultra-HD Viewer**: Blazing fast rendering for 50MP+ camera photos, HDR images, and multi-format graphics.
* **🖼️ Artisanal Hardwood Frame Studio**: Procedurally generated 4-plank mitered hardwood molding with authentic 45° corner joinery, wood grain fiber alignment, gold inner fillet, and ambient drop shadows.
* **✨ AI Portrait Bokeh & Depth Studio**: Automatic on-device neural depth estimation, background defocusing, adjustable virtual aperture (f/1.4 to f/16), and feathered edge masking.
* **✂️ 1-Click AI Subject Cutout & Sticker Creator**: Long-press on any image to instantly isolate subjects into transparent PNG stickers with automatic side-by-side comparison.
* **⚡ 4x AI Super-Resolution Upscaling**: Local neural model enhancement to upscale low-res photos and frame grabs to crisp 4K/8K.
* **🎨 Color Grading & Adjustment Studio**: Real-time hardware GPU filters for Brightness, Contrast, Saturation, Gamma, Invert, and Hue shifting.
* **🎞️ Dynamic Slideshow & Digital Picture Frame**: Continuous full-screen ambient playback with Ken Burns pan-and-zoom motion and intelligent resume memory.

### 📲 2. Seamless Phone ↔ Desktop Wi-Fi Sharing (AirDrop for Windows)
* **Zero-Cloud Local Transfer**: Send and receive photos, videos, and albums over local Wi-Fi with maximum speed and complete privacy.
* **Instant QR Code Pairing**: Scan with any iPhone or Android camera — no app installation required; runs natively in mobile Safari/Chrome.
* **Bidirectional Sync**:
  * **PC ➔ Phone**: Send entire folders or curated clips to your mobile device with 1-click batch ZIP or individual downloads.
  * **Phone ➔ PC**: Take photos or pick videos on your phone and beam them directly into the Cosmo Symphony workspace in real time.
* **Companion Android App**: Includes `CosmoShare.apk` for background transfer and automated gallery saving.

### 🎬 3. Hyper-Density Multi-Media Mosaic Wall
* **Unified Symphony Orchestration**: Master Play, Pause, Mute, Volume, and Speed control across all active media cards simultaneously.
* **Fluid Drag-and-Drop Grid**: Dynamic column density scaling (1 to 16 columns) powered by `@dnd-kit` with silky spring animations.
* **Independent Zoom & Pan**: Pinch-to-zoom up to 800% with real-time HUD and 1-click `1:1` reset button.

### 🖥️ 4. Multi-Monitor Detached Popout Players
* **Detached Native Windows**: Pop out any video or image into a dedicated floating window with Picture-in-Picture and Always-On-Top modes.
* **Secondary Monitor Staging**: Arrange individual assets across multiple physical displays while maintaining synchronization.

### 🛡️ 5. Hardware-Aware Secure Storage & Shredding
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
