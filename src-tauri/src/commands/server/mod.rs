pub mod cleanup;
pub mod network;
pub mod routes;
pub mod types;

pub use cleanup::*;
pub use network::*;
pub use routes::*;
pub use types::*;

use std::{fs, path::PathBuf, sync::{Arc, Mutex, OnceLock}};

static FRONTEND_DIST_PATH: OnceLock<String> = OnceLock::new();

pub async fn start_server(frontend_dist_path: String) {
    let _ = FRONTEND_DIST_PATH.set(frontend_dist_path.clone());
    routes::start_server_internal(frontend_dist_path).await;
}

#[tauri::command]
pub async fn ensure_wifi_share_server() -> Result<bool, String> {
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], 48273));
    let is_connected = std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(400)).is_ok();
    if is_connected {
        return Ok(true);
    }

    if let Some(dist_path) = FRONTEND_DIST_PATH.get() {
        let dist_clone = dist_path.clone();
        tauri::async_runtime::spawn(async move {
            routes::start_server_internal(dist_clone).await;
        });
        tokio::time::sleep(tokio::time::Duration::from_millis(600)).await;
        let is_now_connected = std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(400)).is_ok();
        return Ok(is_now_connected);
    }
    Ok(false)
}

#[tauri::command]
pub async fn set_wifi_shared_files(paths: Vec<String>) -> Result<(), String> {
    let rooms = ROOMS.get_or_init(|| Arc::new(Mutex::new(std::collections::HashMap::new()))).clone();
    let mut store = rooms.lock().unwrap();
    let room = store.entry("local".to_string()).or_insert_with(|| Room {
        code: "local".to_string(),
        created_at: now_millis(),
        last_activity: now_millis(),
        receiver_connected: false,
        receiver_last_seen: now_millis(),
        files: vec![],
    });

    // Remove any existing direct PC shared paths, but KEEP phone-uploaded files.
    let mut clean_files: Vec<FileItem> = room.files.iter()
        .filter(|f| !f.filename.contains(':') && !f.filename.starts_with('/') && !f.filename.starts_with('\\'))
        .cloned()
        .collect();

    // Add newly shared PC files
    for path_str in paths {
        let mut p = std::path::PathBuf::from(&path_str);
        if !p.exists() {
            if path_str.ends_with(".temp.mp4") {
                let fallback = path_str.replace(".temp.mp4", ".mp4");
                let pb = std::path::PathBuf::from(&fallback);
                if pb.exists() {
                    p = pb;
                }
            } else if let Some(pos) = path_str.rfind(".f") {
                if let Some(dot_pos) = path_str[pos + 1..].find('.') {
                    let format_part = &path_str[pos + 2..pos + 1 + dot_pos];
                    if !format_part.is_empty() && format_part.chars().all(|c| c.is_ascii_digit() || c == '-' || c == 's' || c == 'r') {
                        let fallback = format!("{}{}", &path_str[..pos], &path_str[pos + 1 + dot_pos..]);
                        let pb = std::path::PathBuf::from(&fallback);
                        if pb.exists() {
                            p = pb;
                        }
                    }
                }
            }
        }

        if !p.exists() || !p.is_file() {
            println!("[Wi-Fi Share] File not found for sharing: {}", path_str);
            continue;
        }
        let name = p.file_name()
            .and_then(|s: &std::ffi::OsStr| s.to_str())
            .unwrap_or("file")
            .to_string();
        let size = p.metadata().map(|m: std::fs::Metadata| m.len()).unwrap_or(0);
        let ext = p.extension().and_then(|s: &std::ffi::OsStr| s.to_str()).unwrap_or("");
        
        let mime_type = match ext.to_lowercase().as_str() {
            "mp4" | "m4v" => "video/mp4",
            "webm" => "video/webm",
            "ogg" | "ogv" => "video/ogg",
            "mov" => "video/quicktime",
            "mkv" => "video/x-matroska",
            "avi" => "video/x-msvideo",
            "mp3" => "audio/mpeg",
            "wav" => "audio/wav",
            "flac" => "audio/flac",
            "m4a" => "audio/mp4",
            "jpg" | "jpeg" => "image/jpeg",
            "png" => "image/png",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "bmp" => "image/bmp",
            _ => "application/octet-stream",
        }.to_string();

        let id = uuid::Uuid::new_v4().to_string()[..9].to_string();

        clean_files.push(FileItem {
            id,
            name,
            size,
            mime_type,
            filename: p.to_string_lossy().to_string(),
            uploaded_at: now_millis(),
        });
    }

    room.files = clean_files;
    room.last_activity = now_millis();
    Ok(())
}

#[tauri::command]
pub async fn download_shared_file_to_downloads(
    app: tauri::AppHandle,
    code: String,
    file_id: String,
    custom_dir: Option<String>,
) -> Result<String, String> {
    let (file_path, raw_name, mime_type) = get_file_info(&code, &file_id)
        .ok_or_else(|| "File not found or room expired".to_string())?;

    if !file_path.exists() {
        return Err(format!("Source file does not exist on disk: {:?}", file_path));
    }

    // Resolve sanitized filename for Windows
    let safe_file_name = sanitize_filename_for_windows(&raw_name, &mime_type);

    // Multi-tier download directory resolution
    let download_dir = if let Some(ref dir) = custom_dir {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            let p = PathBuf::from(trimmed);
            if fs::create_dir_all(&p).is_ok() && p.is_dir() {
                p
            } else {
                resolve_fallback_download_dir(&app)?
            }
        } else {
            resolve_fallback_download_dir(&app)?
        }
    } else {
        resolve_fallback_download_dir(&app)?
    };

    let _ = fs::create_dir_all(&download_dir);

    // Make sure we have a unique filename
    let mut target_path = download_dir.join(&safe_file_name);
    if target_path.exists() {
        let stem = target_path.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
        let extension = target_path.extension().and_then(|e| e.to_str()).unwrap_or("");

        let mut counter = 1;
        loop {
            let new_filename = if extension.is_empty() {
                format!("{} ({})", stem, counter)
            } else {
                format!("{} ({}).{}", stem, counter, extension)
            };
            let new_path = download_dir.join(&new_filename);
            if !new_path.exists() {
                target_path = new_path;
                break;
            }
            counter += 1;
        }
    }

    fs::copy(&file_path, &target_path)
        .map_err(|e| format!("Failed to copy file from {:?} to {:?}: {}", file_path, target_path, e))?;

    println!("[Wi-Fi Share] Successfully saved shared file to: {:?}", target_path);
    Ok(target_path.to_string_lossy().to_string())
}
