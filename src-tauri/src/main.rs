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
    pub watcher: std::sync::Mutex<Option<(String, notify::RecommendedWatcher)>>,
}

fn spawn_symphony_backend() {
    std::thread::spawn(move || {
        // 1. Check if port 8005 is already active (matches studio_agent.py uvicorn port)
        if std::net::TcpStream::connect("127.0.0.1:8005").is_ok() {
            println!("Symphony Backend already online on port 8005.");
            return;
        }

        // 2. Kill any zombie python process holding port 8005 from a previous unclean shutdown.
        //    This prevents Errno 10048 "address already in use" on next startup.
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            let kill_result = std::process::Command::new("powershell.exe")
                .args(&[
                    "-NoProfile", "-Command",
                    "Get-NetTCPConnection -LocalPort 8005 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
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
            println!("Cosmo Protocol Request: {}", uri_str);
            let path_raw = uri_str
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
                Err(_) => return tauri::http::Response::builder().status(400).body(Vec::new()).unwrap(),
            };

            // Remove any leading slashes or backslashes that arise from Webview2 custom scheme normalization
            let mut clean_path = path_decoded.as_str();
            while clean_path.starts_with('/') || clean_path.starts_with('\\') {
                clean_path = &clean_path[1..];
            }

            // SECURITY: Proper path traversal prevention with canonicalization
            let mut components = Vec::new();
            let mut has_prefix = false;
            
            for component in std::path::Path::new(&clean_path).components() {
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

            // Progressive streaming logic with a safe chunk cap (4MB) to prevent OOM
            let mut end = end;
            let max_chunk = 4 * 1024 * 1024; // 4MB maximum buffer allocation size
            if end - start + 1 > max_chunk as u64 {
                end = start + max_chunk as u64 - 1;
            }
            if end >= file_len {
                end = file_len.saturating_sub(1);
            }

            let chunk_size = (end - start + 1) as usize;
            
            let mime = match path.extension().and_then(|s| s.to_str()).map(|s| s.to_lowercase()).as_deref().unwrap_or("") {
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
                    .unwrap();
            }

            buffer.truncate(bytes_read);
            let response_end = start + bytes_read as u64 - 1;

            tauri::http::Response::builder()
                .status(if start > 0 || bytes_read < file_len as usize { 206 } else { 200 })
                .header("Content-Type", mime)
                .header("Accept-Ranges", "bytes")
                .header("Content-Length", bytes_read)
                .header("Content-Range", format!("bytes {}-{}/{}", start, response_end, file_len))
                .header("Access-Control-Allow-Origin", "*")
                .header("Access-Control-Allow-Methods", "GET, OPTIONS, RANGE")
                .header("Access-Control-Allow-Headers", "Range, Content-Type")
                .header("Access-Control-Allow-Private-Network", "true")
                .body(buffer)
                .unwrap()
        })
        .manage(AppState {
            sys: Mutex::new(System::new_with_specifics(
                sysinfo::RefreshKind::nothing().with_cpu(sysinfo::CpuRefreshKind::everything()),
            )),
            last_refresh: Mutex::new(std::time::Instant::now()),
        })
        .manage(LaunchArgs(Mutex::new(None)))
        .manage(DirectoryWatcherState { watcher: std::sync::Mutex::new(None) })
        .invoke_handler(tauri::generate_handler![
            commands::filesystem::watch_directory,
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
            commands::media::get_drag_icon_path,
            commands::media::extract_subject_on_disk,
            commands::media::upscale_image,
            commands::media::generate_store_logos,
            commands::media::enhance_image_crop,
            commands::media::auto_erase_watermark,
            commands::media::save_inpainted_image,
            commands::system::get_ai_hardware_status,
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
            commands::media::resize_image_on_disk,
            commands::filesystem::secure_delete_file,
            commands::system::exit_app,
            commands::system::check_dependencies,
            commands::system::install_dependencies,
            commands::system::install_gpu_pack,
            commands::system::download_models,
            commands::media::convert_heic_to_jpg,
            commands::media::convert_media_to_standard,
            commands::system::open_external_url,
            commands::media::upscale_video,
            commands::media::cancel_video_upscale,
            commands::filesystem::get_file_stats,
            commands::server::set_wifi_shared_files,
            commands::server::download_shared_file_to_downloads
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
            let dist_path = resource_path.join("resources").join("wifi-share-web");

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
                let _ = commands::system::AI_HARDWARE_MODE.set(mode_str);
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

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            println!("Cosmo Symphony: Running secure forensic cleanup of temp files...");
            let _ = commands::server::secure_cleanup_on_exit(app_handle);
            std::process::exit(0);
        }
    });
}
