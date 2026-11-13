use std::fs;
use std::sync::OnceLock;
use tauri::{AppHandle, Manager, State};
use crate::{AppState, LaunchArgs};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

pub fn new_hidden_command<S: AsRef<std::ffi::OsStr>>(program: S) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    #[cfg(windows)]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

pub fn open_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("cmd");
        cmd.args(["/C", "start", "", url]);
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

struct GpuTelemetryCache {
    gpu_name: String,
    vram: String,
    temp: f32,
    last_query: std::time::Instant,
    refreshing: bool,
}

static GPU_CACHE: OnceLock<std::sync::Mutex<GpuTelemetryCache>> = OnceLock::new();

#[tauri::command]
pub async fn get_telemetry(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let (cpu_usage, total_mem, used_mem) = {
        let mut sys = state.sys.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut last_refresh = state.last_refresh.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

        if last_refresh.elapsed() >= std::time::Duration::from_millis(1000) {
            sys.refresh_cpu_usage();
            sys.refresh_memory();
            *last_refresh = std::time::Instant::now();
        }

        (
            sys.global_cpu_usage(),
            sys.total_memory() / 1024 / 1024 / 1024,
            sys.used_memory() / 1024 / 1024 / 1024,
        )
    };

    let cache_mutex = GPU_CACHE.get_or_init(|| {
        std::sync::Mutex::new(GpuTelemetryCache {
            gpu_name: "System GPU".to_string(),
            vram: format!("{}/{}GB", used_mem, total_mem),
            temp: 0.0,
            last_query: std::time::Instant::now() - std::time::Duration::from_secs(60),
            refreshing: false,
        })
    });

    let (should_refresh, snapshot) = {
        let mut cache = cache_mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let trigger = !cache.refreshing && cache.last_query.elapsed() >= std::time::Duration::from_secs(15);
        if trigger {
            cache.refreshing = true;
        }
        (trigger, (cache.gpu_name.clone(), cache.vram.clone(), cache.temp))
    };

    if should_refresh {
        let fallback_vram = format!("{}/{}GB", used_mem, total_mem);
        tauri::async_runtime::spawn_blocking(move || {
            let run_hidden_cmd = |cmd_name: &str, args: &[&str]| -> Option<String> {
                let mut cmd = std::process::Command::new(cmd_name);
                cmd.args(args);
                #[cfg(target_os = "windows")]
                {
                    cmd.creation_flags(0x08000000);
                }
                cmd.output().ok().and_then(|out| String::from_utf8(out.stdout).ok())
            };

            let queried = run_hidden_cmd(
                "nvidia-smi",
                &[
                    "--query-gpu=name,temperature.gpu,memory.used,memory.total",
                    "--format=csv,noheader,nounits",
                ],
            );

            let mut cache = cache_mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            if let Some(line) = queried.as_deref().and_then(|s| s.lines().next()) {
                let parts: Vec<&str> = line.split(',').map(|p| p.trim()).collect();
                if parts.len() >= 4 {
                    if !parts[0].is_empty() {
                        cache.gpu_name = parts[0].to_string();
                    }
                    if let Ok(t) = parts[1].parse::<f32>() {
                        cache.temp = t;
                    }
                    if let (Ok(used), Ok(total)) = (parts[2].parse::<f32>(), parts[3].parse::<f32>()) {
                        cache.vram = format!("{:.1}/{:.1}GB", used / 1024.0, total / 1024.0);
                    }
                }
            } else {
                cache.vram = fallback_vram;
            }
            cache.last_query = std::time::Instant::now();
            cache.refreshing = false;
        });
    }

    Ok(serde_json::json!({
        "cpu": format!("{:.1}%", cpu_usage),
        "mem": snapshot.1,
        "gpu": snapshot.0,
        "temp": snapshot.2,
        "fps": "STABLE"
    }))
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
    let _ = (&app, &msg);
    if false {
        if let Ok(mut log_path) = app.path().app_data_dir() {
            log_path.push("cosmo_activity.log");

            if let Some(parent) = log_path.parent() {
                let _ = fs::create_dir_all(parent);
            }

            if let Ok(meta) = fs::metadata(&log_path) {
                if meta.len() > 5 * 1024 * 1024 {
                    let mut old_log = log_path.clone();
                    old_log.set_extension("log.old");
                    let _ = fs::rename(&log_path, old_log);
                }
            }

            let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
            let line = format!("[{}] {}\n", timestamp, msg);
            if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(log_path) {
                use std::io::Write;
                let _ = file.write_all(line.as_bytes());
            }
        }
    }
}

#[tauri::command]
pub fn exit_app(app: AppHandle) {
    println!("Cosmo Symphony: exit_app command called. Cleaning up processes and exiting...");
    let _ = crate::commands::server::secure_cleanup_on_exit(&app);
    
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("powershell.exe")
            .args(&[
                "-NoProfile", "-Command",
                "Get-NetTCPConnection -LocalPort 8005, 12000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
            ])
            .creation_flags(0x08000000)
            .output();
    }
    
    app.exit(0);
    std::process::exit(0);
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    open_url(&url)
}
