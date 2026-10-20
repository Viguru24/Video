use std::path::PathBuf;
use std::sync::{OnceLock, RwLock};
use tauri::{AppHandle, Emitter, Manager};

use super::addons::resolve_install_dir;
use super::telemetry::new_hidden_command;

pub static AI_HARDWARE_MODE: OnceLock<RwLock<String>> = OnceLock::new();

pub fn set_ai_hardware_status(status: String) {
    if let Some(lock) = AI_HARDWARE_MODE.get() {
        if let Ok(mut guard) = lock.write() {
            *guard = status;
        }
    } else {
        let _ = AI_HARDWARE_MODE.set(RwLock::new(status));
    }
}

fn clean_path(path: &std::path::Path) -> String {
    path.to_string_lossy().replace("\\\\?\\", "")
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
pub fn get_ai_hardware_status() -> String {
    AI_HARDWARE_MODE
        .get()
        .and_then(|lock| lock.read().ok())
        .map(|guard| guard.clone())
        .unwrap_or_else(|| "Detecting...".to_string())
}

#[tauri::command]
pub async fn detect_ai_hardware(app: AppHandle) -> Result<String, String> {
    let app_handle = app.clone();
    let mode_str = tauri::async_runtime::spawn_blocking(move || {
        let mut has_gpu = false;
        let mut is_dml = false;
        if let Ok((runner, args)) = resolve_enhancer_command(Some(&app_handle)) {
            let mut check_args = args;
            check_args.push("--check-cuda".to_string());
            
            let mut cmd = std::process::Command::new(&runner);
            cmd.args(&check_args);

            if let Ok(app_data) = app_handle.path().app_data_dir() {
                let _ = std::fs::create_dir_all(&app_data);
                cmd.current_dir(&app_data);
            }

            if let Some(models_dir) = resolve_models_dir(Some(&app_handle)) {
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
        
        if has_gpu {
            if is_dml {
                "GPU (AMD DirectML)".to_string()
            } else {
                "GPU (NVIDIA CUDA)".to_string()
            }
        } else {
            "CPU (Bilateral Filter Fallback)".to_string()
        }
    }).await.map_err(|e| e.to_string())?;

    set_ai_hardware_status(mode_str.clone());
    Ok(mode_str)
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

    let cosmo_venv_python = app.map(|a| {
        resolve_install_dir(a).join("cosmo_venv").join("Scripts").join("python.exe")
    }).filter(|p| p.exists());

    let studio_venv_python = resolve_studio_venv_python();

    let app_data = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(std::env::var_os("USERPROFILE").unwrap_or_default()).join("AppData").join("Local"));
    let program_files = std::env::var_os("ProgramFiles")
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

    let system_python = cosmo_venv_python
        .or_else(|| common_python_paths.iter().find(|p| p.exists()).cloned())
        .or(studio_venv_python);

    let dev_py = std::env::current_dir()
        .ok()
        .map(|d| d.join("cosmo_enhance.py"))
        .filter(|p| p.exists())
        .or_else(|| {
            std::env::current_dir()
                .ok()
                .and_then(|d| d.parent().map(|p| p.join("cosmo_enhance.py")))
                .filter(|p| p.exists())
        });

    if let (Some(script), Some(ref py_exe)) = (&dev_py, &system_python) {
        if check_python_gpu_and_packages(py_exe) {
            return Ok((py_exe.clone(), vec!["-u".to_string(), script.to_string_lossy().to_string()]));
        }
    }

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

    let local_py = dev_py.or(resource_py).or_else(|| {
        exe_dir.as_ref()
            .map(|d| d.join("cosmo_enhance.py"))
            .filter(|p| p.exists())
    });

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
            if app_data.join("4x-UltraSharp.pth").exists() || app_data.join("RealESRGAN_x4plus.pth").exists() {
                return Some(app_data.to_string_lossy().to_string());
            }
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let mut dir = Some(exe_dir);
            while let Some(d) = dir {
                let candidate = d.join(".cosmo_models");
                let has_upscaler = candidate.join("4x-UltraSharp.pth").exists() || candidate.join("RealESRGAN_x4plus.pth").exists();
                if has_upscaler && candidate.join("GFPGANv1.4.pth").exists() {
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

    let upscaler_model_ok = default_models_path.join("4x-UltraSharp.pth").exists() || default_models_path.join("RealESRGAN_x4plus.pth").exists();
    let gfpgan_model = default_models_path.join("GFPGANv1.4.pth");
    let mut models_ok = upscaler_model_ok && gfpgan_model.exists();
    let mut resolved_models_path = default_models_path;

    if !models_ok {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(exe_dir) = exe.parent() {
                let mut dir = Some(exe_dir);
                while let Some(d) = dir {
                    let candidate = d.join(".cosmo_models");
                    let has_upscaler = candidate.join("4x-UltraSharp.pth").exists() || candidate.join("RealESRGAN_x4plus.pth").exists();
                    if has_upscaler && candidate.join("GFPGANv1.4.pth").exists() {
                        models_ok = true;
                        resolved_models_path = candidate;
                        break;
                    }
                    dir = d.parent();
                }
            }
        }
    }

    let base_bundle_ok = app_data.join("cosmo_enhance").join("cosmo_enhance.exe").exists();
    let gpu_pack_ok = app_data.join("cosmo_enhance_gpu").join("cosmo_enhance.exe").exists();

    let python_ok   = base_bundle_ok || gpu_pack_ok || venv_python.exists();
    let packages_ok = base_bundle_ok || gpu_pack_ok || (python_ok && {
        let result = new_hidden_command(&venv_python)
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

    const BUNDLE_URL: &str =
        "http://49.12.79.244:8099/cosmo_enhance_cpu_win64.zip";

    emit("download", "Downloading AI backend (one-time setup)...", 5);

    let zip_path_str = zip_path.to_string_lossy().replace('/', "\\\\");
    let app_data_str = app_data.to_string_lossy().replace('/', "\\\\");

    if zip_path.exists() {
        let _ = std::fs::remove_file(&zip_path);
    }

    let ps_download = format!(
        "$dir = '{app_dir}'; \
         if (!(Test-Path $dir)) {{ New-Item -ItemType Directory -Force -Path $dir | Out-Null }}; \
         $client = New-Object System.Net.WebClient; \
         $client.DownloadFile('{url}', '{dest}')",
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

    const EXPECTED_BYTES: u64 = 286 * 1024 * 1024;
    loop {
        std::thread::sleep(std::time::Duration::from_millis(1000));
        
        let current = std::fs::metadata(&zip_path_poll).map(|m| m.len()).unwrap_or(0);

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

    emit("extract", "Extracting AI backend...", 72);

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

    if !bundle_exe.exists() {
        let msg = format!(
            "Extraction succeeded but cosmo_enhance.exe not found at: {}",
            bundle_dir.to_string_lossy()
        );
        emit_error(&app, &msg);
        return Err(msg);
    }

    let _ = std::fs::remove_file(&zip_path);

    emit("done", "AI backend ready \u{2713}", 98);
    emit_done(&app);
    Ok(())
}

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

    const GPU_BUNDLE_URL: &str =
        "http://49.12.79.244:8099/cosmo_enhance_gpu_win64.zip";

    emit("download", "Downloading GPU Acceleration Pack...", 3);

    let zip_str      = zip_path.to_string_lossy().replace('/', "\\\\");
    let app_data_str = app_data.to_string_lossy().replace('/', "\\\\");

    if zip_path.exists() {
        let _ = std::fs::remove_file(&zip_path);
    }

    let ps_download = format!(
        "$dir = '{app_dir}'; \
         if (!(Test-Path $dir)) {{ New-Item -ItemType Directory -Force -Path $dir | Out-Null }}; \
         $client = New-Object System.Net.WebClient; \
         $client.DownloadFile('{url}', '{dest}')",
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

    const EXPECTED_BYTES: u64 = 2_815 * 1024 * 1024;
    loop {
        std::thread::sleep(std::time::Duration::from_millis(1000));
        
        let current = std::fs::metadata(&zip_poll).map(|m| m.len()).unwrap_or(0);

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
    let _ = detect_ai_hardware(app.clone()).await;
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

    let upscaler_filename = if models_dir.join("4x-UltraSharp.pth").exists() {
        "4x-UltraSharp.pth"
    } else if models_dir.join("RealESRGAN_x4plus.pth").exists() {
        "RealESRGAN_x4plus.pth"
    } else {
        "4x-UltraSharp.pth"
    };

    let upscaler_url = if upscaler_filename == "RealESRGAN_x4plus.pth" {
        "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth"
    } else {
        "https://huggingface.co/lokcx/4x-Ultrasharp/resolve/main/4x-UltraSharp.pth"
    };

    let models: &[(&str, &str, &str, u32, u32, u64)] = &[
        (
            "ultrasharp",
            upscaler_filename,
            upscaler_url,
            0, 30,
            67_000_000
        ),
        (
            "gfpgan",
            "GFPGANv1.4.pth",
            "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth",
            30, 75,
            348_000_000
        ),
        (
            "u2net",
            ".u2net/u2net.onnx",
            "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx",
            75, 100,
            176_000_000
        ),
    ];

    for (step, filename, url, start_pct, end_pct, expected_size) in models {
        let dest = models_dir.join(filename);
        if dest.exists() {
            emit(step, &format!("{} already downloaded ✓", filename), *end_pct);
            continue;
        }

        emit(step, &format!("Downloading {} (expected ~{} MB)...", filename, expected_size / 1_000_000), *start_pct + 2);

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

pub fn copy_demo_files_to_app_data(app: &AppHandle) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let dest_demos_dir = app_data_dir.join("demos");
    if !dest_demos_dir.exists() {
        std::fs::create_dir_all(&dest_demos_dir).map_err(|e| e.to_string())?;
    }

    let resource_dir = app.path().resource_dir().unwrap_or_else(|_| PathBuf::from("."));

    let src_candidates = [
        resource_dir.join("public").join("demos"),
        resource_dir.join("resources").join("public").join("demos"),
        resource_dir.join("demos"),
        PathBuf::from("public").join("demos"),
        PathBuf::from("..").join("public").join("demos"),
    ];

    let mut src_demos_dir = None;
    for cand in &src_candidates {
        if cand.exists() && cand.is_dir() {
            src_demos_dir = Some(cand);
            break;
        }
    }

    if let Some(src_dir) = src_demos_dir {
        println!("Copying demo files from {:?} to {:?}", src_dir, dest_demos_dir);
        if let Ok(entries) = std::fs::read_dir(src_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(file_name) = path.file_name() {
                        let dest_file = dest_demos_dir.join(file_name);
                        if !dest_file.exists() {
                            if let Err(e) = std::fs::copy(&path, &dest_file) {
                                eprintln!("Failed to copy demo file {:?}: {:?}", file_name, e);
                            }
                        }
                    }
                }
            }
        }
    } else {
        eprintln!("Could not find demo files source directory in candidate paths: {:?}", src_candidates);
    }

    Ok(())
}
