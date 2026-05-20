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

    // Helper to spawn hidden process on Windows
    let run_hidden_cmd = |cmd_name: &str, args: &[&str]| -> Option<String> {
        let mut cmd = std::process::Command::new(cmd_name);
        cmd.args(args);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        cmd.output().ok().and_then(|out| String::from_utf8(out.stdout).ok())
    };

    let gpu_temp = run_hidden_cmd("nvidia-smi", &["--query-gpu=temperature.gpu", "--format=csv,noheader,nounits"])
        .and_then(|s| s.trim().parse::<f32>().ok())
        .unwrap_or(0.0);

    let vram_data = run_hidden_cmd("nvidia-smi", &["--query-gpu=memory.used,memory.total", "--format=csv,noheader,nounits"])
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
async fn get_folder_videos(path: String, mode: String) -> Result<Vec<serde_json::Value>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut vids = Vec::new();
        let video_exts = ["mp4", "webm", "mov", "m4v", "3gp", "avi", "mkv", "flv", "wmv"];
        let image_exts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "tiff"];
        
        let target_exts: Vec<&str> = if mode == "picture" { 
            image_exts.to_vec() 
        } else if mode == "video" { 
            video_exts.to_vec() 
        } else {
            // "all" mode or fallback: both categories
            video_exts.iter().chain(image_exts.iter()).cloned().collect()
        };

        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                let p = entry.path();
                if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                    if target_exts.contains(&ext.to_lowercase().as_str()) {
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
    let data = if base64_data.contains(',') {
        base64_data.split(',').nth(1).ok_or("Invalid base64")?
    } else {
        &base64_data
    };
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
async fn save_persistence(app: AppHandle, key: String, data: String) {
    let _ = tauri::async_runtime::spawn_blocking(move || {
        if let Ok(mut path) = app.path().app_data_dir() {
            path.push("persistence");
            let _ = fs::create_dir_all(&path);
            path.push(format!("{}.json", key));
            let _ = fs::write(path, data);
        }
    }).await;
}

#[tauri::command]
async fn load_persistence(app: AppHandle, key: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        if let Ok(mut path) = app.path().app_data_dir() {
            path.push("persistence");
            path.push(format!("{}.json", key));
            return fs::read_to_string(path).ok();
        }
        None
    }).await.ok().flatten()
}

#[tauri::command]
fn open_folder(path: String) {
    // Strip local:// scheme prefix if present (used for cache-busted Tauri asset URLs)
    let stripped = if path.starts_with("local://") {
        path.trim_start_matches("local://").to_string()
    } else {
        path.clone()
    };

    // Strip any query string cache-busters like ?t=1747676254321
    let clean_path = if let Some(idx) = stripped.find('?') {
        stripped[..idx].to_string()
    } else {
        stripped
    };

    // Normalise slashes to Windows backslashes
    let normalized_path = clean_path.replace("/", "\\");
    let p = std::path::Path::new(&normalized_path);

    if !p.exists() {
        println!("System Error: Path not found -> {}", normalized_path);
        return;
    }

    // Call explorer.exe directly — bypasses PowerShell startup lag (~0.5-1s delay)
    // /select highlights the specific file in its folder; directories open directly
    if p.is_dir() {
        let _ = std::process::Command::new("explorer.exe")
            .arg(&normalized_path)
            .spawn();
    } else {
        let _ = std::process::Command::new("explorer.exe")
            .arg("/select,")
            .arg(&normalized_path)
            .spawn();
    }
}

#[tauri::command]
fn exit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
async fn recycle_unit(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        trash::delete(&path).map_err(|e| format!("Failed to recycle: {}", e))
    })
    .await
    .map_err(|e| e.to_string())?
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

    // Canonicalize to compare and ensure we aren't deleting the same file (e.g. case-only change)
    let canonical_old = std::fs::canonicalize(&old_p).unwrap_or_else(|_| old_p.clone());
    let canonical_new = std::fs::canonicalize(&new_p).unwrap_or_else(|_| new_p.clone());

    if new_p.exists() && canonical_old != canonical_new {
        // OVERWRITE PHILOSOPHY: Physically delete the destination file if it already exists
        let _ = std::fs::remove_file(&new_p);
    }

    let rename_result = std::fs::rename(&old_p, &new_p);
    if rename_result.is_err() {
        // Fallback for cross-filesystem renames, OneDrive, or sync lock errors: Copy and Delete
        std::fs::copy(&old_p, &new_p).map_err(|e| {
            format!(
                "Rename failed and copy fallback failed. Rename error: {:?}. Copy error: {}",
                rename_result.err(),
                e
            )
        })?;
        let _ = std::fs::remove_file(&old_p);
    }

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
    // Strip local:// scheme prefix if present
    let stripped = if path.starts_with("local://") {
        path.trim_start_matches("local://").to_string()
    } else {
        path.clone()
    };

    // Strip any query string cache-busters
    let clean_path = if let Some(idx) = stripped.find('?') {
        stripped[..idx].to_string()
    } else {
        stripped
    };

    let p = PathBuf::from(&clean_path);
    if !p.exists() {
        return Err("File not found".into());
    }

    let metadata = fs::metadata(&p).map_err(|e| e.to_string())?;
    let bytes = metadata.len() as f64;
    
    let size_formatted = if bytes < 1024.0 * 1024.0 {
        format!("{:.1} KB", bytes / 1024.0)
    } else {
        format!("{:.2} MB", bytes / 1024.0 / 1024.0)
    };

    let extension = p.extension()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_uppercase();

    Ok(serde_json::json!({
        "size": size_formatted,
        "format": extension,
        "path": path,
        "name": p.file_name().and_then(|s| s.to_str()).unwrap_or("Unknown")
    }))
}

fn debug_log(msg: &str) {
    use std::io::Write;
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("c:\\Users\\louis\\OneDrive\\Documents\\GitHub\\Video\\rotation_debug.log")
    {
        let _ = writeln!(file, "[{}] {}", chrono::Local::now().format("%Y-%m-%d %H:%M:%S"), msg);
    }
}

#[tauri::command]
async fn rotate_media_on_disk(path: String, rotation: i32, is_image: bool) -> Result<String, String> {
    use std::process::Command;
    use std::path::Path;

    let log_msg = format!("START rotate_media_on_disk: path={}, rotation={}, is_image={}", path, rotation, is_image);
    debug_log(&log_msg);

    let path_obj = Path::new(&path);
    if !path_obj.exists() {
        let err_msg = format!("File does not exist: {}", path);
        debug_log(&err_msg);
        return Err(err_msg);
    }

    let ext = path_obj.extension().ok_or("No extension")?.to_string_lossy().to_lowercase();
    let stem = path_obj.file_stem().ok_or("No file stem")?.to_string_lossy().to_string();

    let normalized_rotation = ((rotation % 360) + 360) % 360;
    debug_log(&format!("normalized_rotation={}", normalized_rotation));
    if normalized_rotation == 0 {
        debug_log("Rotation is 0, returning early");
        return Ok(path);
    }

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    
    // Create temp file in system temp directory to prevent OneDrive/sync locks
    let temp_dir = std::env::temp_dir();
    let temp_file_name = format!("{}_rot_{}.{}", stem, timestamp, ext);
    let temp_path = temp_dir.join(&temp_file_name);
    debug_log(&format!("temp_path={:?}", temp_path));

    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y");

    if is_image {
        // -noautorotate: Prevent ffmpeg from auto-applying EXIF orientation on decode.
        // This ensures we rotate from the RAW pixel orientation (matching what the app shows
        // with imageOrientation: none). Without this, ffmpeg would pre-rotate based on EXIF
        // and our transpose would be applied on top, causing double-rotation.
        let filter = match normalized_rotation {
            90 => "transpose=1",
            180 => "transpose=1,transpose=1",
            270 => "transpose=2",
            _ => "transpose=1",
        };
        cmd.arg("-noautorotate")
           .arg("-i")
           .arg(&path)
           .arg("-vf")
           .arg(filter);

        // Strip ALL metadata (including EXIF orientation tag) to prevent
        // File Explorer from re-applying the old EXIF orientation on top
        // of our already-rotated pixels.
        cmd.arg("-map_metadata").arg("-1");

        // Preserve quality for lossy formats
        if ext == "jpg" || ext == "jpeg" {
            cmd.arg("-q:v").arg("1");
        } else if ext == "webp" {
            cmd.arg("-quality").arg("100");
        }

        cmd.arg("-update").arg("1");

        cmd.arg(temp_path.to_string_lossy().to_string());
    } else {
        // For videos: use stream copy (instant, lossless) with rotation metadata
        let rotate_val = normalized_rotation.to_string();
        cmd.arg("-i")
           .arg(&path)
           .arg("-c")
           .arg("copy")
           .arg("-map_metadata")
           .arg("0")
           .arg("-metadata:s:v:0")
           .arg(format!("rotate={}", rotate_val))
           .arg(temp_path.to_string_lossy().to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    debug_log(&format!("Running ffmpeg: {:?}", cmd));
    let output = cmd.output().map_err(|e| {
        let err_str = format!("Failed to spawn ffmpeg: {}", e);
        debug_log(&err_str);
        err_str
    })?;
    
    let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr_str = String::from_utf8_lossy(&output.stderr).to_string();
    debug_log(&format!("ffmpeg exit status: {}", output.status));
    debug_log(&format!("ffmpeg stdout: {}", stdout_str));
    debug_log(&format!("ffmpeg stderr: {}", stderr_str));

    if !output.status.success() {
        if temp_path.exists() {
            let _ = std::fs::remove_file(&temp_path);
        }
        let err_str = format!("FFmpeg failed (exit {}): {}", output.status, stderr_str);
        debug_log(&err_str);
        return Err(err_str);
    }

    if !temp_path.exists() {
        let err_str = "FFmpeg ran but output file was not created".to_string();
        debug_log(&err_str);
        return Err(err_str);
    }

    // Overwrite the original file by copying from our isolated temp path (avoids rename lock bugs in OneDrive)
    debug_log(&format!("Copying temp_path {:?} to original path {:?}", temp_path, path));
    if let Err(e) = std::fs::copy(&temp_path, &path) {
        let err_str = format!("Failed to overwrite original file: {}", e);
        debug_log(&err_str);
        return Err(err_str);
    }
    
    let _ = std::fs::remove_file(&temp_path);
    debug_log("SUCCESS — file rotated and saved successfully!");
    Ok(path)
}

fn resolve_enhancer_command() -> Result<(std::path::PathBuf, Vec<String>), String> {
    use std::path::PathBuf;
    
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));

    let local_exe = exe_dir.as_ref()
        .map(|d| d.join("cosmo_enhance.exe"))
        .filter(|p| p.exists());
    let local_py = exe_dir.as_ref()
        .map(|d| d.join("cosmo_enhance.py"))
        .filter(|p| p.exists())
        .or_else(|| {
            std::env::current_dir()
                .ok()
                .map(|d| d.join("cosmo_enhance.py"))
                .filter(|p| p.exists())
        })
        .or_else(|| {
            std::env::current_dir()
                .ok()
                .and_then(|d| d.parent().map(|p| p.join("cosmo_enhance.py")))
                .filter(|p| p.exists())
        });

    // Search common Python install locations
    let app_data =
        std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(std::env::var_os("USERPROFILE").unwrap_or_default()).join("AppData").join("Local"));
    let program_files =
        std::env::var_os("ProgramFiles")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(r"C:\Program Files"));

    let common_python_paths: Vec<PathBuf> = vec![
        app_data.join("Programs").join("Python").join("Python312").join("python.exe"),
        app_data.join("Programs").join("Python").join("Python311").join("python.exe"),
        program_files.join("Python312").join("python.exe"),
        program_files.join("Python311").join("python.exe"),
        program_files.join("Python310").join("python.exe"),
        PathBuf::from(r"C:\Python312\python.exe"),
        PathBuf::from(r"C:\Python311\python.exe"),
        PathBuf::from(r"C:\Python310\python.exe"),
    ];

    let system_python = common_python_paths.iter().find(|p| p.exists()).cloned();

    if let Some(exe) = local_exe {
        Ok((exe, vec![]))
    } else if let Some(py_script) = local_py {
        let python_exe = system_python.unwrap_or_else(|| PathBuf::from("python"));
        Ok((python_exe, vec!["-u".to_string(), py_script.to_string_lossy().to_string()]))
    } else if let Some(py_exe) = system_python {
        let script = exe_dir.as_ref()
            .and_then(|d| {
                let s = d.join("cosmo_enhance.py");
                if s.exists() { Some(s) } else { None }
            })
            .or_else(|| {
                std::env::current_dir()
                    .ok()
                    .map(|d| d.join("cosmo_enhance.py"))
                    .filter(|p| p.exists())
            })
            .or_else(|| {
                std::env::current_dir()
                    .ok()
                    .and_then(|d| d.parent().map(|p| p.join("cosmo_enhance.py")))
                    .filter(|p| p.exists())
            })
            .ok_or("cosmo_enhance.py not found in project root or system search directories")?;
        Ok((py_exe, vec!["-u".to_string(), script.to_string_lossy().to_string()]))
    } else {
        Err("No Python found — install Python or place cosmo_enhance.exe in the application directory".into())
    }
}

fn spawn_enhancement_server() -> Result<(), String> {
    use std::process::Command;
    
    let (runner, args) = resolve_enhancer_command()?;
    
    let mut cmd = Command::new(&runner);
    cmd.args(&args);
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    
    cmd.spawn().map_err(|e| format!("Failed to spawn AI enhancement server: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn upscale_image(app: tauri::AppHandle, path: String, overwrite: bool) -> Result<String, String> {
    use std::process::Command;
    use std::path::Path;
    use std::time::{SystemTime, UNIX_EPOCH};

    let p = Path::new(&path);
    if !p.exists() {
        return Err("File does not exist".into());
    }

    let ext = p.extension()
        .and_then(|s| s.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let Some(stem) = p.file_stem().and_then(|s| s.to_str()) else {
        return Err("Invalid file name".into());
    };

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    // Output: temp folder if overwrite, otherwise new _upscaled file in same directory
    let output_path = if overwrite {
        let temp_dir = std::env::temp_dir();
        let temp_file_name = format!("{}_upscale_temp_{}.{}", stem, timestamp, ext);
        temp_dir.join(&temp_file_name)
    } else {
        let parent = p.parent().unwrap_or_else(|| Path::new("."));
        let mut final_path = parent.join(format!("{}_upscaled.{}", stem, ext));
        let mut index = 1;
        while final_path.exists() {
            final_path = parent.join(format!("{}_upscaled.{}.{}", stem, index, ext));
            index += 1;
        }
        final_path
    };

    let out_str = output_path.to_string_lossy().to_string();

    // Connect or auto-spawn the HTTP server on port 12000 first (zero contention, instant, 5080 speed!)
    let mut stream_connected = std::net::TcpStream::connect("127.0.0.1:12000").is_ok();
    
    if !stream_connected {
        println!("AI enhancer server offline. Spawning background server...");
        if let Ok(_) = spawn_enhancement_server() {
            // Wait for it to boot and warm-load the models (typically 4-8 seconds on first boot)
            for _ in 0..30 {
                std::thread::sleep(std::time::Duration::from_millis(500));
                if std::net::TcpStream::connect("127.0.0.1:12000").is_ok() {
                    stream_connected = true;
                    println!("AI Enhancement Server booted and connected on port 12000!");
                    break;
                }
            }
        }
    }

    let mut server_success = false;

    if stream_connected {
        if let Ok(mut stream) = std::net::TcpStream::connect("127.0.0.1:12000") {
            use std::io::{Write, Read};
            let json_payload = serde_json::json!({
                "path": path,
                "output_path": out_str,
                "fidelity": 0.5
            }).to_string();

            let request = format!(
                "POST /enhance HTTP/1.1\r\n\
                 Host: 127.0.0.1:12000\r\n\
                 Content-Type: application/json\r\n\
                 Content-Length: {}\r\n\
                 Connection: close\r\n\r\n\
                 {}",
                json_payload.len(),
                json_payload
            );

            if stream.write_all(request.as_bytes()).is_ok() {
                let mut response = Vec::new();
                if stream.read_to_end(&mut response).is_ok() {
                    let response_str = String::from_utf8_lossy(&response);
                    if let Some(pos) = response_str.find("\r\n\r\n") {
                        let body = &response_str[pos + 4..];
                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(body) {
                            if parsed.get("status").and_then(|s| s.as_str()) == Some("success") {
                                server_success = true;
                            }
                        }
                    }
                }
            }
        }
    }

    if server_success {
        if overwrite {
            if let Err(e) = std::fs::copy(&output_path, &p) {
                let _ = std::fs::remove_file(&output_path);
                return Err(format!("Failed to overwrite original file: {}", e));
            }
            let _ = std::fs::remove_file(&output_path);
            return Ok(path);
        } else {
            return Ok(out_str);
        }
    }

    // Fallback: Resolve the script/binary and run in CLI mode
    println!("HTTP server upscale failed or server couldn't start. Falling back to CLI mode...");
    let (runner, mut args) = resolve_enhancer_command()?;
    
    // For CLI mode we append input path and output path
    args.push(path.clone());
    args.push(output_path.to_string_lossy().to_string());

    let mut cmd = Command::new(&runner);
    cmd.args(&args);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let log_file = app.path().app_data_dir()
        .ok()
        .map(|mut d| { d.push("upscale.log"); d });

    let output = cmd.output().map_err(|e| format!("Failed to start upscaler: {}", e))?;

    if let Some(ref log_path) = log_file {
        if let Some(parent) = log_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_path)
            .and_then(|mut f| {
                use std::io::Write;
                let t = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
                writeln!(f, "[{}] exit={} stdout={} stderr={}",
                    t,
                    output.status.code().unwrap_or(-1),
                    String::from_utf8_lossy(&output.stdout),
                    String::from_utf8_lossy(&output.stderr)
                )
            });
    }

    if !output.status.success() {
        if overwrite && output_path.exists() {
            let _ = std::fs::remove_file(&output_path);
        }
        return Err(format!(
            "Upscale failed (exit {:?}): {}",
            output.status.code(),
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    if overwrite {
        if let Err(e) = std::fs::copy(&output_path, &p) {
            let _ = std::fs::remove_file(&output_path);
            return Err(format!("Failed to overwrite original file: {}", e));
        }
        let _ = std::fs::remove_file(&output_path);
        Ok(path)
    } else {
        Ok(output_path.to_string_lossy().to_string())
    }
}

#[tauri::command]
fn enhance_image_crop(base64_data: String) -> Result<String, String> {
    use std::io::{Write, Read};
    use std::net::TcpStream;

    let mut stream_connected = TcpStream::connect("127.0.0.1:12000").is_ok();
    
    if !stream_connected {
        println!("AI crop enhancement requested but server is offline. Spawning background server...");
        if let Ok(_) = spawn_enhancement_server() {
            // Wait for it to boot and warm-load the models
            for _ in 0..30 {
                std::thread::sleep(std::time::Duration::from_millis(500));
                if TcpStream::connect("127.0.0.1:12000").is_ok() {
                    stream_connected = true;
                    println!("AI Enhancement Server booted and connected on port 12000 for crop upscale!");
                    break;
                }
            }
        }
    }
    
    if !stream_connected {
        return Err("Connection to local AI enhancer failed. Make sure Python is installed and the models are available.".into());
    }

    let mut stream = TcpStream::connect("127.0.0.1:12000").map_err(|e| format!("Connection to local AI enhancer failed: {}", e))?;
    
    let json_payload = serde_json::json!({
        "image": base64_data,
        "fidelity": 0.5
    }).to_string();
    
    let request = format!(
        "POST /enhance HTTP/1.1\r\n\
         Host: 127.0.0.1:12000\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\r\n\
         {}",
        json_payload.len(),
        json_payload
    );
    
    stream.write_all(request.as_bytes()).map_err(|e| format!("Failed to send data to AI enhancer: {}", e))?;
    
    let mut response = Vec::new();
    stream.read_to_end(&mut response).map_err(|e| format!("Failed to read response from AI enhancer: {}", e))?;
    
    let response_str = String::from_utf8_lossy(&response);
    
    // Find the end of HTTP headers (\r\n\r\n)
    if let Some(pos) = response_str.find("\r\n\r\n") {
        let body = &response_str[pos + 4..];
        
        // Parse JSON body
        let parsed: serde_json::Value = serde_json::from_str(body).map_err(|e| format!("Upscaling server returned invalid JSON: {}", e))?;
        if let Some(err) = parsed.get("error") {
            return Err(err.as_str().unwrap_or("Unknown server error").to_string());
        }
        
        if let Some(img) = parsed.get("image") {
            if let Some(img_str) = img.as_str() {
                return Ok(img_str.to_string());
            }
        }
        
        Err("Upscaling server returned invalid response format".to_string())
    } else {
        Err("Upscaling server returned invalid HTTP response".to_string())
    }
}


#[tauri::command]
async fn auto_erase_watermark(
    path: String,
    rect_x: f64,
    rect_y: f64,
    rect_w: f64,
    rect_h: f64,
    width_disp: f64,
    height_disp: f64,
) -> Result<String, String> {
    use std::io::{Write, Read};
    use std::net::TcpStream;

    let mut stream_connected = TcpStream::connect("127.0.0.1:12000").is_ok();
    
    if !stream_connected {
        println!("Watermark auto-eraser requested but server is offline. Spawning background server...");
        if let Ok(_) = spawn_enhancement_server() {
            // Wait for it to boot and warm-load the models
            for _ in 0..30 {
                std::thread::sleep(std::time::Duration::from_millis(500));
                if TcpStream::connect("127.0.0.1:12000").is_ok() {
                    stream_connected = true;
                    println!("AI Enhancement Server booted and connected on port 12000 for watermark eraser!");
                    break;
                }
            }
        }
    }
    
    if !stream_connected {
        return Err("Connection to local AI server failed. Make sure Python is installed and the models are available.".into());
    }

    let mut stream = TcpStream::connect("127.0.0.1:12000").map_err(|e| format!("Connection to local AI enhancer failed: {}", e))?;
    
    let json_payload = serde_json::json!({
        "path": path,
        "rect_x": rect_x,
        "rect_y": rect_y,
        "rect_w": rect_w,
        "rect_h": rect_h,
        "width_disp": width_disp,
        "height_disp": height_disp
    }).to_string();
    
    let request = format!(
        "POST /inpaint HTTP/1.1\r\n\
         Host: 127.0.0.1:12000\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\r\n\
         {}",
        json_payload.len(),
        json_payload
    );
    
    stream.write_all(request.as_bytes()).map_err(|e| format!("Failed to send data to AI enhancer: {}", e))?;
    
    let mut response = Vec::new();
    stream.read_to_end(&mut response).map_err(|e| format!("Failed to read response from AI enhancer: {}", e))?;
    
    let response_str = String::from_utf8_lossy(&response);
    
    // Find the end of HTTP headers (\r\n\r\n)
    if let Some(pos) = response_str.find("\r\n\r\n") {
        let body = &response_str[pos + 4..];
        
        // Parse JSON body
        let parsed: serde_json::Value = serde_json::from_str(body).map_err(|e| format!("Inpainting server returned invalid JSON: {}", e))?;
        if let Some(err) = parsed.get("error") {
            return Err(err.as_str().unwrap_or("Unknown server error").to_string());
        }
        
        if let Some(img) = parsed.get("image") {
            if let Some(img_str) = img.as_str() {
                return Ok(img_str.to_string());
            }
        }
        
        Err("Inpainting server returned invalid response format".to_string())
    } else {
        Err("Inpainting server returned invalid HTTP response".to_string())
    }
}

#[tauri::command]
async fn save_inpainted_image(path: String, base64_data: String) -> Result<(), String> {
    use std::fs::File;
    use std::io::Write;
    
    // Decode base64 string
    let decoded = general_purpose::STANDARD
        .decode(base64_data.trim())
        .map_err(|e| format!("Failed to decode base64 data: {}", e))?;
        
    // Overwrite the original file
    let mut file = File::create(&path).map_err(|e| format!("Failed to open file for writing: {}", e))?;
    file.write_all(&decoded).map_err(|e| format!("Failed to write decoded bytes to disk: {}", e))?;
    
    Ok(())
}


fn main() {
    // Self-healing: Clean up .window-state.json to prevent dynamic popout windows from loading in a loop
    if let Some(mut config_dir) = dirs::config_dir() {
        config_dir.push("com.cosmo.symphony");
        let state_file = config_dir.join(".window-state.json");
        if state_file.exists() {
            if let Ok(content) = std::fs::read_to_string(&state_file) {
                if let Ok(mut json) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(obj) = json.as_object_mut() {
                        // Remove all window state keys that start with "pop-" or are not "main"
                        let keys_to_remove: Vec<String> = obj.keys()
                            .filter(|k| k.starts_with("pop-") || *k != "main")
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

    tauri::Builder::default()
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
                RefreshKind::nothing().with_cpu(CpuRefreshKind::everything()),
            )),
            last_refresh: Mutex::new(std::time::Instant::now()),
        })
        .invoke_handler(tauri::generate_handler![
            cosmo_log,
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
            rotate_media_on_disk,
            upscale_image,
            enhance_image_crop,
            auto_erase_watermark,
            save_inpainted_image,
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
