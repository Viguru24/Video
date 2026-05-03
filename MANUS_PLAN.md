# MANUS_PLAN: Sovereign Window Drag Restoration

## Goal
Restore and optimize the window drag functionality for the frameless "Cosmo Symphony" workstation. 
The current approach (8px handle + gaps) is too small and frustrating. 
The new approach implements a 'Sovereign Drag System' where the entire header is draggable, and non-interactive elements allow clicks to 'fall through' to the drag region.

## Proposed Changes

### 1. [ControlBar.tsx](file:///c:/Users/louis/OneDrive/Documents/GitHub/Video/src/components/ControlBar.tsx) [MODIFY]
- Move `data-tauri-drag-region` to the main `<header>` container.
- Remove redundant handles and spacers.
- Clean up child attributes.

### 2. [index.css](file:///c:/Users/louis/OneDrive/Documents/GitHub/Video/src/index.css) [MODIFY]
- Set `.app-header` as the master drag region.
- Use `pointer-events: none` on wrappers (logo, text, groups) to allow click-through dragging.
- Explicitly set `pointer-events: auto` and `no-drag` on interactive children.

## Verification Plan
1. Drag by Logo/Text (Wider area).
2. Drag by gaps between buttons.
3. Ensure buttons and sliders still work.
