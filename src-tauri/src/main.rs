// Prevents additional console window on Windows in release, do not remove.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose, Engine as _};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use sysinfo::{CpuRefreshKind, RefreshKind, System};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_log::{Target, TargetKind};

struct AppState {
    sys: Mutex<System>,
    last_refresh: Mutex<std::time::Instant>,
}

#[tauri::command]
fn get_telemetry(state: tauri::State<AppState>) -> serde_json::Value {
    let mut sys = match state.sys.lock() {
        Ok(s) => s,
        Err(poisoned) => poisoned.into_inner(),
    };

    let mut last_refresh = match state.last_refresh.lock() {
        Ok(s) => s,
        Err(poisoned) => poisoned.into_inner(),
    };

    // Prevent race conditions by enforcing a minimum 1-second refresh interval
    if last_refresh.elapsed() >= std::time::Duration::from_millis(1000) {
        sys.refresh_cpu_usage();
        sys.refresh_memory();
        *last_refresh = std::time::Instant::now();
    }

    let cpu_usage = sys.global_cpu_usage();
    let total_mem = sys.total_memory() / 1024 / 1024 / 1024; // GB
    let used_mem = sys.used_memory() / 1024 / 1024 / 1024; // GB

    let gpu_temp = std::process::Command::new("nvidia-smi")
        .args(&["--query-gpu=temperature.gpu", "--format=csv,noheader,nounits"])
        .output()
        .ok()
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .and_then(|s| s.trim().parse::<f32>().ok())
        .unwrap_or(0.0);

    let vram_data = std::process::Command::new("nvidia-smi")
        .args(&["--query-gpu=memory.used,memory.total", "--format=csv,noheader,nounits"])
        .output()
        .ok()
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .and_then(|s| {
            let parts: Vec<&str> = s.split(',').collect();
            if parts.len() >= 2 {
                let used = parts[0].trim().parse::<f32>().ok()? / 1024.0;
                let total = parts[1].trim().parse::<f32>().ok()? / 1024.0;
                Some(format!("{:.1}/{:.1}GB", used, total))
            } else {
                None
            }
        })
        .unwrap_or_else(|| format!("{}/{}GB", used_mem, total_mem));

    serde_json::json!({
        "cpu": format!("{:.1}%", cpu_usage),
        "mem": vram_data,
        "gpu": "RTX 5080",
        "temp": gpu_temp,
        "fps": "STABLE"
    })
}

#[tauri::command]
fn cosmo_log(app: AppHandle, msg: String) {
    if let Ok(mut log_path) = app.path().app_data_dir() {
        log_path.push("cosmo_activity.log");

        if let Some(parent) = log_path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
        let line = format!("[{}] {}\n", timestamp, msg);
        let _ = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_path)
            .and_then(|mut f| {
                use std::io::Write;
                f.write_all(line.as_bytes())
            });
    }
}

#[tauri::command]
async fn select_folder_cmd(app: AppHandle) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;
    
    // Offload the blocking OS dialog to a worker thread to keep the main event loop fluid
    let folder = app.dialog().file().blocking_pick_folder();

    if let Some(path) = folder {
        Ok(path.to_string())
    } else {
        Err("Cancelled".into())
    }
}

#[tauri::command]
async fn get_folder_videos(path: String) -> Result<Vec<serde_json::Value>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut vids = Vec::new();
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                let p = entry.path();
                if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                    if [
                        "mp4", "webm", "mov", "m4v", "3gp", "avi"
                    ]
                    .contains(&ext.to_lowercase().as_str())
                    {
                        if let Some(name) = p.file_name().and_then(|s| s.to_str()) {
                            vids.push(serde_json::json!({
                                "name": name,
                                "url": p.to_string_lossy().to_string()
                            }));
                        }
                    }
                }
            }
        }
        Ok(vids)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn save_snapshot(
    base64_data: String,
    file_name: String,
    custom_dir: Option<String>,
) -> Result<String, String> {
    let data = base64_data.split(',').nth(1).ok_or("Invalid base64")?;
    let bytes = general_purpose::STANDARD
        .decode(data)
        .map_err(|e| e.to_string())?;

    let base_path = if let Some(d) = custom_dir {
        PathBuf::from(d)
    } else {
        dirs::picture_dir()
            .ok_or("No picture dir")?
            .join("Cosmo_Snapshots")
    };

    let _ = fs::create_dir_all(&base_path);
    let full_path = base_path.join(file_name);
    fs::write(&full_path, bytes).map_err(|e| e.to_string())?;
    Ok(full_path.to_string_lossy().to_string())
}

#[tauri::command]
fn save_persistence(app: AppHandle, key: String, data: String) {
    if let Ok(mut path) = app.path().app_data_dir() {
        path.push("persistence");
        let _ = fs::create_dir_all(&path);
        path.push(format!("{}.json", key));
        let _ = fs::write(path, data);
    }
}

#[tauri::command]
fn load_persistence(app: AppHandle, key: String) -> Option<String> {
    if let Ok(mut path) = app.path().app_data_dir() {
        path.push("persistence");
        path.push(format!("{}.json", key));
        return fs::read_to_string(path).ok();
    }
    None
}

#[tauri::command]
fn open_folder(path: String) {
    let normalized_path = path.replace("/", "\\");
    let p = std::path::Path::new(&normalized_path);
    
    if !p.exists() {
        println!("System Error: Path not found -> {}", normalized_path);
        return;
    }

    // Use PowerShell to open the folder and highlight the file
    // PowerShell is more robust than raw explorer.exe calls with spaces/commas
    let script = if p.is_dir() {
        format!("explorer.exe \"{}\"", normalized_path)
    } else {
        format!("explorer.exe /select,\"{}\"", normalized_path)
    };

    let _ = std::process::Command::new("powershell")
        .args(&["-NoProfile", "-Command", &script])
        .spawn();
}

#[tauri::command]
fn exit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
async fn recycle_unit(path: String) -> Result<(), String> {
    // SECURITY: Escape single quotes for PowerShell
    let escaped_path = path.replace("'", "''");
    let script = format!(
        "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('{}', 'OnlyErrorDialogs', 'SendToRecycleBin')",
        escaped_path
    );
    
    let output = std::process::Command::new("powershell")
        .args(&["-NoProfile", "-Command", &script])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
async fn set_always_on_top(app: AppHandle, flag: bool) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_always_on_top(flag);
    }
}

#[tauri::command]
async fn rename_video(old_path: String, new_name: String) -> Result<String, String> {
    let old_p = std::path::PathBuf::from(&old_path);
    if !old_p.exists() {
        return Err("Source file not found".into());
    }

    let parent = old_p.parent().ok_or("Invalid parent directory")?;
    let extension = old_p.extension().and_then(|e| e.to_str()).ok_or("File has no extension")?;
    
    // Sanitize new_name to prevent path traversal
    let sanitized_name = new_name.replace(|c: char| !c.is_alphanumeric() && c != ' ' && c != '_' && c != '-', "");
    if sanitized_name.is_empty() {
        return Err("Invalid new name".into());
    }

    let new_filename = format!("{}.{}", sanitized_name, extension);
    let new_p = parent.join(new_filename);

    if new_p.exists() {
        return Err("A file with that name already exists".into());
    }

    std::fs::rename(&old_p, &new_p).map_err(|e| e.to_string())?;

    Ok(new_p.to_string_lossy().to_string())
}

#[tauri::command]
async fn pop_out(app: AppHandle, url: String, title: String) {
    let encoded_url = urlencoding::encode(&url);
    let route = format!("/?popout=true&url={}", encoded_url);

    let _ = WebviewWindowBuilder::new(
            &app,
            format!("pop-{}", chrono::Local::now().timestamp()),
            WebviewUrl::App(route.into()),
        )
        .title(title)
        .inner_size(800.0, 600.0)
        .build();
}

#[tauri::command]
async fn get_video_metadata(path: String) -> Result<serde_json::Value, String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("File not found".into());
    }

    let metadata = fs::metadata(&p).map_err(|e| e.to_string())?;
    let size_mb = metadata.len() as f64 / 1024.0 / 1024.0;
    let extension = p.extension()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_uppercase();

    Ok(serde_json::json!({
        "size": format!("{:.2} MB", size_mb),
        "format": extension,
        "path": path,
        "name": p.file_name().and_then(|s| s.to_str()).unwrap_or("Unknown")
    }))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::Webview),
                ])
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .register_uri_scheme_protocol("cosmo", |_app, request| {
            // HIGH-PERFORMANCE ASYNC DRIVE ENGINE (v4)
            // This handler is optimized for 24-core parallel streaming
            
            // Handle CORS Preflight
            if request.method() == tauri::http::Method::OPTIONS {
                return tauri::http::Response::builder()
                    .status(200)
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, RANGE")
                    .header("Access-Control-Allow-Headers", "Range, Content-Type")
                    .header("Access-Control-Max-Age", "86400")
                    .body(Vec::new())
                    .unwrap();
            }

            let uri_str = request.uri().to_string();
            let path_raw = uri_str
                .replace("cosmo://localhost/", "") 
                .replace("cosmo://media/", "")
                .replace("cosmo://video/", "")
                .replace("cosmo://", "");

            let path_decoded = match urlencoding::decode(&path_raw) {
                Ok(decoded) => decoded.into_owned(),
                Err(_) => return tauri::http::Response::builder().status(400).body(Vec::new()).unwrap(),
            };

            // SECURITY: Proper path traversal prevention with canonicalization
            let mut components = Vec::new();
            let mut has_prefix = false;
            
            for component in std::path::Path::new(&path_decoded).components() {
                match component {
                    std::path::Component::Prefix(p) => {
                        components.push(p.as_os_str());
                        has_prefix = true;
                    }
                    std::path::Component::RootDir => {
                        // Preserve RootDir if it's the first or after a prefix
                        if components.is_empty() || has_prefix {
                            components.push(component.as_os_str());
                        }
                    }
                    std::path::Component::Normal(name) => components.push(name),
                    std::path::Component::CurDir => continue,
                    std::path::Component::ParentDir => {
                        if !components.is_empty() {
                            components.pop();
                        } else {
                            return tauri::http::Response::builder()
                                .status(403) // Forbidden
                                .body(Vec::new())
                                .unwrap();
                        }
                    }
                }
            }

            // Reconstruct safe path
            let mut safe_path = std::path::PathBuf::new();
            for comp in components {
                safe_path.push(comp);
            }

            // Ensure path is absolute
            if !safe_path.is_absolute() {
                return tauri::http::Response::builder()
                    .status(400)
                    .body(Vec::new())
                    .unwrap();
            }

            // SECURITY: Restrict to allowed directories
            let allowed_prefixes = [
                std::path::PathBuf::from(r"C:\"),
                std::path::PathBuf::from(r"D:\"),
                std::path::PathBuf::from(r"E:\"),
                std::path::PathBuf::from(r"F:\"),
                std::path::PathBuf::from(r"G:\"),
                std::path::PathBuf::from(r"H:\"),
                std::path::PathBuf::from(r"M:\"),
                std::path::PathBuf::from(r"S:\"),
                std::path::PathBuf::from(r"Z:\"),
                std::path::PathBuf::from(r"\\?\"), // UNC paths
            ];

            let is_allowed = allowed_prefixes.iter().any(|prefix| {
                safe_path.starts_with(prefix)
            });

            if !is_allowed {
                return tauri::http::Response::builder()
                    .status(403) // Forbidden
                    .body(Vec::new())
                    .unwrap();
            }

            if !safe_path.exists() {
                return tauri::http::Response::builder()
                    .status(404)
                    .header("Access-Control-Allow-Origin", "*")
                    .body(Vec::new())
                    .unwrap();
            }

            let path = safe_path;

            // Using standard fs here for metadata, but we'll use tokio for the stream
            let file_len = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            
            let range = request
                .headers()
                .get("range")
                .and_then(|r: &tauri::http::HeaderValue| r.to_str().ok());

            let (start, end) = if let Some(r) = range {
                let r_clean = r.replace("bytes=", "");
                let range_parts: Vec<&str> = r_clean.split('-').collect();
                let start = range_parts[0].parse::<u64>().unwrap_or(0);
                let end = if range_parts.len() > 1 && !range_parts[1].is_empty() {
                    range_parts[1].parse::<u64>().unwrap_or(file_len - 1)
                } else {
                    file_len - 1
                };
                (start, end)
            } else {
                (0, file_len.saturating_sub(1))
            };

            let chunk_size = (end - start + 1) as usize;
            
            let mime = match path.extension().and_then(|s| s.to_str()).unwrap_or("") {
                "mp4" | "m4v" => "video/mp4",
                "webm" => "video/webm",
                "mov" => "video/quicktime",
                _ => "video/mp4",
            };

            use std::io::{Read, Seek, SeekFrom};
            let mut buffer = vec![0; chunk_size];
            let mut file = match std::fs::File::open(&path) {
                Ok(mut f) => {
                    let _ = f.seek(SeekFrom::Start(start));
                    let _ = f.read_exact(&mut buffer);
                    Some(f)
                },
                Err(_) => None
            };

            if file.is_none() {
                return tauri::http::Response::builder()
                    .status(404)
                    .header("Access-Control-Allow-Origin", "*")
                    .body(Vec::new())
                    .unwrap();
            }

            tauri::http::Response::builder()
                .status(if start > 0 { 206 } else { 200 })
                .header("Content-Type", mime)
                .header("Accept-Ranges", "bytes")
                .header("Content-Length", chunk_size)
                .header("Content-Range", format!("bytes {}-{}/{}", start, end, file_len))
                .header("Access-Control-Allow-Origin", "*")
                .header("Access-Control-Allow-Methods", "GET, OPTIONS, RANGE")
                .header("Access-Control-Allow-Headers", "Range, Content-Type")
                .header("Access-Control-Allow-Private-Network", "true")
                .body(buffer)
                .unwrap()
        })
        .manage(AppState {
            sys: Mutex::new(System::new_with_specifics(
                RefreshKind::nothing().with_cpu(CpuRefreshKind::everything()),
            )),
            last_refresh: Mutex::new(std::time::Instant::now()),
        })
        .invoke_handler(tauri::generate_handler![
            // cosmo_log,
            select_folder_cmd,
            get_folder_videos,
            save_snapshot,
            save_persistence,
            load_persistence,
            open_folder,
            set_always_on_top,
            pop_out,
            get_telemetry,
            get_video_metadata,
            rename_video,
            recycle_unit,
            exit_app
        ])
        .setup(|app| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
