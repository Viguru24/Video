use tauri::AppHandle;

#[tauri::command]
pub async fn select_folder_cmd(app: AppHandle) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;
    let folder = app.dialog().file().blocking_pick_folder();
    if let Some(path) = folder {
        Ok(path.to_string())
    } else {
        Err("Cancelled".into())
    }
}

#[tauri::command]
pub async fn select_files_cmd(app: AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let files = app.dialog().file().blocking_pick_files();
    if let Some(paths) = files {
        Ok(paths.iter().map(|p| p.to_string()).collect())
    } else {
        Err("Cancelled".into())
    }
}
