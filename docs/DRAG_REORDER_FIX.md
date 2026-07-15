# Drag-and-Drop Tile Reordering — Fix Documentation

**Date:** 2026-07-13  
**Status:** ✅ FIXED  
**File:** `src/hooks/useWorkspaceDnd.ts`

---

## Problem

Dragging a tile to a new position in the grid caused it to **snap back** to its original position. In some cases, the drag would instead **physically duplicate the file on disk** and add a new tile, rather than reordering.

## Root Cause (Two Issues)

### Issue 1: Drag-to-Duplicate Hijacking Reorder Events

The `handleDragEnd` function in `useWorkspaceDnd.ts` contained a **drag-to-duplicate** feature that ran *before* the reorder logic. It worked like this:

1. `handleDragStart` attached a global `pointermove` listener to track the pointer position throughout the drag.
2. On `handleDragEnd`, it used `document.elementsFromPoint()` to check if the pointer was over another tile or over empty grid space.
3. If the pointer was over **empty grid space** (not directly over another tile), it invoked `duplicate_file_on_disk` on the Rust backend, creating a physical copy and inserting a new tile — then `return`ed early, skipping the reorder logic entirely.
4. Only if the pointer landed precisely on another tile would it fall through to `performStandardReorder`.

**The problem:** `dnd-kit`'s `closestCenter` collision detection determines `over` by proximity to tile centers, but the pointer itself often lands on grid gaps, padding, or edges — not directly on a `.grid-item-wrap` element. So `elementsFromPoint()` frequently classified valid reorder drops as "empty space", triggering duplication instead.

### Issue 2: Sort Order Overriding Manual Arrangement

Even when the reorder *did* execute correctly, the `filtered` array (used by `SortableContext` for rendering order) is derived from a `useMemo` that applies sorting when `sortOrder !== 'custom'`. If the user had any sort active (name, size, date, etc.), the reorder would update the master `videos` array, but on the next render the `filtered` memo would re-sort, visually snapping tiles back.

## Fix Applied

### Fix 1: Removed Drag-to-Duplicate (lines 53–162 removed)

Deleted the entire pointer-tracking and duplication system:
- Removed `dragPointerRef` and `dragPointerCleanupRef` refs
- Removed the `pointermove` listener from `handleDragStart`
- Removed the `elementsFromPoint()` hit-testing block from `handleDragEnd`
- Removed the `duplicate_file_on_disk` invoke call

`handleDragEnd` now goes directly to reorder logic when `active.id !== over.id`. The folder-move confirmation prompt (dragging a file onto a folder tile) is preserved.

### Fix 2: Auto-Switch to Custom Sort on Drag (line 70)

Added `setSortOrder('custom')` at the top of `performStandardReorder`, so that any manual drag reorder immediately disables alphabetical/date/size sorting, ensuring the new arrangement persists across renders.

## Architecture After Fix

```
handleDragStart(event)
  └─ setDragId(active.id)            // Simple — just tracks which tile is being dragged

handleDragEnd(event)
  ├─ setDragId(null)                  // Clear drag state
  ├─ if (over && active !== over)
  │   ├─ if (dropping file onto folder) → show move confirmation dialog
  │   └─ else → performStandardReorder(active.id, over.id)
  └─ (no over or same tile) → no-op

performStandardReorder(activeId, overId)
  ├─ setSortOrder('custom')           // Disable active sorting
  └─ setVideos(arrayMove(...))        // Reorder master array
```

## Key Lesson

The original working drag handler in `App.tsx` (before hook extraction) was a simple 15-line function:

```typescript
const handleDragEnd = (event) => {
  const { active, over } = event;
  setDragId(null);
  if (over && active.id !== over.id) {
    setVideos((items) => {
      const oldIndex = items.findIndex((v) => v.id === active.id);
      const newIndex = items.findIndex((v) => v.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        return arrayMove(items, oldIndex, newIndex);
      }
      return items;
    });
  }
};
```

The drag-to-duplicate feature was added later and introduced the regression by intercepting the drop event before reorder logic could run. The `elementsFromPoint()` approach for detecting "empty space" was fundamentally unreliable because `dnd-kit` resolves drop targets via collision detection algorithms, not DOM hit-testing.

> [!IMPORTANT]
> If a drag-to-duplicate feature is needed in the future, it should be triggered via a **modifier key** (e.g., holding `Alt` while dragging) rather than by detecting whether the pointer is over empty space. This avoids any conflict with standard reorder behavior.

## Files Modified

| File | Change |
|------|--------|
| `src/hooks/useWorkspaceDnd.ts` | Removed drag-to-duplicate logic, added `setSortOrder('custom')` on reorder |

## Verification

- ✅ `npm run build` — success
- ✅ `npx tauri build --debug` — success
- ✅ Manual test: dragging tiles to new positions works, tiles stay in place
- ✅ No regressions: folder-move prompt still works when dragging onto a folder tile
