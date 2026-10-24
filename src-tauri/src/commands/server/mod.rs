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

fn resolve_target_dir(app: &tauri::AppHandle, custom_dir: Option<&str>) -> Result<PathBuf, String> {
    let download_dir = if let Some(dir) = custom_dir {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            let p = PathBuf::from(trimmed);
            if fs::create_dir_all(&p).is_ok() && p.is_dir() {
                p
            } else {
                resolve_fallback_download_dir(app)?
            }
        } else {
            resolve_fallback_download_dir(app)?
        }
    } else {
        resolve_fallback_download_dir(app)?
    };

    let _ = fs::create_dir_all(&download_dir);
    Ok(download_dir)
}

fn get_unique_target_path(download_dir: &std::path::Path, safe_file_name: &str) -> PathBuf {
    let mut target_path = download_dir.join(safe_file_name);
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
    target_path
}

#[tauri::command]
pub async fn download_shared_file_to_downloads(
    app: tauri::AppHandle,
    code: String,
    file_id: String,
    file_name: Option<String>,
    custom_dir: Option<String>,
) -> Result<String, String> {
    let download_dir = resolve_target_dir(&app, custom_dir.as_deref())?;

    // 1. Try resolving via in-memory room store
    let resolved_info = get_file_info(&code, &file_id);

    // 2. If found in room store and file exists on disk, copy directly
    if let Some((ref file_path, ref raw_name, ref mime_type)) = resolved_info {
        if file_path.exists() {
            let name_to_use = file_name.as_deref().unwrap_or(raw_name);
            let safe_file_name = sanitize_filename_for_windows(name_to_use, mime_type);
            let target_path = get_unique_target_path(&download_dir, &safe_file_name);
            fs::copy(file_path, &target_path)
                .map_err(|e| format!("Failed to copy file from {:?} to {:?}: {}", file_path, target_path, e))?;
            println!("[Wi-Fi Share] Successfully saved shared file to: {:?}", target_path);
            return Ok(target_path.to_string_lossy().to_string());
        }
    }

    // 3. Fallback: Search the upload buffer directory on disk
    let upload_dir = std::env::temp_dir().join("wi-share-files");
    if let Ok(entries) = fs::read_dir(&upload_dir) {
        let target_name = file_name.as_deref().unwrap_or("").trim();
        let target_id = file_id.trim();
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                let fname = p.file_name().and_then(|s| s.to_str()).unwrap_or("");
                let matches_name = !target_name.is_empty() && (
                    fname.ends_with(target_name) ||
                    fname.replace('_', " ").ends_with(&target_name.replace('_', " "))
                );
                let matches_id = !target_id.is_empty() && fname.contains(target_id);

                if matches_name || matches_id {
                    let name_to_use = if !target_name.is_empty() { target_name } else { fname };
                    let safe_file_name = sanitize_filename_for_windows(name_to_use, "application/octet-stream");
                    let target_path = get_unique_target_path(&download_dir, &safe_file_name);
                    fs::copy(&p, &target_path)
                        .map_err(|e| format!("Failed to copy buffered upload from {:?} to {:?}: {}", p, target_path, e))?;
                    println!("[Wi-Fi Share] Saved buffered upload from disk to: {:?}", target_path);
                    return Ok(target_path.to_string_lossy().to_string());
                }
            }
        }
    }

    // 4. Fallback: Fetch directly over local HTTP from the Wi-Fi Share server
    let local_port = 48273;
    let url = format!("http://127.0.0.1:{}/api/rooms/{}/files/{}", local_port, code, file_id);
    println!("[Wi-Fi Share] In-memory file missing, attempting HTTP fetch from: {}", url);

    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], local_port));
    if let Ok(mut stream) = tokio::net::TcpStream::connect(addr).await {
        let request = format!(
            "GET /api/rooms/{}/files/{} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n\r\n",
            code, file_id, local_port
        );
        if stream.write_all(request.as_bytes()).await.is_ok() {
            let mut response_bytes = Vec::new();
            if stream.read_to_end(&mut response_bytes).await.is_ok() && !response_bytes.is_empty() {
                // Find end of headers (\r\n\r\n)
                if let Some(pos) = response_bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                    let header_part = String::from_utf8_lossy(&response_bytes[..pos]);
                    if header_part.starts_with("HTTP/1.1 200") || header_part.starts_with("HTTP/1.0 200") {
                        let body_bytes = &response_bytes[pos + 4..];
                        let name_to_use = file_name.as_deref().unwrap_or("received_file");
                        let safe_file_name = sanitize_filename_for_windows(name_to_use, "application/octet-stream");
                        let target_path = get_unique_target_path(&download_dir, &safe_file_name);
                        fs::write(&target_path, body_bytes)
                            .map_err(|e| format!("Failed to write HTTP downloaded file: {}", e))?;
                        println!("[Wi-Fi Share] Saved HTTP-streamed file to: {:?}", target_path);
                        return Ok(target_path.to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    Err(format!(
        "File '{}' not found in active room or on disk. Please resend the file from your phone.",
        file_name.as_deref().unwrap_or(&file_id)
    ))
}
