use std::path::Path;
use tauri::{AppHandle, Emitter, State};
use crate::DirectoryWatcherState;

#[tauri::command]
pub async fn watch_directory(
    app: AppHandle,
    state: State<'_, DirectoryWatcherState>,
    dir_path: String,
) -> Result<(), String> {
    if dir_path.trim().is_empty() {
        return Ok(());
    }
    
    let mut map = state.watchers.lock().map_err(|e| e.to_string())?;
    let normalized_key = dir_path.replace('\\', "/").trim_end_matches('/').to_lowercase();
    
    if map.contains_key(&normalized_key) {
        return Ok(());
    }
    
    let path = Path::new(&dir_path);
    if !path.exists() || !path.is_dir() {
        return Err("Directory does not exist".to_string());
    }
    
    let app_clone = app.clone();
    let dir_path_clone = dir_path.clone();
    
    use std::sync::atomic::{AtomicU64, AtomicBool, Ordering};
    let last_event_time = std::sync::Arc::new(AtomicU64::new(0));
    let last_event_time_clone = last_event_time.clone();
    let is_debounce_active = std::sync::Arc::new(AtomicBool::new(false));
    let is_debounce_active_clone = is_debounce_active.clone();

    use notify::{Watcher, RecursiveMode};
    let mut watcher = notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
        if let Ok(_event) = res {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;
            
            last_event_time_clone.store(now, Ordering::SeqCst);

            if is_debounce_active_clone.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_ok() {
                let app = app_clone.clone();
                let dir_path = dir_path_clone.clone();
                let last_time = last_event_time_clone.clone();
                let is_active = is_debounce_active_clone.clone();

                tauri::async_runtime::spawn(async move {
                    loop {
                        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
                        let current_now = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64;
                        let last = last_time.load(Ordering::SeqCst);
                        if current_now.saturating_sub(last) >= 300 {
                            is_active.store(false, Ordering::SeqCst);
                            let _ = app.emit("directory-changed", dir_path.clone());
                            break;
                        }
                    }
                });
            }
        }
    }).map_err(|e| e.to_string())?;
    
    watcher.watch(path, RecursiveMode::NonRecursive).map_err(|e| e.to_string())?;
    
    map.insert(normalized_key, watcher);
    Ok(())
}

#[tauri::command]
pub async fn unwatch_directory(
    state: State<'_, DirectoryWatcherState>,
    dir_path: String,
) -> Result<(), String> {
    if dir_path.trim().is_empty() {
        return Ok(());
    }
    let mut map = state.watchers.lock().map_err(|e| e.to_string())?;
    let normalized_key = dir_path.replace('\\', "/").trim_end_matches('/').to_lowercase();
    map.remove(&normalized_key);
    Ok(())
}
