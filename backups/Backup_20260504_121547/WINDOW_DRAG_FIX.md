# Technical Documentation: Sovereign Window Drag System
> **Version**: 3.0.0 (Implemented 2026-05-03)

This document outlines the **Manual Drag Bypass** architecture, which is the most robust method for window movement in frameless Tauri applications.

---

## 1. The Problem with CSS Drag Regions
Native `-webkit-app-region: drag` and `data-tauri-drag-region` rely on the OS hit-tester. This can fail if:
- The window is transparent/frameless and has complex padding/borders.
- Nested regions with `pointer-events: none` conflict in the Webview engine.
- OS-level snap layouts reserve the top few pixels of the window.

---

## 2. The Solution: Manual Drag Bypass
Instead of relying on CSS hit-testing, we use the **Tauri JS API** to explicitly start a window drag session.

### A. Event Listener
We attach an `onMouseDown` listener to the entire `<header>` component.

```tsx
onMouseDown={(e) => {
  const target = e.target as HTMLElement;
  const isInteractive = target.closest('button, input, select, [role="button"]');
  if (e.button === 0 && !isInteractive) {
    getCurrentWindow().startDragging();
  }
}}
```

### B. Logic Flow
1. **Target Detection**: We check if the clicked element (or its parents) is a button, input, or other interactive control.
2. **Filtering**: If the click is NOT on an interactive element, and it is a LEFT-CLICK (`e.button === 0`), we invoke `startDragging()`.
3. **Execution**: The OS immediately takes over the mouse session and moves the window.

---

## 3. Benefits
- **Zero Precision Required**: The entire header acts as a drag target.
- **Reliability**: It bypasses all CSS/Z-index issues because the JS engine explicitly hands control to the OS.
- **Interactivity**: Buttons and inputs remain perfectly functional because the drag session is only started if the click is on "empty" space (including logos and text).

---

## 4. Current Version
The application is now running **v3.2.5** with the **Manual Drag Bypass** fully hardened and verified. 
- ❌ All CSS drag regions (`data-tauri-drag-region`) have been purged.
- ✅ Dedicated `.header-drag-handle` (z-index 1001) is the master handle.
- ✅ All interactive controls are elevated to `z-index: 1002`.
