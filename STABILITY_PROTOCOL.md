# Cosmo Symphony Stability & Recovery Protocol

This document outlines the critical fixes and protocols established to maintain application stability, resolve "foreground ghosting," and prevent version mismatch freezes.

---

## 1. Environment Synchronization (The "Freeze" Fix)
**Issue**: Application freezes on startup or interaction.
**Root Cause**: Version mismatch between NPM packages (`@tauri-apps/api`, `@tauri-apps/cli`) and the Rust backend crate (`tauri`).
**Requirement**:
- **Rust `tauri` crate**: Must be kept at `2.10.x`.
- **NPM `@tauri-apps/api`**: MUST be pinned to `2.10.1`.
- **NPM `@tauri-apps/cli`**: MUST be pinned to `2.10.1`.

> [!IMPORTANT]
> If a "Version Mismatch" error appears in the logs, DO NOT upgrade the NPM packages to the latest. Downgrade them to `2.10.1` to match the backend.

---

## 2. Window Visibility & Ghosting (The "Background" Fix)
**Issue**: The app is running (icon in taskbar) but cannot be brought to the foreground.
**Solution**:
1. **Transparency Protocol**: `transparent: true` is disabled in `tauri.conf.json`. This ensures the Windows DWM (Desktop Window Manager) correctly hit-tests the taskbar icon.
2. **Setup Guard**: The Rust `main.rs` setup block explicitly forces the window to show and focus.
   ```rust
   .setup(|app| {
       if let Some(window) = app.get_webview_window("main") {
           let _ = window.show();
           let _ = window.set_focus();
       }
       Ok(())
   })
   ```

---

## 3. Native Integration (The "White Screen" Fix)
**Issue**: White screen on boot with `SyntaxError` regarding `plugin-opener`.
**Root Cause**: Incorrect API usage for `@tauri-apps/plugin-opener` v2.
**Correction**:
- ❌ `import { open } from '@tauri-apps/plugin-opener';`
- ✅ `import { openUrl } from '@tauri-apps/plugin-opener';`
- ✅ `import { openPath } from '@tauri-apps/plugin-opener';`

---

## 4. Performance Preservation
**Issue**: UI lag or freezing when loading large collections.
**Solution**:
- **Preheat Buffer**: Limited to the next 4 videos ONLY.
- **Intersection Observer**: Used in `SortableVideoCard` to cull invisible decoders.

---

## 5. Emergency Recovery Procedure
If the application becomes unresponsive:
1. Run `.\Elite-Reset.ps1` to clear zombie processes and port locks.
2. Verify `package.json` pins are at `2.10.1`.
3. Check `main.rs` for absolute path support in `cosmo://` (handling `Prefix` and `RootDir`).
