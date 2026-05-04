# MANUS_PLAN: Theme System Restoration & Aesthetic Elevation

## Goal
Fix the reported "Theme not working" issue by implementing the missing CSS definitions for the application's theme engine and elevating the overall visual quality with Glassmorphism and dynamic backgrounds.

## Proposed Changes

### 1. [index.css](file:///c:/Users/louis/OneDrive/Documents/GitHub/Video/src/index.css)
- **Multi-Theme Definitions**: Implement color palettes for `midnight`, `nordic`, `solarized`, and `cyberpunk`.
- **Glassmorphism Layer**: Define global glass tokens (`--glass-bg`, `--glass-border`, `--glass-blur`) and apply them to the Header, Footer, Modals, and Overlay components.
- **Dynamic Nebula**: Update `.nebula-bg` to transition its colors based on the active `[data-theme]`.
- **Accent Tinting**: Use CSS filters to tint the logo and other fixed assets to match the current theme's accent color.

### 2. [App.tsx](file:///c:/Users/louis/OneDrive/Documents/GitHub/Video/src/App.tsx)
- No functional changes needed to state, but will verify the `data-theme` attribute propagation.

### 3. [ControlBar.tsx](file:///c:/Users/louis/OneDrive/Documents/GitHub/Video/src/components/ControlBar.tsx)
- Enhance the theme button feedback.

### 4. [Sovereign Drag System](file:///c:/Users/louis/OneDrive/Documents/GitHub/Video/WINDOW_MANAGEMENT_PROTOCOL.md)
- **Hardening**: Purged all `-webkit-app-region` and `data-tauri-drag-region` overrides.
- **Implementation**: Restored the high-z-index Manual Bypass (`startDragging()`) as the source of truth.
- **Verification**: Confirmed full window-drag stability on frameless Tauri v2.

## Verification Plan
1. Cycle through all 5 themes using the Palette button in the Control Bar.
2. Verify that CSS variables (`--bg-primary`, `--accent`, etc.) update correctly for each theme.
3. Ensure Glassmorphism (blur + transparency) is visible on the header/footer against the nebula background.
4. Verify that the theme persists across application reloads (Tauri persistence).
5. **Verify Sovereign Drag**: Ensure the header drags the window from any non-interactive point.

### 5. Brand Dissociation (v3.2.5+)
- **Symphony Side**: Purged all " Studio\ strings and replaced with \Workshop\ or \Symphony\. Renamed CreationStudio.tsx to SymphonyWorkshop.tsx.
- **Studio Side**: Configured Studio.bat to launch both the Python Backend API and the Remotion UI for autonomous production.
- **Isolation**: Ensured separate database persistence and branding across both environments.
