// Prevents additional console window on Windows in release, do not remove.
// Force-compile capability index modification - 2026-05-22
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use sysinfo::System;
use tauri_plugin_log::{Target, TargetKind};

pub mod commands;

pub struct AppState {
    pub sys: Mutex<System>,
    pub last_refresh: Mutex<std::time::Instant>,
}

pub struct LaunchArgs(pub Mutex<Option<String>>);

pub struct DirectoryWatcherState {
    pub watchers: std::sync::Mutex<std::collections::HashMap<String, notify::RecommendedWatcher>>,
}

fn spawn_symphony_backend() {
    std::thread::spawn(move || {
        // 1. Check if port 8005 is already active (matches studio_agent.py uvicorn port)
        if std::net::TcpStream::connect("127.0.0.1:8005").is_ok() {
            println!("Symphony Backend already online on port 8005.");
            return;
        }

        // 2. Kill any zombie python process holding port 8005 or 12000 from a previous unclean shutdown.
        //    This prevents Errno 10048 "address already in use" on next startup.
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            let kill_result = std::process::Command::new("powershell.exe")
                .args(&[
                    "-NoProfile", "-Command",
                    "Get-NetTCPConnection -LocalPort 8005, 12000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
                ])
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .output();
            if let Ok(output) = kill_result {
                if output.status.success() {
                    // Give the OS a moment to release the socket
                    std::thread::sleep(std::time::Duration::from_millis(500));
                }
            }
        }

        // 3. Robust directory traversal to locate sibling "CosmoStudio"
        if let Ok(current_dir) = std::env::current_dir() {
            let mut check_dir = Some(current_dir.as_path());
            
            while let Some(dir) = check_dir {
                // Check if CosmoStudio is a sibling of the current check directory
                let sibling_studio = dir.join("CosmoStudio");
                if sibling_studio.exists() && sibling_studio.join("start_backend.ps1").exists() {
                    println!("Auto-starting Symphony Backend from: {:?}", sibling_studio);
                    let mut cmd = std::process::Command::new("powershell.exe");
                    cmd.args(&[
                        "-ExecutionPolicy",
                        "Bypass",
                        "-File",
                        "start_backend.ps1",
                    ]);
                    cmd.current_dir(sibling_studio);
                    
                    #[cfg(target_os = "windows")]
                    {
                        use std::os::windows::process::CommandExt;
                        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
                    }

                    if let Err(e) = cmd.spawn() {
                        println!("Failed to auto-start Symphony Backend: {:?}", e);
                    } else {
                        println!("Symphony Backend process spawned successfully.");
                    }
                    return;
                }
                check_dir = dir.parent();
            }
            println!("Could not locate CosmoStudio directory from current path: {:?}", std::env::current_dir());
        }
    });
}

pub static POPOUT_MEDIA_URL: std::sync::OnceLock<String> = std::sync::OnceLock::new();

/// Zero-overhead embedded EXIF JPEG thumbnail extractor.
/// Searches the first 128KB header for an embedded JPEG preview without decoding full raw bitmap.
fn extract_exif_jpeg_thumbnail(bytes: &[u8]) -> Option<Vec<u8>> {
    if bytes.len() < 100 || &bytes[0..2] != b"\xFF\xD8" {
        return None;
    }
    let search_limit = bytes.len().min(131072);
    let mut offset = 2;
    while offset + 4 < search_limit {
        if bytes[offset] != 0xFF {
            offset += 1;
            continue;
        }
        let marker = bytes[offset + 1];
        if marker == 0xE1 { // APP1 (EXIF segment)
            let len = ((bytes[offset + 2] as usize) << 8) | (bytes[offset + 3] as usize);
            let app1_end = (offset + 2 + len).min(bytes.len());
            let app1_slice = &bytes[offset + 4..app1_end];
            // Locate embedded JPEG payload inside EXIF (starts with 0xFF 0xD8, ends with 0xFF 0xD9)
            if let Some(thumb_start) = app1_slice.windows(2).position(|w| w == b"\xFF\xD8") {
                let thumb_data = &app1_slice[thumb_start..];
                if let Some(thumb_end_rel) = thumb_data.windows(2).rposition(|w| w == b"\xFF\xD9") {
                    let full_thumb = &thumb_data[..thumb_end_rel + 2];
                    if full_thumb.len() > 1024 {
                        return Some(full_thumb.to_vec());
                    }
                }
            }
            break;
        } else if marker == 0xDA || marker == 0xD9 {
            break;
        } else {
            let len = ((bytes[offset + 2] as usize) << 8) | (bytes[offset + 3] as usize);
            offset += 2 + len;
        }
    }
    None
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let mut is_popout_process = false;
    let mut popout_url = String::new();
    let mut popout_title = String::new();

    for i in 0..args.len() {
        if args[i] == "--popout" {
            is_popout_process = true;
        }
        if args[i] == "--url" && i + 1 < args.len() {
            popout_url = args[i + 1].clone();
        }
        if args[i] == "--title" && i + 1 < args.len() {
            popout_title = args[i + 1].clone();
        }
    }

    if is_popout_process {
        let _ = POPOUT_MEDIA_URL.set(popout_url.clone());
        let pid = std::process::id();
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let pop_wv2_dir = std::path::Path::new(&local_app_data)
                .join("CosmoSymphonyDev")
                .join(format!("WebView2Popout_{}", pid));
            let _ = std::fs::create_dir_all(&pop_wv2_dir);
            std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", pop_wv2_dir);
        }
    } else {
        #[cfg(debug_assertions)]
        {
            if std::env::var("WEBVIEW2_USER_DATA_FOLDER").is_err() {
                if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
                    let dev_wv2_dir = std::path::Path::new(&local_app_data)
                        .join("CosmoSymphonyDev")
                        .join("WebView2Dev");
                    let _ = std::fs::create_dir_all(&dev_wv2_dir);
                    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", dev_wv2_dir);
                }
            }
        }
    }

    // Self-healing: Clean up any zombie processes holding port 12000 from previous sessions
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("powershell.exe")
            .args(&[
                "-NoProfile", "-Command",
                "Get-NetTCPConnection -LocalPort 12000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
            ])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output();
    }

    // Self-healing: Clean up .window-state.json to prevent dynamic popout windows from loading in a loop
    if let Some(config_base) = dirs::config_dir() {
        let targets = [
            "com.cosmo.symphony",
            "MicroMeadow.CosmoSymphony",
            "MicroMeadow.CosmoSymphonyDev"
        ];
        for target in targets {
            let state_file = config_base.join(target).join(".window-state.json");
            if state_file.exists() {
                if let Ok(content) = std::fs::read_to_string(&state_file) {
                    if let Ok(mut json) = serde_json::from_str::<serde_json::Value>(&content) {
                        if let Some(obj) = json.as_object_mut() {
                            // Remove all window state keys that are not "main" (e.g. "popout" or starting with "pop-")
                            let keys_to_remove: Vec<String> = obj.keys()
                                .filter(|k| k.starts_with("pop-") || *k == "popout" || *k != "main")
                                .map(|k| k.to_string())
                                .collect();
                            
                            if !keys_to_remove.is_empty() {
                                for k in keys_to_remove {
                                    obj.remove(&k);
                                }
                                if let Ok(updated_content) = serde_json::to_string(&json) {
                                    let _ = std::fs::write(&state_file, updated_content);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let builder = tauri::Builder::default()
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed => {
                    if window.label() == "main" {
                        println!("Cosmo Symphony: Close/Destroy requested on main window. Saving state and exiting...");
                        
                        // Manually save window position/size before hard exit, otherwise tauri-plugin-window-state hooks are bypassed
                        use tauri::Manager;
                        use tauri_plugin_window_state::AppHandleExt;
                        let _ = window.app_handle().save_window_state(tauri_plugin_window_state::StateFlags::all());

                        // Spawn a quick background process killer command for sibling servers
                        #[cfg(target_os = "windows")]
                        {
                            use std::os::windows::process::CommandExt;
                            let _ = std::process::Command::new("powershell.exe")
                                .args(&[
                                    "-NoProfile", "-Command",
                                    "Get-NetTCPConnection -LocalPort 8005, 12000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
                                ])
                                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                                .output();
                        }
                        std::process::exit(0);
                    } else {
                        println!("Cosmo Symphony: Close/Destroy requested on secondary window '{}'. Allowing standard window close.", window.label());
                    }
                }
                _ => {}
            }
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_drag::init())
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
            // Separate URL path from query string parameters (e.g. ?t=1.0)
            let url_path_only = uri_str.split('?').next().unwrap_or(&uri_str);
            let path_raw = url_path_only
                .replace("cosmo://localhost/", "") 
                .replace("cosmo://media/", "")
                .replace("cosmo://video/", "")
                .replace("cosmo://", "")
                .replace("http://cosmo.localhost/video/", "")
                .replace("http://cosmo.localhost/", "")
                .replace("https://cosmo.localhost/video/", "")
                .replace("https://cosmo.localhost/", "");

            let path_decoded = match urlencoding::decode(&path_raw) {
                Ok(decoded) => decoded.into_owned(),
                Err(_) => return tauri::http::Response::builder().status(400).body(Vec::new()).unwrap_or_else(|_| tauri::http::Response::new(Vec::new())),
            };

            // Remove any leading slashes or backslashes from Webview2 custom scheme normalization (e.g. "/G:/..." -> "G:/...")
            let mut clean_path = path_decoded.trim();
            while (clean_path.starts_with('/') || clean_path.starts_with('\\')) && !clean_path.starts_with("\\\\") {
                if clean_path.len() >= 3 && clean_path.chars().nth(2) == Some(':') {
                    clean_path = &clean_path[1..];
                } else if clean_path.starts_with('/') || clean_path.starts_with('\\') {
                    clean_path = &clean_path[1..];
                } else {
                    break;
                }
            }

            let mut path = std::path::PathBuf::from(clean_path);

            if !path.exists() {
                // Auto-resolve temporary or yt-dlp intermediate filenames to their final merged files
                let mut resolved = false;
                let path_str = path.to_string_lossy().to_string();
                
                if path_str.ends_with(".temp.mp4") {
                    let fallback = path_str.replace(".temp.mp4", ".mp4");
                    let p = std::path::PathBuf::from(&fallback);
                    if p.exists() {
                        path = p;
                        resolved = true;
                    }
                } else if let Some(pos) = path_str.rfind(".f") {
                    if let Some(dot_pos) = path_str[pos + 1..].find('.') {
                        let format_part = &path_str[pos + 2..pos + 1 + dot_pos];
                        if !format_part.is_empty() && format_part.chars().all(|c| c.is_ascii_digit() || c == '-' || c == 's' || c == 'r') {
                            let fallback = format!("{}{}", &path_str[..pos], &path_str[pos + 1 + dot_pos..]);
                            let p = std::path::PathBuf::from(&fallback);
                            if p.exists() {
                                path = p;
                                resolved = true;
                            }
                        }
                    }
                }

                if !resolved && !path.exists() {
                    println!("[Cosmo Protocol] File not found: {:?}", path);
                    return tauri::http::Response::builder()
                        .status(404)
                        .header("Access-Control-Allow-Origin", "*")
                        .body(Vec::new())
                        .unwrap_or_else(|_| tauri::http::Response::new(Vec::new()));
                }
            }

            // ULTRA-FAST EMBEDDED EXIF THUMBNAIL EXTRACTION
            let is_thumb_request = uri_str.contains("thumb=1");
            if is_thumb_request {
                let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
                if ext == "jpg" || ext == "jpeg" || ext == "nef" || ext == "cr2" || ext == "cr3" || ext == "arw" || ext == "dng" {
                    if let Ok(mut file) = std::fs::File::open(&path) {
                        use std::io::Read;
                        let mut header_buf = vec![0u8; 131072];
                        if let Ok(n) = file.read(&mut header_buf) {
                            header_buf.truncate(n);
                            if let Some(thumb_bytes) = extract_exif_jpeg_thumbnail(&header_buf) {
                                let thumb_len = thumb_bytes.len();
                                return tauri::http::Response::builder()
                                    .status(200)
                                    .header("Content-Type", "image/jpeg")
                                    .header("Content-Length", thumb_len)
                                    .header("Cache-Control", "public, max-age=86400, immutable")
                                    .header("Access-Control-Allow-Origin", "*")
                                    .header("Access-Control-Allow-Private-Network", "true")
                                    .body(thumb_bytes)
                                    .unwrap();
                            }
                        }
                    }
                }
            }

            // Using standard fs here for metadata, but we'll use tokio for the stream
            let file_len = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            
            let ext_lower = path.extension().and_then(|s| s.to_str()).map(|s| s.to_lowercase()).unwrap_or_default();
            let is_image = matches!(ext_lower.as_str(), "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "svg" | "tiff" | "tif" | "heic" | "heif" | "avif" | "jxl" | "cr2" | "cr3" | "nef" | "arw" | "dng" | "tga");

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

            let max_allowed = if is_image { 24 * 1024 * 1024 } else { 4 * 1024 * 1024 };
            let mut end = end;
            if end - start + 1 > max_allowed as u64 {
                end = start + max_allowed as u64 - 1;
            }
            if end >= file_len {
                end = file_len.saturating_sub(1);
            }

            let chunk_size = ((end.saturating_sub(start)) + 1).min(max_allowed as u64) as usize;
            if chunk_size == 0 {
                return tauri::http::Response::builder()
                    .status(404)
                    .header("Access-Control-Allow-Origin", "*")
                    .body(Vec::new())
                    .unwrap_or_else(|_| tauri::http::Response::new(Vec::new()));
            }
            
            let mime = match ext_lower.as_str() {
                "mp4" | "m4v" => "video/mp4",
                "webm" => "video/webm",
                "mov" => "video/quicktime",
                "mkv" => "video/x-matroska",
                "avi" => "video/x-msvideo",
                "3gp" => "video/3gpp",
                "flv" => "video/x-flv",
                "wmv" => "video/x-ms-wmv",
                "jpg" | "jpeg" => "image/jpeg",
                "png" => "image/png",
                "gif" => "image/gif",
                "webp" => "image/webp",
                "bmp" => "image/bmp",
                "svg" => "image/svg+xml",
                "tiff" | "tif" => "image/tiff",
                _ => "application/octet-stream",
            };

            use std::io::{Read, Seek, SeekFrom};
            let mut buffer = vec![0; chunk_size];
            let mut bytes_read = 0;
            
            let file_open_result = std::fs::File::open(&path).and_then(|mut f| {
                f.seek(SeekFrom::Start(start))?;
                let mut taken = f.take(chunk_size as u64);
                while bytes_read < chunk_size {
                    match taken.read(&mut buffer[bytes_read..]) {
                        Ok(0) => break, // EOF reached
                        Ok(n) => bytes_read += n,
                        Err(ref e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                        Err(e) => return Err(e),
                    }
                }
                Ok(())
            });

            if file_open_result.is_err() || bytes_read == 0 {
                return tauri::http::Response::builder()
                    .status(404)
                    .header("Access-Control-Allow-Origin", "*")
                    .body(Vec::new())
                    .unwrap_or_else(|_| tauri::http::Response::new(Vec::new()));
            }

            buffer.truncate(bytes_read);
            let response_end = start + bytes_read as u64 - 1;

            tauri::http::Response::builder()
                .status(if start > 0 || bytes_read < file_len as usize { 206 } else { 200 })
                .header("Content-Type", mime)
                .header("Accept-Ranges", "bytes")
                .header("Content-Length", bytes_read)
                .header("Content-Range", format!("bytes {}-{}/{}", start, response_end, file_len))
                .header("Cache-Control", "public, max-age=3600")
                .header("Access-Control-Allow-Origin", "*")
                .header("Access-Control-Allow-Methods", "GET, OPTIONS, RANGE")
                .header("Access-Control-Allow-Headers", "Range, Content-Type")
                .header("Access-Control-Allow-Private-Network", "true")
                .body(buffer)
                .unwrap_or_else(|_| tauri::http::Response::new(Vec::new()))
        })
        .manage(AppState {
            sys: Mutex::new(System::new_with_specifics(
                sysinfo::RefreshKind::nothing().with_cpu(sysinfo::CpuRefreshKind::everything()),
            )),
            last_refresh: Mutex::new(std::time::Instant::now()),
        })
        .manage(LaunchArgs(Mutex::new(None)))
        .manage(DirectoryWatcherState { watchers: std::sync::Mutex::new(std::collections::HashMap::new()) })
        .invoke_handler(tauri::generate_handler![
            commands::filesystem::check_path_drive_status,
            commands::filesystem::save_pasted_clipboard_image,
            commands::filesystem::watch_directory,
            commands::filesystem::unwatch_directory,
            commands::system::get_launch_args,
            commands::system::cosmo_log,
            commands::filesystem::select_folder_cmd,
            commands::filesystem::select_files_cmd,
            commands::filesystem::get_folder_videos,
            commands::media::save_snapshot,
            commands::media::save_persistence,
            commands::media::load_persistence,
            commands::filesystem::open_folder,
            commands::system::set_always_on_top,
            commands::system::pop_out,
            commands::system::close_popout,
            commands::system::get_popout_url,
            commands::system::get_telemetry,
            commands::media::get_video_metadata,
            commands::filesystem::rename_video,
            commands::filesystem::recycle_unit,
            commands::media::rotate_media_on_disk,
            commands::media::mirror_media_on_disk,
            commands::media::apply_color_adjustments_on_disk,
            commands::media::save_adjusted_image_bytes,
            commands::media::get_drag_icon_path,
            commands::media::extract_subject_on_disk,
            commands::media::upscale_image,
            commands::media::generate_store_logos,
            commands::media::enhance_image_crop,
            commands::system::get_ai_hardware_status,
            commands::system::detect_ai_hardware,
            commands::system::span_all_monitors,
            commands::system::unspan_monitors,
            commands::media::snapshot_video_frame,
            commands::filesystem::get_subdirectories,
            commands::filesystem::create_new_folder,
            commands::filesystem::list_directory_contents,
            commands::filesystem::move_file_on_disk,
            commands::filesystem::copy_file_on_disk,
            commands::filesystem::file_exists,
            commands::filesystem::duplicate_file_on_disk,
            commands::media::crop_image_on_disk,
            commands::media::trim_crop_video,
            commands::media::get_media_dimensions,
            commands::media::resize_image_on_disk,
            commands::filesystem::secure_delete_file,
            commands::filesystem::secure_delete_files_batch,
            commands::system::exit_app,
            commands::system::check_dependencies,
            commands::system::install_dependencies,
            commands::system::install_gpu_pack,
            commands::system::download_models,
            commands::system::get_custom_install_path,
            commands::system::set_custom_install_path,
            commands::system::uninstall_addons,
            commands::media::convert_heic_to_jpg,
            commands::media::convert_media_to_standard,
            commands::system::open_external_url,
            commands::media::upscale_video,
            commands::media::cancel_video_upscale,
            commands::media::detect_person_crop,
            commands::filesystem::get_file_stats,
            commands::server::set_wifi_shared_files,
            commands::server::download_shared_file_to_downloads,
            commands::system::share_to_whatsapp,
            commands::system::share_media_file
        ])
        .setup(move |app| {
            use tauri::Manager;
            use std::path::PathBuf;

            if is_popout_process {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_title(&popout_title);
                    
                    let app_handle = app.handle().clone();
                    let window_clone = window.clone();
                    tauri::async_runtime::spawn(async move {
                        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
                        let _ = app_handle.run_on_main_thread(move || {
                            let _ = window_clone.set_decorations(true);
                            let _ = window_clone.set_shadow(true);
                            let _ = window_clone.unmaximize();
                            let _ = window_clone.set_fullscreen(false);
                            let _ = window_clone.set_size(tauri::Size::Logical(tauri::LogicalSize::new(850.0, 500.0)));
                            let _ = window_clone.set_resizable(true);
                            let _ = window_clone.show();
                            let _ = window_clone.set_focus();
                        });
                    });
                }
                return Ok(());
            }

            // Resolve the frontend dist path for local Wi-Fi file sharing
            let resource_path = app
                .path()
                .resource_dir()
                .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

            // Check if bundled resources path exists
            let mut dist_path = resource_path.join("wifi-share-web");
            if !dist_path.exists() {
                dist_path = resource_path.join("resources").join("wifi-share-web");
            }

            // Fallback for development
            let dist_path = if dist_path.exists() {
                dist_path
            } else {
                let dev_dist = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("resources")
                    .join("wifi-share-web");
                if dev_dist.exists() {
                    dev_dist
                } else {
                    // Try parent directory fallback
                    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                        .parent()
                        .map(|p| p.join("src-tauri").join("resources").join("wifi-share-web"))
                        .unwrap_or_else(|| PathBuf::from("resources/wifi-share-web"))
                }
            };

            let dist_str = dist_path.to_string_lossy().to_string();
            println!("[Wi-Fi Share Setup] Static web path: {}", dist_str);

            // Spawn the Axum HTTP server in the background
            tauri::async_runtime::spawn(async move {
                commands::server::start_server(dist_str).await;
            });

            // Auto-start Symphony Backend (FastAPI on port 8000) if not running
            spawn_symphony_backend();

            // Check for launch arguments (Open With)
            let args: Vec<String> = std::env::args().collect();
            if args.len() > 1 {
                let potential_path = &args[1];
                if std::path::Path::new(potential_path).exists() {
                    let launch_args = app.state::<LaunchArgs>();
                    let mut guard = launch_args.0.lock().unwrap();
                    *guard = Some(potential_path.clone());
                }
            }
            
            // Spawn background task to detect AI GPU vs CPU capability
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut has_gpu = false;
                let mut is_dml = false;
                if let Ok((runner, args)) = commands::system::resolve_enhancer_command(Some(&app_handle)) {
                    let mut check_args = args;
                    check_args.push("--check-cuda".to_string());
                    
                    let mut cmd = std::process::Command::new(&runner);
                    cmd.args(&check_args);

                    // Set writable current directory so Python libraries don't fail trying to create dirs/files in system folders
                    if let Ok(app_data) = app_handle.path().app_data_dir() {
                        let _ = std::fs::create_dir_all(&app_data);
                        cmd.current_dir(&app_data);
                    }

                    // Pass models directory to CUDA check process
                    if let Some(models_dir) = commands::system::resolve_models_dir(Some(&app_handle)) {
                        cmd.env("COSMO_MODELS_DIR", &models_dir);
                    }
                    #[cfg(target_os = "windows")]
                    {
                        use std::os::windows::process::CommandExt;
                        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
                    }
                    
                    if let Ok(output) = cmd.output() {
                        let out_str = String::from_utf8_lossy(&output.stdout).trim().to_lowercase();
                        if out_str.contains("cuda") {
                            has_gpu = true;
                        } else if out_str.contains("dml") || out_str.contains("directml") {
                            has_gpu = true;
                            is_dml = true;
                        }
                    }
                }
                
                let mode_str = if has_gpu {
                    if is_dml {
                        "GPU (AMD DirectML)".to_string()
                    } else {
                        "GPU (NVIDIA CUDA)".to_string()
                    }
                } else {
                    "CPU (Bilateral Filter Fallback)".to_string()
                };
                commands::system::set_ai_hardware_status(mode_str);
            });

            // Copy demo files to AppData directory in a background thread so the window shows immediately
            let app_handle_clone = app.handle().clone();
            std::thread::spawn(move || {
                let _ = commands::system::copy_demo_files_to_app_data(&app_handle_clone);
            });

            // Pre-warm AI Enhancement & Upscale Server in background so first upscale is immediately ready
            let app_handle_ai = app.handle().clone();
            std::thread::spawn(move || {
                let _ = commands::media::upscale::spawn_enhancement_server(Some(&app_handle_ai));
            });

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            Ok(())
        });
    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            // Hard exit process immediately to release WebView2 graphics context
            std::process::exit(0);
        }
    });
}
