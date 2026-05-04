# Sovereign Window Management Protocol: The Definitive Guide

## Overview
This document represents the final, hard-won solution to achieving perfect, native-feeling window dragging and resizing in a frameless Tauri v2 application (`decorations: false`). 

We spent significant engineering effort diagnosing why standard "web" approaches fail in a desktop environment. This document outlines the exact, non-negotiable rules for window management in Cosmo Symphony.

---

## 1. The Cardinal Sins of Window Management
**NEVER** do the following in this codebase:
- ❌ **NEVER use `-webkit-app-region: drag`.** It relies on a fragile browser hit-tester that completely breaks when interacting with complex DOM structures, transparency, and Windows OS snap layouts.
- ❌ **NEVER use standard CSS cursors for actual window control.** They are strictly cosmetic.
- ❌ **NEVER assume Tauri v1 APIs work in Tauri v2.** The API surface for manual window control has changed significantly.

---

## 2. The Final Resizing Implementation (Tauri v2)
To resize the frameless window, we manually injected 8 invisible CSS hit-targets (4 edges, 4 corners) overlaying the React DOM.

### The Correct Tauri API
You **must** use `startResizeDragging(direction)`. The older `startResizing` or lowercase directions will silently fail or crash.

### The Correct Direction Strings
Tauri v2 requires strict, capitalized compass directions for the resize API.
```typescript
type ResizeDirection = 'East' | 'North' | 'NorthEast' | 'NorthWest' | 'South' | 'SouthEast' | 'SouthWest' | 'West';
```

### The Ironclad Event Handler
To prevent React synthetic events from swallowing the native OS call, the handler must aggressively hijack the mouse event:
```typescript
const handleResize = (e: React.MouseEvent, direction: ResizeDirection) => {
    // 1. Halt all React event bubbling
    e.preventDefault();
    e.stopPropagation();
    
    // 2. Strictly ensure it is a Left-Click
    if (e.button !== 0) return; 
    
    // 3. Trigger the Native OS API
    getCurrentWindow().startResizeDragging(direction).catch(console.error);
};
```

---

## 3. The Final Dragging Implementation
Window dragging bypasses the DOM entirely via the Tauri native API.

A massive (48px high) invisible div `.header-drag-handle` sits at the top of the interface. 
```typescript
<div 
  className="header-drag-handle" 
  onMouseDown={(e) => {
    if (e.button === 0) getCurrentWindow().startDragging();
  }}
/>
```

### Critical CSS Interactions
For the drag handle to work, internal elements inside the header **must not swallow the click**.
1. The drag handle itself must have a massive `z-index` (e.g., `1001` or `10000`).
2. The elements sitting "under" or visually inside the header must use `pointer-events: none` to let the click fall through to the drag handle.
3. Only specific, interactive buttons (like minimize/close) should reset to `pointer-events: auto`.

---

## 4. The CSS Hit-Target Requirements
Hit targets for manual window management must be oversized. The OS needs a wide berth to register the click.

```css
/* Edge handles must be at least 20px deep */
.handle-t { height: 20px; }
.handle-b { height: 20px; }
.handle-l { width: 20px; }
.handle-r { width: 20px; }

/* Corner handles must be at least 30px deep */
.handle-tl, .handle-tr, .handle-bl, .handle-br {
  width: 30px;
  height: 30px;
}

/* Base properties */
.resize-handle {
  position: fixed;
  z-index: 10000; /* Must sit above absolutely everything */
  background: transparent;
}
```

---

## 5. Security Policy Requirements
For these programmatic calls to pass through Tauri's security boundary, `src-tauri/capabilities/default.json` **MUST** include:
```json
"core:window:allow-start-dragging",
"core:window:allow-start-resizing"
```
*(Note: even though the JS API is `startResizeDragging`, the capability is named `allow-start-resizing`.)*

---

## Summary
If resizing or dragging breaks in the future, do not guess. Compare the code exactly against the signatures, CSS z-indexes, and event handlers documented here. 
