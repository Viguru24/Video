# Cosmo Symphony - Requirements Specification

This document lists the exact, core requirements for the Cosmo Symphony media player application. It serves as a single source of truth for features, controls, and behavioral specifications. Refer to this document during development and updates.

---

## 🖥️ 1. Focus / Solo Mode & The Floating Control Bar

Double-clicking any card in the grid enlarges it to fill the screen in focused **Solo Mode**. The controls in this mode are split between the top menu bar (global app features) and a floating, glassmorphic control bar at the bottom center.

### A. Video Mode Control Bar
When viewing a video in solo mode, the bottom floating control bar must display the following controls (from left to right):
1. **Frame Back (ChevronLeft)**
   - Click to step back exactly 1 frame.
   - **Continuous Stepping**: Hold down the mouse button (or touch) to step backward continuously frame-by-frame until released.
   - **No Auto-Hide**: The control bar **must not** fade out or vanish from the screen while the frame-step button is held down.
2. **Play / Pause Button (Play/Pause)**
   - Toggles playback of the current video.
   - **Spacebar Link**: Must be fully synchronized with the keyboard's **Spacebar** key.
3. **Frame Forward (ChevronRight)**
   - Click to step forward exactly 1 frame.
   - **Continuous Stepping**: Hold down the mouse button (or touch) to step forward continuously frame-by-frame until released.
   - **No Auto-Hide**: The control bar **must not** fade out or vanish from the screen while the frame-step button is held down.
4. **Volume Group**:
   - **Mute / Unmute Button**: Toggles between muted and unmuted audio.
   - **Volume Slider**: Inline range slider reflecting current volume.
   - **Mouse Scroll Wheel Control**: Hovering over the volume container and scrolling the mouse roller/wheel must dynamically adjust the volume up or down and automatically unmute.
5. **Crop Button (Crop)**
   - Activates the crop overlay on the video.
6. **Save Snapshot (Camera)**
   - Captures a screenshot of the video and saves it. Only valid for videos; must be hidden for pictures.

### B. Picture Mode Control Bar
When viewing a static picture in solo mode, the bottom floating control bar must show:
1. **Crop Button (Crop)**
   - Activates the crop overlay on the image.

*Note: Sibling file navigation buttons (`SkipBack` / `SkipForward`) must **never** be rendered on the floating control bar. Sibling file navigation (going to the next or previous file) is controlled automatically via mouse wheel scroll over the solo mode overlay, swipe, or keyboard arrows.*

---

## 🔄 2. Slideshow Features
- **Location**: The slideshow toggle button must live exclusively at the **top control bar** in both Video and Still modes.
- **No Duplicates**: A slideshow button must **never** be rendered on the bottom floating solo control bar.
- **Hover Scroll Adjust**: Hovering the mouse roller over the slideshow button and scrolling must adjust the slideshow timer interval (range: 2 seconds to 30 seconds).

---

## 🔊 3. Maximizing & Sound Synchronization
- **Volume Preservation**: Double-clicking a card to maximize/focus a video must preserve the video's audio state. The sound must not default to 0 or vanish upon maximization.
- **Mute Synchronization**: Master play/mute states, global volume, and fit modes must remain in perfect sync between grid view and maximized/focus view.

---

## 🔄 4. Auto-Save Rotation to Disk
- **Direct Disk Write**: Rotating any media (right-clicking and selecting Rotate Right/Left, or using keyboard arrows) must immediately invoke Tauri's `rotate_media_on_disk` command to permanently bake the rotation into the file on disk.
- **CSS Offset Reset**: Upon saving to disk, the frontend local CSS rotation property must reset to `0` to prevent double-rotation offsets.
- **Cache Busting**: The file URL must be appended with a unique timestamp query parameter (`?t=Date.now()`) to force viewports and cache handlers to render the rotated file immediately.
- **Clean Menu**: The redundant manual `"Save Rotation to Disk"` menu action must be hidden.

---

## 🔗 5. Context Menu Labeling
- **Dynamic Context**: The right-click context menu "Share" action must display as `"Share Video"` or `"Share Picture"` depending on the file type.

---

## ⚙️ 6. Global Rules & Project Architecture

### Global Rules
- **Environment**: Windows OS. Use PowerShell for all terminal command executions and scripts.
- **Workflow**: 
  - ALWAYS work locally (`localhost`) first by default.
  - NEVER deploy to production or push changes to a remote repository unless explicitly requested by the USER.
  - ALWAYS run diagnostics or production builds (`npm run build`) before declaring a task complete to ensure zero compile or runtime syntax issues.
- **Aesthetics**: Prioritize "rich," "premium," and "dynamic" design (using glassmorphism, smooth animations, and high-quality UI details). Avoid simple, basic, or generic-looking elements.
- **Communication**: Be concise, helpful, and proactive. Always make links clickable.

### Key File Map
- **App Entry**: [App.tsx](file:///c:/Users/louis/OneDrive/Documents/GitHub/Video/src/App.tsx)
  - Responsible for the global state (play/pause, mute, volume, active filters, selected files).
  - Implements the floating glassmorphic solo control bar at the bottom center of the screen, frame-stepping triggers, and global hotkeys.
- **Media Renderer**: [VideoCard.tsx](file:///c:/Users/louis/OneDrive/Documents/GitHub/Video/src/components/VideoCard.tsx)
  - Renders individual video/image files within the grid and in maximized solo mode.
  - Handles local media element reference hooks, scroll-wheel volume actions, and cache-busting rotation saving logic.
- **Context Menus**: [ContextMenu.tsx](file:///c:/Users/louis/OneDrive/Documents/GitHub/Video/src/components/ContextMenu.tsx)
  - Controls the right-click options for assets.
- **Shortcuts Hook**: [useKeyboardShortcuts.ts](file:///c:/Users/louis/OneDrive/Documents/GitHub/Video/src/hooks/useKeyboardShortcuts.ts)
  - Manages keyboard controls (spacebar, arrow keys, screenshot hotkeys).

