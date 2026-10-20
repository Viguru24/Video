use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};
use super::dependencies::SetupProgressEvent;
use super::telemetry::new_hidden_command;

pub fn resolve_install_dir(app: &AppHandle) -> PathBuf {
    let default_dir = app.path().app_data_dir().unwrap_or_else(|_| {
        let app_data = std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(std::env::var_os("USERPROFILE").unwrap_or_default()).join("AppData").join("Local"));
        app_data.join("MicroMeadow.CosmoSymphony")
    });

    let config_file = default_dir.join("cosmo_config.json");
    if config_file.exists() {
        if let Ok(content) = std::fs::read_to_string(&config_file) {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(custom_path) = parsed.get("custom_install_path").and_then(|v| v.as_str()) {
                    let path = PathBuf::from(custom_path);
                    if path.exists() {
                        return path;
                    }
                }
            }
        }
    }
    default_dir
}

#[tauri::command]
pub fn get_custom_install_path(app: AppHandle) -> Option<String> {
    let default_dir = app.path().app_data_dir().ok()?;
    let config_file = default_dir.join("cosmo_config.json");
    if config_file.exists() {
        if let Ok(content) = std::fs::read_to_string(&config_file) {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(custom_path) = parsed.get("custom_install_path").and_then(|v| v.as_str()) {
                    return Some(custom_path.to_string());
                }
            }
        }
    }
    None
}

#[tauri::command]
pub async fn set_custom_install_path(app: AppHandle, path: Option<String>) -> Result<(), String> {
    let default_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let _ = std::fs::create_dir_all(&default_dir);
    let config_file = default_dir.join("cosmo_config.json");

    let mut config_val = if config_file.exists() {
        std::fs::read_to_string(&config_file)
            .ok()
            .and_then(|c| serde_json::from_str::<serde_json::Value>(&c).ok())
            .unwrap_or_else(|| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    if let Some(p) = path {
        let pb = PathBuf::from(&p);
        if !pb.exists() {
            std::fs::create_dir_all(&pb).map_err(|e| format!("Failed to create folder: {}", e))?;
        }
        config_val["custom_install_path"] = serde_json::json!(p);
    } else {
        if let Some(obj) = config_val.as_object_mut() {
            obj.remove("custom_install_path");
        }
    }

    let config_str = serde_json::to_string_pretty(&config_val).map_err(|e| e.to_string())?;
    std::fs::write(&config_file, config_str).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn uninstall_addons(app: AppHandle) -> Result<String, String> {
    let install_dir = resolve_install_dir(&app);
    let cpu_bundle = install_dir.join("cosmo_enhance");
    let gpu_bundle = install_dir.join("cosmo_enhance_gpu");
    let models_dir = install_dir.join(".cosmo_models");
    let cpu_zip    = install_dir.join("cosmo_enhance_win64.zip");
    let gpu_zip    = install_dir.join("cosmo_enhance_gpu_win64.zip");

    let mut total_freed: u64 = 0;
    let mut deleted_items = Vec::new();

    let get_size = |path: &std::path::Path| -> u64 {
        if !path.exists() { return 0; }
        if path.is_file() {
            return path.metadata().map(|m| m.len()).unwrap_or(0);
        }
        let mut size = 0;
        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten() {
                size += entry.metadata().map(|m| m.len()).unwrap_or(0);
                if entry.path().is_dir() {
                    if let Ok(sub) = std::fs::read_dir(entry.path()) {
                        for sub_entry in sub.flatten() {
                            size += sub_entry.metadata().map(|m| m.len()).unwrap_or(0);
                        }
                    }
                }
            }
        }
        size
    };

    let items_to_clean = [
        (&cpu_bundle, "CPU Enhancement Server"),
        (&gpu_bundle, "GPU NVIDIA/AMD Pack"),
        (&models_dir, "AI Model Weights"),
        (&cpu_zip, "CPU Install Package"),
        (&gpu_zip, "GPU Install Package")
    ];

    #[cfg(target_os = "windows")]
    {
        let _ = new_hidden_command("taskkill")
            .args(["/F", "/IM", "cosmo_enhance.exe", "/T"])
            .output();
        std::thread::sleep(std::time::Duration::from_millis(500));
    }

    for (path, name) in &items_to_clean {
        if path.exists() {
            let sz = get_size(path);
            total_freed += sz;
            
            if path.is_dir() {
                let _ = std::fs::remove_dir_all(path);
            } else {
                let _ = std::fs::remove_file(path);
            }
            deleted_items.push(format!("Removed {} ({:.1} MB)", name, sz as f64 / 1_048_576.0));
        }
    }

    let report = if deleted_items.is_empty() {
        "No AI Add-ons or model weights found to uninstall.".to_string()
    } else {
        format!(
            "AI Add-ons successfully uninstalled!\n\nCleared Location: {}\nFreed Space: {:.1} MB\n\nDetails:\n- {}",
            install_dir.to_string_lossy(),
            total_freed as f64 / 1_048_576.0,
            deleted_items.join("\n- ")
        )
    };

    let _ = app.emit("setup-progress", SetupProgressEvent {
        step: "uninstalled".to_string(),
        message: "AI Add-ons removed".to_string(),
        percent: 0,
        done: false,
        error: None,
    });

    Ok(report)
}
