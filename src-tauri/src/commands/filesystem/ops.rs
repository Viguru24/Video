use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

pub fn get_default_snapshots_dir() -> PathBuf {
    if let Some(pic_dir) = dirs::picture_dir() {
        pic_dir.join("Cosmo_Snapshots")
    } else if let Some(doc_dir) = dirs::document_dir() {
        doc_dir.join("Cosmo_Snapshots")
    } else if let Some(home_dir) = dirs::home_dir() {
        home_dir.join("Pictures").join("Cosmo_Snapshots")
    } else if let Ok(curr_dir) = std::env::current_dir() {
        curr_dir.join("Cosmo_Snapshots")
    } else {
        PathBuf::from("C:\\Cosmo_Snapshots")
    }
}

pub fn clean_file_path(path: &str) -> String {
    let mut clean = path.trim().to_string();

    if let Ok(decoded) = urlencoding::decode(&clean) {
        clean = decoded.into_owned();
    }

    if let Some(idx) = clean.find('?') {
        clean = clean[..idx].to_string();
    }

    let bytes = clean.as_bytes();
    for i in 0..clean.len().saturating_sub(1) {
        if bytes[i].is_ascii_alphabetic() && i + 1 < bytes.len() && bytes[i + 1] == b':' {
            let has_sep = i + 2 < bytes.len() && (bytes[i + 2] == b'/' || bytes[i + 2] == b'\\');
            if has_sep {
                let prev_is_alpha = i > 0 && bytes[i - 1].is_ascii_alphabetic();
                if !prev_is_alpha {
                    return clean[i..].to_string();
                }
            }
        }
    }

    let prefixes = [
        "local://",
        "cosmo://",
        "asset://localhost/",
        "asset://",
        "http://asset.localhost/",
        "https://asset.localhost/",
        "http://cosmo.localhost/",
        "https://cosmo.localhost/",
        "asset.localhost/",
        "cosmo.localhost/",
    ];

    for prefix in prefixes {
        if clean.to_lowercase().starts_with(prefix) {
            clean = clean[prefix.len()..].to_string();
            break;
        }
    }

    let subroutes = ["localhost/", "media/", "video/"];
    for subroute in subroutes {
        if clean.to_lowercase().starts_with(subroute) {
            clean = clean[subroute.len()..].to_string();
        }
    }

    clean
}

pub fn clean_local_path(p: &str) -> String {
    let mut clean = clean_file_path(p);

    if let Ok(decoded) = urlencoding::decode(&clean) {
        clean = decoded.into_owned();
    }

    if let Some(idx) = clean.find('?') {
        clean = clean[..idx].to_string();
    }

    if clean.starts_with("/demos/") || clean.starts_with("demos/") {
        let suffix = if clean.starts_with('/') {
            &clean[1..]
        } else {
            &clean[..]
        };
        
        let mut resolved = None;
        
        let file_name = std::path::Path::new(suffix)
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or(suffix);

        if let Some(roaming_dir) = dirs::data_dir() {
            let p_prod = roaming_dir.join("MicroMeadow.CosmoSymphony").join("demos").join(file_name);
            let p_dev = roaming_dir.join("MicroMeadow.CosmoSymphonyDev").join("demos").join(file_name);
            if p_prod.exists() {
                resolved = Some(p_prod);
            } else if p_dev.exists() {
                resolved = Some(p_dev);
            }
        }

        if resolved.is_none() {
            if let Some(local_dir) = dirs::data_local_dir() {
                let p_prod = local_dir.join("MicroMeadow.CosmoSymphony").join("demos").join(file_name);
                let p_dev = local_dir.join("MicroMeadow.CosmoSymphonyDev").join("demos").join(file_name);
                if p_prod.exists() {
                    resolved = Some(p_prod);
                } else if p_dev.exists() {
                    resolved = Some(p_dev);
                }
            }
        }
        
        if resolved.is_none() {
            if let Ok(curr) = std::env::current_dir() {
                let mut p_check = curr.clone();
                for _ in 0..6 {
                    let test_path = p_check.join("public").join(suffix);
                    if test_path.exists() {
                        resolved = Some(test_path);
                        break;
                    }
                    if let Some(parent) = p_check.parent() {
                        p_check = parent.to_path_buf();
                    } else {
                        break;
                    }
                }
            }
        }
        
        if resolved.is_none() {
            let paths_to_try = [
                PathBuf::from("C:\\Users\\louis\\Documents\\GitHub\\Video\\public").join(suffix),
                PathBuf::from("C:\\Users\\louis\\OneDrive\\Documents\\GitHub\\Video\\public").join(suffix)
            ];
            for p_try in paths_to_try {
                if p_try.exists() {
                    resolved = Some(p_try);
                    break;
                }
            }
        }

        if let Some(p_res) = resolved {
            clean = p_res.to_string_lossy().to_string();
        } else if let Some(local_dir) = dirs::data_local_dir() {
            let file_name = std::path::Path::new(suffix)
                .file_name()
                .and_then(|f| f.to_str())
                .unwrap_or(suffix);
            let p_prod = local_dir.join("MicroMeadow.CosmoSymphony").join("demos").join(file_name);
            clean = p_prod.to_string_lossy().to_string();
        }
    }

    clean.replace("/", "\\")
}

#[tauri::command]
pub fn open_folder(path: String) -> Result<(), String> {
    let mut resolved_path = path.trim().to_string();
    println!("[open_folder] Raw input: {}", resolved_path);

    if resolved_path == "default_snapshots" || resolved_path.is_empty() {
        let snap_dir = get_default_snapshots_dir();
        let _ = fs::create_dir_all(&snap_dir);
        resolved_path = snap_dir.to_string_lossy().to_string();
    } else if resolved_path.starts_with("/demos/") || resolved_path.starts_with("demos/") {
        let suffix = if resolved_path.starts_with('/') {
            &resolved_path[1..]
        } else {
            &resolved_path[..]
        };
        
        let mut resolved = None;
        
        if let Ok(curr) = std::env::current_dir() {
            let mut p_check = curr.clone();
            for _ in 0..6 {
                let test_path = p_check.join("public").join(suffix);
                if test_path.exists() {
                    resolved = Some(test_path);
                    break;
                }
                if let Some(parent) = p_check.parent() {
                    p_check = parent.to_path_buf();
                } else {
                    break;
                }
            }
        }
        
        if resolved.is_none() {
            let paths_to_try = [
                PathBuf::from("C:\\Users\\louis\\Documents\\GitHub\\Video\\public").join(suffix),
                PathBuf::from("C:\\Users\\louis\\OneDrive\\Documents\\GitHub\\Video\\public").join(suffix)
            ];
            for p_try in paths_to_try {
                if p_try.exists() {
                    resolved = Some(p_try);
                    break;
                }
            }
        }

        if let Some(p_res) = resolved {
            resolved_path = p_res.to_string_lossy().to_string();
        }
    }

    let clean_path = clean_file_path(&resolved_path);
    let normalized_path = clean_path.replace("/", "\\");
    println!("[open_folder] Cleaned: {}", normalized_path);
    let p = Path::new(&normalized_path);

    if !p.exists() {
        let is_likely_file = p.extension().is_some();
        if !is_likely_file {
            let _ = fs::create_dir_all(p);
        }
    }

    let final_path = if !p.exists() {
        if let Some(parent) = p.parent() {
            if parent.exists() {
                parent.to_string_lossy().to_string()
            } else if let Some(home) = dirs::home_dir() {
                home.to_string_lossy().to_string()
            } else {
                std::env::current_dir().unwrap_or_else(|_| PathBuf::from("C:\\")).to_string_lossy().to_string()
            }
        } else if let Some(home) = dirs::home_dir() {
            home.to_string_lossy().to_string()
        } else {
            std::env::current_dir().unwrap_or_else(|_| PathBuf::from("C:\\")).to_string_lossy().to_string()
        }
    } else {
        normalized_path
    };

    println!("[open_folder] Final: {}", final_path);

    let p_final = Path::new(&final_path);
    if !p_final.exists() {
        return Err(format!("Path not found: {}", final_path));
    }

    #[cfg(target_os = "windows")]
    {
        if p_final.is_dir() {
            std::process::Command::new("explorer.exe")
                .arg(&final_path)
                .spawn()
                .map_err(|e| format!("Failed to launch explorer: {}", e))?;
        } else {
            std::process::Command::new("explorer.exe")
                .arg("/select,")
                .arg(&final_path)
                .spawn()
                .map_err(|e| format!("Failed to launch explorer select: {}", e))?;
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("xdg-open")
            .arg(&final_path)
            .spawn()
            .map_err(|e| format!("Failed to launch open tool: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn recycle_unit(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        trash::delete(&path).map_err(|e| format!("Failed to recycle: {}", e))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn save_pasted_clipboard_image(app: AppHandle, base64_data: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use base64::Engine;
        use tauri::Manager;

        let clean_b64 = if base64_data.contains(',') {
            base64_data.split(',').nth(1).unwrap_or(&base64_data)
        } else {
            &base64_data
        };

        let decoded_bytes = base64::engine::general_purpose::STANDARD
            .decode(clean_b64)
            .map_err(|e| format!("Base64 decode failed: {}", e))?;

        let target_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from(".")).join("pasted_screenshots");
        let _ = fs::create_dir_all(&target_dir);

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);

        let file_name = format!("Screenshot_{}.png", timestamp);
        let dest_path = target_dir.join(file_name);

        fs::write(&dest_path, decoded_bytes).map_err(|e| format!("Failed to write screenshot file: {}", e))?;
        Ok(dest_path.to_string_lossy().to_string())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn create_new_folder(parent_dir: String, folder_name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let parent_path = Path::new(&parent_dir);
        if !parent_path.exists() || !parent_path.is_dir() {
            return Err("Parent directory does not exist".to_string());
        }
        let sanitized = folder_name.replace(|c: char| !c.is_alphanumeric() && c != ' ' && c != '_' && c != '-', "");
        if sanitized.trim().is_empty() {
            return Err("Invalid folder name".to_string());
        }
        let new_folder_path = parent_path.join(&sanitized);
        fs::create_dir_all(&new_folder_path).map_err(|e| format!("Failed to create folder: {}", e))?;
        Ok(new_folder_path.to_string_lossy().to_string())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn move_file_on_disk(
    src_path: String,
    dest_dir: String,
    overwrite: bool,
    rename_sibling: bool,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let clean_src = clean_local_path(&src_path);
        let clean_dest = clean_local_path(&dest_dir);
        let src = Path::new(&clean_src);
        let dest_folder = Path::new(&clean_dest);
        if !src.exists() {
            return Err(format!("Source file does not exist: {}", clean_src));
        }
        if !dest_folder.exists() || !dest_folder.is_dir() {
            return Err("Destination folder does not exist".to_string());
        }
        let file_name = src.file_name().ok_or("Invalid source filename")?;
        let mut dest_path = dest_folder.join(file_name);
        
        if dest_path.exists() {
            if overwrite {
                let _ = crate::commands::server::secure_delete_file(&dest_path);
            } else if rename_sibling {
                let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
                let ext = src.extension().and_then(|s| s.to_str()).unwrap_or("");
                let mut counter = 1;
                loop {
                    let new_name = if ext.is_empty() {
                        format!("{} ({})", stem, counter)
                    } else {
                        format!("{} ({}).{}", stem, counter, ext)
                    };
                    let candidate = dest_folder.join(new_name);
                    if !candidate.exists() {
                        dest_path = candidate;
                        break;
                    }
                    counter += 1;
                }
            } else {
                return Err("File already exists in destination folder".to_string());
            }
        }

        let rename_result = fs::rename(src, &dest_path);
        if rename_result.is_err() {
            fs::copy(src, &dest_path).map_err(|e| format!("Copy fallback failed: {}", e))?;
            if let Err(recycle_err) = crate::commands::server::secure_delete_file(src) {
                println!("Recycle bin delete failed for source during move: {:?}. Attempting hard delete.", recycle_err);
                if let Err(remove_err) = fs::remove_file(src) {
                    let _ = fs::remove_file(&dest_path);
                    return Err(format!("Failed to delete source file: {}. Copy rolled back.", remove_err));
                }
            }
        }
        Ok(dest_path.to_string_lossy().to_string())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn copy_file_on_disk(
    src_path: String,
    dest_dir: String,
    overwrite: bool,
    rename_sibling: bool,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let clean_src = clean_local_path(&src_path);
        let clean_dest = clean_local_path(&dest_dir);
        let src = Path::new(&clean_src);
        let dest_folder = Path::new(&clean_dest);
        if !src.exists() {
            return Err(format!("Source file does not exist: {}", clean_src));
        }
        if !dest_folder.exists() || !dest_folder.is_dir() {
            return Err("Destination folder does not exist".to_string());
        }
        let file_name = src.file_name().ok_or("Invalid source filename")?;
        let mut dest_path = dest_folder.join(file_name);
        
        if dest_path.exists() {
            if overwrite {
                let _ = fs::remove_file(&dest_path);
            } else if rename_sibling {
                let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
                let ext = src.extension().and_then(|s| s.to_str()).unwrap_or("");
                let mut counter = 1;
                loop {
                    let new_name = if ext.is_empty() {
                        format!("{} ({})", stem, counter)
                    } else {
                        format!("{} ({}).{}", stem, counter, ext)
                    };
                    let candidate = dest_folder.join(new_name);
                    if !candidate.exists() {
                        dest_path = candidate;
                        break;
                    }
                    counter += 1;
                }
            } else {
                return Err("File already exists in destination folder".to_string());
            }
        }

        fs::copy(src, &dest_path).map_err(|e| format!("Copy failed: {}", e))?;
        Ok(dest_path.to_string_lossy().to_string())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn file_exists(path: String) -> bool {
    let clean = clean_local_path(&path);
    Path::new(&clean).exists()
}

#[tauri::command]
pub fn check_path_drive_status(path: String) -> serde_json::Value {
    let clean = clean_local_path(&path);
    let p = Path::new(&clean);
    let exists = p.exists();

    let mut drive_root = String::new();
    let mut drive_accessible = true;

    if clean.len() >= 2 && clean.chars().nth(1) == Some(':') {
        let letter = &clean[0..2];
        drive_root = format!("{}\\", letter);
        drive_accessible = Path::new(&drive_root).exists();
    }

    serde_json::json!({
        "exists": exists,
        "drive_root": drive_root,
        "drive_accessible": drive_accessible
    })
}
