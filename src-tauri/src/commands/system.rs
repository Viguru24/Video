use std::sync::OnceLock;
use std::path::PathBuf;
use std::fs;
use tauri::{AppHandle, Manager, State, Window, Emitter, WebviewWindowBuilder, WebviewUrl};
use crate::{AppState, LaunchArgs};

pub static AI_HARDWARE_MODE: OnceLock<String> = OnceLock::new();

fn clean_path(path: &std::path::Path) -> String {
    path.to_string_lossy().replace("\\\\?\\", "")
}

#[cfg(windows)]
use std::os::windows::process::CommandExt;

fn new_hidden_command<S: AsRef<std::ffi::OsStr>>(program: S) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    #[cfg(windows)]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct DepsStatus {
    pub python_ok: bool,
    pub packages_ok: bool,
    pub models_ok: bool,
    pub gpu_pack_ok: bool,
    pub venv_path: String,
    pub models_path: String,
}

#[derive(serde::Serialize, Clone)]
pub struct SetupProgressEvent {
    pub step: String,
    pub message: String,
    pub percent: u32,
    pub done: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub fn get_telemetry(state: State<AppState>) -> serde_json::Value {
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
pub fn get_launch_args(state: State<LaunchArgs>) -> Option<String> {
    if let Ok(mut guard) = state.0.lock() {
        guard.take()
    } else {
        None
    }
}

#[tauri::command]
pub fn cosmo_log(app: AppHandle, msg: String) {
    if let Ok(mut log_path) = app.path().app_data_dir() {
        log_path.push("cosmo_activity.log");

        if let Some(parent) = log_path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
        let line = format!("[{}] {}\n", timestamp, msg);
        if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(log_path) {
            use std::io::Write;
            let _ = file.write_all(line.as_bytes());
        }
    }
}

#[tauri::command]
pub fn exit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub async fn set_always_on_top(app: AppHandle, flag: bool) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(flag);
    }
}

#[tauri::command]
pub async fn pop_out(app: AppHandle, _url: String, title: String) -> Result<(), String> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let label = format!("pop-{}", timestamp);

    // Clean up any existing pop-out windows to ensure only one is active at a time.
    // Because the new window uses a unique timestamp-based label, there will be no
    // namespace clash during construction.
    for win in app.webview_windows().values() {
        let win_label = win.label();
        if win_label.starts_with("pop-") {
            let _ = win.destroy();
        }
    }

    println!("Creating dynamic pop-out window with label: {}", label);
    let parsed_url = WebviewUrl::App("index.html".into());
    
    let win_builder = WebviewWindowBuilder::new(&app, &label, parsed_url)
        .title(&title)
        .inner_size(850.0, 500.0)
        .resizable(true)
        .decorations(false)
        .maximized(false)
        .fullscreen(false)
        .additional_browser_args("--enable-gpu-rasterization --enable-zero-copy --ignore-gpu-blocklist --enable-features=SharedArrayBuffer --autoplay-policy=no-user-gesture-required");

    match win_builder.build() {
        Ok(window) => {
            let _ = window.show();
            let _ = window.set_focus();
            println!("Successfully created same-process pop-out window: {}", label);
            Ok(())
        }
        Err(e) => {
            eprintln!("Failed to create popout window: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn close_popout(window: tauri::Window) {
    let _ = window.destroy();
}

#[tauri::command]
pub fn get_popout_url() -> Option<String> {
    crate::POPOUT_MEDIA_URL.get().cloned()
}

#[tauri::command]
pub fn get_ai_hardware_status() -> String {
    AI_HARDWARE_MODE.get().cloned().unwrap_or_else(|| "Detecting...".to_string())
}

#[tauri::command]
pub async fn span_all_monitors(window: Window) -> Result<(), String> {
    println!("--- span_all_monitors triggered ---");
    let monitors = window.available_monitors().map_err(|e| {
        println!("Error getting available monitors: {}", e);
        e.to_string()
    })?;
    println!("Found {} monitors", monitors.len());
    for (i, m) in monitors.iter().enumerate() {
        println!("  Monitor [{}]: Name={:?}, Position={:?}, Size={:?}, ScaleFactor={}", i, m.name(), m.position(), m.size(), m.scale_factor());
    }

    if monitors.is_empty() {
        return Err("No monitors found".into());
    }

    let mut min_x = i32::MAX;
    let mut min_y = i32::MAX;
    let mut max_x = i32::MIN;
    let mut max_y = i32::MIN;

    for m in &monitors {
        let pos = m.position();
        let size = m.size();
        let x1 = pos.x;
        let y1 = pos.y;
        let x2 = pos.x + size.width as i32;
        let y2 = pos.y + size.height as i32;

        if x1 < min_x { min_x = x1; }
        if y1 < min_y { min_y = y1; }
        if x2 > max_x { max_x = x2; }
        if y2 > max_y { max_y = y2; }
    }

    let width = (max_x - min_x) as u32;
    let height = (max_y - min_y) as u32;
    println!("Calculated Spanning Area: x={}, y={}, width={}, height={}", min_x, min_y, width, height);

    let _ = window.unmaximize();
    std::thread::sleep(std::time::Duration::from_millis(150));

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::{SetWindowPos, SWP_NOZORDER, SWP_NOACTIVATE, SWP_FRAMECHANGED};
        use windows::Win32::Foundation::HWND;

        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        let hwnd = HWND(hwnd.0 as *mut std::ffi::c_void);
        unsafe {
            SetWindowPos(
                hwnd,
                None,
                min_x,
                min_y,
                width as i32,
                height as i32,
                SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
            ).map_err(|e| e.to_string())?;
        }
        println!("--- span_all_monitors complete (Win32 SetWindowPos) ---");
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = window.set_decorations(false);
        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x: min_x, y: min_y }));
        let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize { width, height }));
        println!("--- span_all_monitors complete (fallback) ---");
    }

    Ok(())
}

#[tauri::command]
pub async fn unspan_monitors(window: Window) -> Result<(), String> {
    println!("--- unspan_monitors triggered ---");
    if let Err(e) = window.set_decorations(false) {
        println!("  set_decorations error: {}", e);
    }
    if let Err(e) = window.set_size(tauri::Size::Physical(tauri::PhysicalSize { width: 1280, height: 720 })) {
        println!("  set_size error: {}", e);
    }
    if let Err(e) = window.center() {
        println!("  center error: {}", e);
    }
    println!("--- unspan_monitors complete ---");
    Ok(())
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    open_url(&url)
}

fn open_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("cmd");
        cmd.args(["/C", "start", "", url]);
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        cmd.output().map(|_| ()).map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("open")
            .arg(url)
            .output()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

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
        // Directory
        let mut size = 0;
        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten() {
                size += entry.metadata().map(|m| m.len()).unwrap_or(0);
                if entry.path().is_dir() {
                    // Simple nested traversal
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

    // Kill any active running cosmo_enhance background processes before deleting files
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

    // Update frontend state
    let _ = app.emit("setup-progress", SetupProgressEvent {
        step: "uninstalled".to_string(),
        message: "AI Add-ons removed".to_string(),
        percent: 0,
        done: false,
        error: None,
    });

    Ok(report)
}

pub fn cosmo_venv_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let install_dir = resolve_install_dir(app);
    Some(install_dir.join("cosmo_venv"))
}

pub fn cosmo_models_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let install_dir = resolve_install_dir(app);
    Some(install_dir.join(".cosmo_models"))
}

pub fn resolve_studio_venv_python() -> Option<PathBuf> {
    // Only scan local developer sibling directories in debug builds.
    // In release/Store (MSIX) builds this would leak the developer's local paths
    // to end-user machines and cause silent fallback to wrong Python environments.
    #[cfg(debug_assertions)]
    {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(exe_dir) = exe.parent() {
                let mut check_dir = Some(exe_dir);
                while let Some(dir) = check_dir {
                    let sibling_studio = dir.join("CosmoStudio");
                    let venv_py = sibling_studio.join(".venv").join("Scripts").join("python.exe");
                    if venv_py.exists() {
                        return Some(venv_py);
                    }
                    check_dir = dir.parent();
                }
            }
        }

        if let Ok(current_dir) = std::env::current_dir() {
            let mut check_dir = Some(current_dir.as_path());
            while let Some(dir) = check_dir {
                let sibling_studio = dir.join("CosmoStudio");
                let venv_py = sibling_studio.join(".venv").join("Scripts").join("python.exe");
                if venv_py.exists() {
                    return Some(venv_py);
                }
                check_dir = dir.parent();
            }
        }
    }

    None
}

pub fn resolve_python_exe() -> PathBuf {
    let app_data = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(std::env::var_os("USERPROFILE").unwrap_or_default()).join("AppData").join("Local"));
    let program_files = std::env::var_os("ProgramFiles")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\Program Files"));

    let cosmo_venv_python = app_data.join("cosmo_venv").join("Scripts").join("python.exe");
    if cosmo_venv_python.exists() {
        return cosmo_venv_python;
    }

    if let Some(venv_py) = resolve_studio_venv_python() {
        return venv_py;
    }

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

    for path in common_python_paths {
        if path.exists() {
            return path;
        }
    }

    PathBuf::from("python")
}

pub fn check_python_gpu_and_packages(py_path: &std::path::Path) -> bool {
    let check_script = "import sys, torch; \
                        has_gpu = torch.cuda.is_available(); \
                        if not has_gpu: \
                            try: \
                                import torch_directml; \
                                if torch_directml.is_available(): has_gpu = True; \
                            except: pass; \
                        if not has_gpu: sys.exit(1); \
                        import cv2, numpy, basicsr, realesrgan, gfpgan; \
                        sys.exit(0)";
    
    let mut cmd = std::process::Command::new(py_path);
    cmd.args(["-c", check_script]);
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    
    if let Ok(output) = cmd.output() {
        output.status.success()
    } else {
        false
    }
}

pub fn resolve_enhancer_command(app: Option<&AppHandle>) -> Result<(PathBuf, Vec<String>), String> {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));

    // Priority 0: Pre-built bundles (downloaded by install_dependencies / install_gpu_pack).
    // Check these FIRST — no Python subprocess needed, and avoids startup blocking/crashes.
    // GPU pack (CUDA) wins over CPU pack when both are present.
    let gpu_bundle_exe = app.map(|a| {
        resolve_install_dir(a).join("cosmo_enhance_gpu").join("cosmo_enhance.exe")
    }).filter(|p| p.exists());

    if let Some(exe) = gpu_bundle_exe {
        return Ok((exe, vec![]));
    }

    let cpu_bundle_exe = app.map(|a| {
        resolve_install_dir(a).join("cosmo_enhance").join("cosmo_enhance.exe")
    }).filter(|p| p.exists());

    if let Some(exe) = cpu_bundle_exe {
        return Ok((exe, vec![]));
    }

    let resource_py = app.and_then(|a| {
        a.path().resource_dir().ok().map(|d| d.join("resources").join("cosmo_enhance.py")).filter(|p| p.exists())
    });

    let local_exe = exe_dir.as_ref()
        .map(|d| d.join("cosmo_enhance.exe"))
        .filter(|p| p.exists());

    let local_py = resource_py.or_else(|| {
        exe_dir.as_ref()
            .map(|d| d.join("cosmo_enhance.py"))
            .filter(|p| p.exists())
    }).or_else(|| {
        std::env::current_dir()
            .ok()
            .map(|d| d.join("cosmo_enhance.py"))
            .filter(|p| p.exists())
    }).or_else(|| {
        std::env::current_dir()
            .ok()
            .and_then(|d| d.parent().map(|p| p.join("cosmo_enhance.py")))
            .filter(|p| p.exists())
    });

    let cosmo_venv_python = app.map(|a| {
        resolve_install_dir(a).join("cosmo_venv").join("Scripts").join("python.exe")
    }).filter(|p| p.exists());

    let studio_venv_python = resolve_studio_venv_python();

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

    // Priority 1: cosmo_venv always wins — it has the packages we installed (rembg, basicsr, etc.)
    // Only fall back to studio_venv if cosmo_venv doesn't exist.
    let mut system_python = None;

    if let Some(ref p) = cosmo_venv_python {
        if check_python_gpu_and_packages(p) {
            system_python = Some(p.clone());
        }
    }

    if system_python.is_none() {
        for path in &common_python_paths {
            if path.exists() && check_python_gpu_and_packages(path) {
                system_python = Some(path.clone());
                break;
            }
        }
    }

    if system_python.is_none() {
        if let Some(ref p) = studio_venv_python {
            if check_python_gpu_and_packages(p) {
                system_python = Some(p.clone());
            }
        }
    }

    // Priority 2: Fallback — cosmo_venv first, then system paths, studio_venv last resort
    let system_python = system_python
        .or(cosmo_venv_python)
        .or_else(|| common_python_paths.iter().find(|p| p.exists()).cloned())
        .or(studio_venv_python);

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

pub fn resolve_models_dir(app: Option<&AppHandle>) -> Option<String> {
    if let Some(app) = app {
        if let Ok(mut app_data) = app.path().app_data_dir() {
            app_data.push(".cosmo_models");
            if app_data.join("RealESRGAN_x4plus.pth").exists() {
                return Some(app_data.to_string_lossy().to_string());
            }
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let mut dir = Some(exe_dir);
            while let Some(d) = dir {
                let candidate = d.join(".cosmo_models");
                if candidate.join("RealESRGAN_x4plus.pth").exists() && candidate.join("GFPGANv1.4.pth").exists() {
                    return Some(candidate.to_string_lossy().to_string());
                }
                dir = d.parent();
            }
        }
    }
    None
}

#[tauri::command]
pub async fn check_dependencies(app: AppHandle) -> Result<DepsStatus, String> {
    let app_data = resolve_install_dir(&app);
    let default_venv_path = app_data.join("cosmo_venv");
    let default_venv_python = default_venv_path.join("Scripts").join("python.exe");
    let default_models_path = app_data.join(".cosmo_models");

    let studio_venv_python = resolve_studio_venv_python();

    let (venv_python, venv_path) = if let Some(studio_py) = studio_venv_python {
        let path_folder = studio_py.parent().and_then(|p| p.parent()).map(|p| p.to_path_buf()).unwrap_or_else(|| default_venv_path.clone());
        (studio_py, path_folder)
    } else {
        (default_venv_python, default_venv_path)
    };

    let realesrgan_model = default_models_path.join("RealESRGAN_x4plus.pth");
    let gfpgan_model = default_models_path.join("GFPGANv1.4.pth");
    let mut models_ok = realesrgan_model.exists() && gfpgan_model.exists();
    let mut resolved_models_path = default_models_path;

    if !models_ok {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(exe_dir) = exe.parent() {
                let mut dir = Some(exe_dir);
                while let Some(d) = dir {
                    let candidate = d.join(".cosmo_models");
                    if candidate.join("RealESRGAN_x4plus.pth").exists() && candidate.join("GFPGANv1.4.pth").exists() {
                        models_ok = true;
                        resolved_models_path = candidate;
                        break;
                    }
                    dir = d.parent();
                }
            }
        }
    }

    // Check for pre-built base bundle (CPU, auto-installed)
    let base_bundle_ok = app_data.join("cosmo_enhance").join("cosmo_enhance.exe").exists();

    // Check for GPU acceleration pack (CUDA, user-triggered)
    let gpu_pack_ok = app_data.join("cosmo_enhance_gpu").join("cosmo_enhance.exe").exists();

    // python_ok / packages_ok: report based on whichever bundle is present
    let python_ok   = base_bundle_ok || gpu_pack_ok || venv_python.exists();
    let packages_ok = base_bundle_ok || gpu_pack_ok || (python_ok && {
        let result = std::process::Command::new(&venv_python)
            .args([
                "-c",
                "import sys, types; \
                 import torchvision; \
                 ft = types.ModuleType('torchvision.transforms.functional_tensor'); \
                 ft.rgb_to_grayscale = torchvision.transforms.functional.rgb_to_grayscale; \
                 sys.modules['torchvision.transforms.functional_tensor'] = ft; \
                 import cv2, numpy, torch, basicsr; \
                 print('ok')"
            ])
            .output();
        result
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).contains("ok"))
            .unwrap_or(false)
    });

    Ok(DepsStatus {
        python_ok,
        packages_ok,
        models_ok,
        gpu_pack_ok,
        venv_path: venv_path.to_string_lossy().to_string(),
        models_path: resolved_models_path.to_string_lossy().to_string(),
    })
}


#[tauri::command]
pub async fn install_dependencies(app: AppHandle, force: Option<bool>) -> Result<(), String> {
    let app_data = resolve_install_dir(&app);
    let _ = std::fs::create_dir_all(&app_data);

    let emit = |step: &str, msg: &str, percent: u32| {
        let _ = app.emit("setup-progress", SetupProgressEvent {
            step: step.to_string(),
            message: msg.to_string(),
            percent,
            done: false,
            error: None,
        });
    };

    let emit_done = |app: &AppHandle| {
        let _ = app.emit("setup-progress", SetupProgressEvent {
            step: "done".to_string(),
            message: "Setup complete! AI features are ready.".to_string(),
            percent: 100,
            done: true,
            error: None,
        });
    };

    let emit_error = |app: &AppHandle, msg: &str| {
        let _ = app.emit("setup-progress", SetupProgressEvent {
            step: "error".to_string(),
            message: msg.to_string(),
            percent: 0,
            done: false,
            error: Some(msg.to_string()),
        });
    };

    // ── Already installed? ───────────────────────────────────────────────────
    // The pre-built bundle unpacks to AppData/.../cosmo_enhance/cosmo_enhance.exe
    // This matches the exe-first lookup path already in resolve_enhancer_command().
    let bundle_dir = app_data.join("cosmo_enhance");
    let bundle_exe = bundle_dir.join("cosmo_enhance.exe");
    let zip_path   = app_data.join("cosmo_enhance_win64.zip");

    let is_force = force.unwrap_or(false);
    if bundle_exe.exists() && !is_force {
        emit("done", "AI backend already installed \u{2713}", 100);
        emit_done(&app);
        return Ok(());
    }

    if is_force {
        let _ = std::fs::remove_dir_all(&bundle_dir);
        let _ = std::fs::remove_file(&zip_path);
    }

    // CPU-only bundle (~286 MB) - works on all hardware.
    // Hosted on VPS nginx port 8099 alongside GPU pack (repo is private, GitHub releases need auth).
    // Build with: .\scripts\build_cosmo_enhance_cpu.ps1
    const BUNDLE_URL: &str =
        "http://49.12.79.244:8099/cosmo_enhance_cpu_win64.zip";

    emit("download", "Downloading AI backend (one-time setup)...", 5);

    let zip_path_str = zip_path.to_string_lossy().replace('/', "\\\\");
    let app_data_str = app_data.to_string_lossy().replace('/', "\\\\");

    // Use WebClient.DownloadFile — streams to disk without loading into RAM.
    // Invoke-WebRequest buffers the whole response which OOMs on large files.
    // Segmented Fast Multi-stream Downloader Script
    // Downloads 8 chunks in parallel streams to bypass single-connection speed limits and maximize bandwidth.
    // Use Windows BITS Transfer for fast, multi-threaded background download that automatically manages bandwidth.
    // Clean any existing incomplete ZIP file to avoid BITS write/overwrite collisions
    if zip_path.exists() {
        let _ = std::fs::remove_file(&zip_path);
    }

    let ps_download = format!(
        "Import-Module BitsTransfer; \
         $dir = '{app_dir}'; \
         if (!(Test-Path $dir)) {{ New-Item -ItemType Directory -Force -Path $dir | Out-Null }}; \
         Start-BitsTransfer -Source '{url}' -Destination '{dest}' -Priority High",
        app_dir = app_data_str,
        url     = BUNDLE_URL,
        dest    = zip_path_str,
    );

    let zip_path_poll = zip_path.clone();
    let app_poll      = app.clone();

    let dl_handle = std::thread::spawn(move || {
        new_hidden_command("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &ps_download])
            .output()
    });

    // Poll file growth for progress (5 % -> 70 %)
    const EXPECTED_BYTES: u64 = 286 * 1024 * 1024;
    loop {
        std::thread::sleep(std::time::Duration::from_millis(1000));
        
        // Query active BITS job progress for this URL
        let ps_check = format!(
            "Import-Module BitsTransfer; \
             (Get-BitsTransfer | Where-Object {{ $_.FileList.RemoteName -like '*{}*' }} | Select-Object -First 1).BytesTransferred",
            "cosmo_enhance"
        );
        let out = new_hidden_command("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &ps_check])
            .output();
        
        let mut current = 0;
        if let Ok(o) = out {
            let s = String::from_utf8_lossy(&o.stdout);
            if let Ok(bytes) = s.trim().parse::<u64>() {
                current = bytes;
            }
        }
        
        // Fallback to disk file size
        if current == 0 {
            current = std::fs::metadata(&zip_path_poll).map(|m| m.len()).unwrap_or(0);
        }

        let pct = if current > 0 {
            (5.0_f64 + (current as f64 / EXPECTED_BYTES as f64) * 65.0).min(69.0) as u32
        } else {
            5
        };
        let _ = app_poll.emit("setup-progress", SetupProgressEvent {
            step: "download".to_string(),
            message: format!("Downloading AI backend... ({} MB / 286 MB)", current / 1_048_576),
            percent: pct,
            done: false,
            error: None,
        });
        if dl_handle.is_finished() { break; }
    }

    match dl_handle.join() {
        Ok(Ok(out)) if out.status.success() => {}
        Ok(Ok(out)) => {
            let msg = format!("Download failed: {}", String::from_utf8_lossy(&out.stderr));
            emit_error(&app, &msg);
            return Err(msg);
        }
        _ => {
            let msg = "Download thread crashed unexpectedly.".to_string();
            emit_error(&app, &msg);
            return Err(msg);
        }
    }

    if !zip_path.exists() {
        let msg = "Download completed but zip file not found on disk.".to_string();
        emit_error(&app, &msg);
        return Err(msg);
    }

    // ── Extract the bundle ───────────────────────────────────────────────────
    emit("extract", "Extracting AI backend...", 72);

    // To prevent collision with any active processes or locked files,
    // we extract to a unique temporary directory, then move/rename to cosmo_enhance.
    let ps_extract = format!(
        "$temp = Join-Path '{app_data}' 'cpu_extract_temp'; \
         if (Test-Path $temp) {{ Remove-Item -Path $temp -Recurse -Force | Out-Null }}; \
         New-Item -ItemType Directory -Force -Path $temp | Out-Null; \
         Expand-Archive -Path '{zip}' -DestinationPath $temp -Force; \
         $extracted = Join-Path $temp 'cosmo_enhance'; \
         $final_dest = '{dest_cpu}'; \
         if (Test-Path $final_dest) {{ Remove-Item -Path $final_dest -Recurse -Force | Out-Null }}; \
         Move-Item -Path $extracted -Destination $final_dest -Force; \
         Remove-Item -Path $temp -Recurse -Force | Out-Null",
        app_data = app_data_str,
        zip      = zip_path_str,
        dest_cpu = bundle_dir.to_string_lossy().replace('/', "\\\\")
    );

    let out = new_hidden_command("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps_extract])
        .output()
        .map_err(|e| format!("Extraction command failed to launch: {}", e))?;

    if !out.status.success() {
        let msg = format!("Failed to extract AI backend: {}", String::from_utf8_lossy(&out.stderr));
        emit_error(&app, &msg);
        return Err(msg);
    }

    // ── Verify extraction ────────────────────────────────────────────────────
    if !bundle_exe.exists() {
        let msg = format!(
            "Extraction succeeded but cosmo_enhance.exe not found at: {}",
            bundle_dir.to_string_lossy()
        );
        emit_error(&app, &msg);
        return Err(msg);
    }

    // ── Clean up zip to save disk space ─────────────────────────────────────
    let _ = std::fs::remove_file(&zip_path);

    emit("done", "AI backend ready \u{2713}", 98);
    emit_done(&app);
    Ok(())
}

// ── GPU Acceleration Pack (CUDA, NVIDIA only, user-triggered) ───────────────
// Downloads the full CUDA torch bundle into a separate cosmo_enhance_gpu/ folder.
// The resolver in resolve_enhancer_command prefers this over the CPU bundle.
#[tauri::command]
pub async fn install_gpu_pack(app: AppHandle, force: Option<bool>) -> Result<(), String> {
    let app_data = resolve_install_dir(&app);
    let _ = std::fs::create_dir_all(&app_data);

    let emit = |step: &str, msg: &str, percent: u32| {
        let _ = app.emit("gpu-pack-progress", SetupProgressEvent {
            step: step.to_string(),
            message: msg.to_string(),
            percent,
            done: false,
            error: None,
        });
    };
    let emit_done = |app: &AppHandle| {
        let _ = app.emit("gpu-pack-progress", SetupProgressEvent {
            step: "done".to_string(),
            message: "GPU Acceleration enabled! Restart the app to use Real-ESRGAN.".to_string(),
            percent: 100,
            done: true,
            error: None,
        });
    };
    let emit_error = |app: &AppHandle, msg: &str| {
        let _ = app.emit("gpu-pack-progress", SetupProgressEvent {
            step: "error".to_string(),
            message: msg.to_string(),
            percent: 0,
            done: false,
            error: Some(msg.to_string()),
        });
    };

    let bundle_dir = app_data.join("cosmo_enhance_gpu");
    let bundle_exe = bundle_dir.join("cosmo_enhance.exe");
    let zip_path   = app_data.join("cosmo_enhance_gpu_win64.zip");

    let is_force = force.unwrap_or(false);
    if bundle_exe.exists() && !is_force {
        emit("done", "GPU pack already installed \u{2713}", 100);
        emit_done(&app);
        return Ok(());
    }

    if is_force {
        let _ = std::fs::remove_dir_all(&bundle_dir);
        let _ = std::fs::remove_file(&zip_path);
    }

    // Full CUDA bundle (~2.8 GB). Hosted on VPS nginx port 8099 (plain HTTP, no redirect).
    // Build with: .\scripts\build_cosmo_enhance_exe.ps1
    const GPU_BUNDLE_URL: &str =
        "http://49.12.79.244:8099/cosmo_enhance_gpu_win64.zip";

    emit("download", "Downloading GPU Acceleration Pack...", 3);

    let zip_str      = zip_path.to_string_lossy().replace('/', "\\\\");
    let app_data_str = app_data.to_string_lossy().replace('/', "\\\\");

    // Clean any existing incomplete ZIP file to avoid BITS write/overwrite collisions
    if zip_path.exists() {
        let _ = std::fs::remove_file(&zip_path);
    }

    let ps_download = format!(
        "Import-Module BitsTransfer; \
         $dir = '{app_dir}'; \
         if (!(Test-Path $dir)) {{ New-Item -ItemType Directory -Force -Path $dir | Out-Null }}; \
         Start-BitsTransfer -Source '{url}' -Destination '{dest}' -Priority High",
        app_dir = app_data_str,
        url     = GPU_BUNDLE_URL,
        dest    = zip_str,
    );

    let zip_poll  = zip_path.clone();
    let app_poll  = app.clone();

    let dl_handle = std::thread::spawn(move || {
        new_hidden_command("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &ps_download])
            .output()
    });

    // Expect ~2.5 GB — update if your actual zip differs
    const EXPECTED_BYTES: u64 = 2_815 * 1024 * 1024;
    loop {
        std::thread::sleep(std::time::Duration::from_millis(1000));
        
        // Query active BITS job progress for this URL
        let ps_check = format!(
            "Import-Module BitsTransfer; \
             (Get-BitsTransfer | Where-Object {{ $_.FileList.RemoteName -like '*{}*' }} | Select-Object -First 1).BytesTransferred",
            "cosmo_enhance"
        );
        let out = new_hidden_command("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &ps_check])
            .output();
        
        let mut current = 0;
        if let Ok(o) = out {
            let s = String::from_utf8_lossy(&o.stdout);
            if let Ok(bytes) = s.trim().parse::<u64>() {
                current = bytes;
            }
        }
        
        // If BITS is done, fallback to file size on disk
        if current == 0 {
            current = std::fs::metadata(&zip_poll).map(|m| m.len()).unwrap_or(0);
        }

        let pct = if current > 0 {
            (3.0_f64 + (current as f64 / EXPECTED_BYTES as f64) * 67.0).min(69.0) as u32
        } else { 3 };
        let _ = app_poll.emit("gpu-pack-progress", SetupProgressEvent {
            step: "download".to_string(),
            message: format!("Downloading GPU pack... ({} MB / 2815 MB)", current / 1_048_576),
            percent: pct,
            done: false,
            error: None,
        });
        if dl_handle.is_finished() { break; }
    }

    match dl_handle.join() {
        Ok(Ok(out)) if out.status.success() => {}
        Ok(Ok(out)) => {
            let msg = format!("GPU pack download failed: {}", String::from_utf8_lossy(&out.stderr));
            emit_error(&app, &msg); return Err(msg);
        }
        _ => {
            let msg = "GPU pack download thread crashed.".to_string();
            emit_error(&app, &msg); return Err(msg);
        }
    }

    if !zip_path.exists() {
        let msg = "GPU pack download completed but zip not found.".to_string();
        emit_error(&app, &msg); return Err(msg);
    }

    emit("extract", "Extracting GPU pack...", 72);

    // To prevent collision with active CPU cosmo_enhance folder files,
    // we extract to a unique temporary directory, then move/rename to cosmo_enhance_gpu.
    let ps_extract_and_rename = format!(
        "$temp = Join-Path '{app_data}' 'gpu_extract_temp'; \
         if (Test-Path $temp) {{ Remove-Item -Path $temp -Recurse -Force | Out-Null }}; \
         New-Item -ItemType Directory -Force -Path $temp | Out-Null; \
         Expand-Archive -Path '{zip}' -DestinationPath $temp -Force; \
         $extracted = Join-Path $temp 'cosmo_enhance'; \
         $final_dest = '{dest_gpu}'; \
         if (Test-Path $final_dest) {{ Remove-Item -Path $final_dest -Recurse -Force | Out-Null }}; \
         Move-Item -Path $extracted -Destination $final_dest -Force; \
         Remove-Item -Path $temp -Recurse -Force | Out-Null",
        app_data = app_data_str,
        zip      = zip_str,
        dest_gpu = bundle_dir.to_string_lossy().replace('/', "\\\\")
    );

    let out = new_hidden_command("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps_extract_and_rename])
        .output()
        .map_err(|e| format!("GPU pack extraction failed to launch: {}", e))?;

    if !out.status.success() {
        let msg = format!("GPU pack extraction failed: {}", String::from_utf8_lossy(&out.stderr));
        emit_error(&app, &msg); return Err(msg);
    }

    if !bundle_exe.exists() {
        let msg = "GPU pack extracted but cosmo_enhance.exe not found.".to_string();
        emit_error(&app, &msg); return Err(msg);
    }

    let _ = std::fs::remove_file(&zip_path);
    emit("done", "GPU Acceleration Pack installed \u{2713}", 98);
    emit_done(&app);
    Ok(())
}


#[tauri::command]
pub async fn download_models(app: AppHandle) -> Result<(), String> {
    let app_data = resolve_install_dir(&app);
    let models_dir = app_data.join(".cosmo_models");
    let _ = std::fs::create_dir_all(&models_dir);

    let emit = |step: &str, msg: &str, percent: u32| {
        let _ = app.emit("model-download-progress", SetupProgressEvent {
            step: step.to_string(),
            message: msg.to_string(),
            percent,
            done: false,
            error: None,
        });
    };

    let models: &[(&str, &str, &str, u32, u32, u64)] = &[
        (
            "realesrgan",
            "RealESRGAN_x4plus.pth",
            "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth",
            0, 30,
            67_000_000 // ~67 MB
        ),
        (
            "gfpgan",
            "GFPGANv1.4.pth",
            "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth",
            30, 75,
            348_000_000 // ~348 MB
        ),
        (
            "u2net",
            ".u2net/u2net.onnx",
            "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx",
            75, 100,
            176_000_000 // ~176 MB
        ),
    ];

    for (step, filename, url, start_pct, end_pct, expected_size) in models {
        let dest = models_dir.join(filename);
        if dest.exists() {
            emit(step, &format!("{} already downloaded ✓", filename), *end_pct);
            continue;
        }

        emit(step, &format!("Downloading {} (expected ~{} MB)...", filename, expected_size / 1_000_000), *start_pct + 2);

        // Pre-create models directory and any subdirectories so the child PowerShell process can write into it.
        if let Some(parent) = dest.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let ps = format!(
            "$dir = '{0}'; if (!(Test-Path $dir)) {{ New-Item -ItemType Directory -Force -Path $dir | Out-Null }}; Invoke-WebRequest -Uri '{1}' -OutFile '{2}' -UseBasicParsing",
            clean_path(dest.parent().unwrap_or(&models_dir)),
            url,
            clean_path(&dest)
        );

        let dest_clone = dest.clone();
        let app_clone = app.clone();
        let step_str = step.to_string();
        let filename_str = filename.to_string();
        let start = *start_pct;
        let end = *end_pct;
        let expected = *expected_size;

        let handle = std::thread::spawn(move || {
            new_hidden_command("powershell")
                .args(["-NoProfile", "-NonInteractive", "-Command", &ps])
                .output()
        });

        loop {
            std::thread::sleep(std::time::Duration::from_millis(500));
            let current_size = std::fs::metadata(&dest_clone).map(|m| m.len()).unwrap_or(0);
            let pct = if current_size > 0 {
                (start as f64 + (current_size as f64 / expected as f64) * (end - start) as f64) as u32
            } else {
                start + 2
            };
            let _ = app_clone.emit("model-download-progress", SetupProgressEvent {
                step: step_str.clone(),
                message: format!("Downloading {}... ({} MB)", filename_str, current_size / 1_000_000),
                percent: pct.min(end - 1),
                done: false,
                error: None,
            });

            if handle.is_finished() { break; }
        }

        match handle.join() {
            Ok(Ok(out)) if out.status.success() => {
                emit(step, &format!("{} downloaded ✓", filename), *end_pct);
            }
            Ok(Ok(out)) => {
                let msg = format!("Failed to download {}: {}", filename, String::from_utf8_lossy(&out.stderr));
                let _ = app.emit("model-download-progress", SetupProgressEvent {
                    step: step.to_string(),
                    message: msg.clone(),
                    percent: *start_pct,
                    done: false,
                    error: Some(msg.clone()),
                });
                return Err(msg);
            }
            _ => {
                return Err(format!("Download thread panicked for {}", filename));
            }
        }
    }

    let _ = app.emit("model-download-progress", SetupProgressEvent {
        step: "done".to_string(),
        message: "All AI model weights downloaded ✓".to_string(),
        percent: 100,
        done: true,
        error: None,
    });

    Ok(())
}
