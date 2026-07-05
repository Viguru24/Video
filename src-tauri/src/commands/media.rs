use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use base64::{engine::general_purpose, Engine as _};
use tauri::{AppHandle, Manager, Emitter};
use crate::commands::filesystem::clean_local_path;
use crate::commands::system::{
    resolve_python_exe, resolve_enhancer_command, resolve_models_dir,
};
use crate::commands::server::{secure_delete_file, secure_delete_dir_all};
use serde_json::{self, Value};


pub static CANCEL_UPSCALE: AtomicBool = AtomicBool::new(false);

#[derive(serde::Serialize, Clone)]
pub struct UpscaleProgress {
    pub frame: u32,
    pub total: u32,
    pub stage: String,
}

pub fn debug_log(msg: &str) {
    println!("{}", msg);
}

fn resolve_heic_script_path() -> PathBuf {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));
    
    let paths = vec![
        exe_dir.as_ref().map(|d| d.join("convert_heic.py")),
        std::env::current_dir().ok().map(|d| d.join("convert_heic.py")),
        std::env::current_dir().ok().map(|d| d.join("src-tauri").join("convert_heic.py")),
    ];

    for path in paths.into_iter().flatten() {
        if path.exists() {
            return path;
        }
    }
    PathBuf::from("convert_heic.py")
}

fn convert_heic_pillow(src_path: &str, dest_path: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let python_exe = resolve_python_exe();
    let script_path = resolve_heic_script_path();

    debug_log(&format!("Running HEIC conversion via python: {:?} {:?} {:?} {:?}", python_exe, script_path, src_path, dest_path));

    let out = Command::new(&python_exe)
        .args([&script_path.to_string_lossy().to_string(), src_path, dest_path])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to spawn python for HEIC: {}", e))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let stdout = String::from_utf8_lossy(&out.stdout);
        return Err(format!("Python HEIC conversion failed: {}\nStdout: {}", stderr, stdout));
    }

    Ok(())
}

fn safe_recycle_file(path: &Path, retries: u32) -> Result<(), String> {
    for attempt in 0..retries {
        match trash::delete(path) {
            Ok(()) => return Ok(()),
            Err(e) => {
                if attempt + 1 < retries {
                    std::thread::sleep(std::time::Duration::from_millis(150));
                } else {
                    return Err(format!("Failed to recycle '{}' after {} attempts: {}", path.display(), retries, e));
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn convert_media_to_standard(src_path: String, media_type: String) -> Result<String, String> {
    let src_path = clean_local_path(&src_path);
    tauri::async_runtime::spawn_blocking(move || {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let src = Path::new(&src_path);
        let is_video = media_type == "video";
        let target_ext = if is_video { "mp4" } else { "jpg" };
        let dest_path = src.with_extension(target_ext);
        let dest_str = dest_path.to_string_lossy().to_string();

        if is_video {
            let web_native_codecs = [
                "h264", "avc", "hevc", "h265", "vp8", "vp9", "av1", "av01",
                "aac", "mp3", "opus", "vorbis", "flac",
            ];

            let probe_out = Command::new("ffprobe")
                .args([
                    "-v", "error",
                    "-select_streams", "v:0",
                    "-show_entries", "stream=codec_name",
                    "-of", "default=noprint_wrappers=1:nokey=1",
                    &src_path,
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .output();

            let source_codec = probe_out
                .ok()
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .map(|s| s.trim().to_lowercase())
                .unwrap_or_default();

            debug_log(&format!("convert_media: source video codec = '{}'", source_codec));

            let codec_is_web_native = web_native_codecs.iter().any(|c| source_codec.contains(c));

            if codec_is_web_native {
                let copy_out = Command::new("ffmpeg")
                    .args(["-y", "-i", &src_path, "-c", "copy", "-movflags", "+faststart", &dest_str])
                    .creation_flags(CREATE_NO_WINDOW)
                    .output()
                    .map_err(|e| format!("Failed to spawn ffmpeg (copy): {}", e))?;

                if copy_out.status.success() {
                    debug_log(&format!("convert_media: stream-copy succeeded for {}", src_path));
                    if let Err(e) = safe_recycle_file(src, 5) {
                        debug_log(&format!("convert_media: failed to recycle original after stream-copy: {}", e));
                    }
                    return Ok(dest_str);
                }

                debug_log(&format!("convert_media: stream-copy failed, falling back to re-encode for {}", src_path));
            } else {
                debug_log(&format!("convert_media: codec '{}' not web-native, skipping stream-copy and re-encoding directly", source_codec));
            }

            let enc_out = Command::new("ffmpeg")
                .args([
                    "-y", "-i", &src_path,
                    "-c:v", "libx264", "-crf", "18", "-preset", "fast",
                    "-c:a", "aac", "-movflags", "+faststart",
                    &dest_str,
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .map_err(|e| format!("Failed to spawn ffmpeg (encode): {}", e))?;

            if !enc_out.status.success() {
                let stderr = String::from_utf8_lossy(&enc_out.stderr);
                return Err(format!("FFmpeg video conversion failed: {}", stderr));
            }
        } else {
            let is_heic = src_path.to_lowercase().ends_with(".heic") || src_path.to_lowercase().ends_with(".heif");
            let mut python_success = false;
            if is_heic {
                if let Err(e) = convert_heic_pillow(&src_path, &dest_str) {
                    debug_log(&format!("convert_media_to_standard: python HEIC convert failed, falling back: {}", e));
                } else {
                    python_success = true;
                }
            }

            if !python_success {
                let out = Command::new("ffmpeg")
                    .args(["-y", "-i", &src_path, "-q:v", "2", &dest_str])
                    .creation_flags(CREATE_NO_WINDOW)
                    .output()
                    .map_err(|e| format!("Failed to spawn ffmpeg (image): {}", e))?;

                if !out.status.success() {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    return Err(format!("FFmpeg image conversion failed: {}", stderr));
                }
            }

            let dest_meta = fs::metadata(&dest_str).map_err(|e| format!("Output file missing: {}", e))?;
            if dest_meta.len() < 1024 {
                let _ = fs::remove_file(&dest_str);
                return Err("Conversion produced a suspiciously small file — original preserved.".into());
            }
            let mut header = [0u8; 2];
            fs::File::open(&dest_str)
                .and_then(|mut f| f.read_exact(&mut header))
                .map_err(|e| format!("Cannot read output header: {}", e))?;
            if header != [0xFF, 0xD8] {
                let _ = fs::remove_file(&dest_str);
                return Err("Output is not a valid JPEG — original preserved.".into());
            }
        }

        if let Err(e) = safe_recycle_file(src, 5) {
            debug_log(&format!("convert_media: failed to recycle original {}: {}", src_path, e));
        }

        Ok(dest_str)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn convert_heic_to_jpg(src_path: String) -> Result<String, String> {
    let src_path = clean_local_path(&src_path);
    tauri::async_runtime::spawn_blocking(move || {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let src = Path::new(&src_path);
        let dest_path = src.with_extension("jpg");
        let dest_str = dest_path.to_string_lossy().to_string();

        let mut python_success = false;
        if let Err(e) = convert_heic_pillow(&src_path, &dest_str) {
            debug_log(&format!("convert_heic_to_jpg: python HEIC convert failed, falling back: {}", e));
        } else {
            python_success = true;
        }

        if !python_success {
            let output = Command::new("ffmpeg")
                .args(["-y", "-i", &src_path, "-q:v", "2", &dest_str])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .map_err(|e| format!("Failed to spawn ffmpeg for HEIC conversion: {}", e))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("FFmpeg HEIC conversion failed: {}", stderr));
            }
        }

        let dest_meta = fs::metadata(&dest_str).map_err(|e| format!("Output file missing: {}", e))?;
        if dest_meta.len() < 1024 {
            let _ = fs::remove_file(&dest_str);
            return Err("Output too small — original HEIC preserved.".into());
        }
        let mut header = [0u8; 2];
        fs::File::open(&dest_str)
            .and_then(|mut f| f.read_exact(&mut header))
            .map_err(|e| format!("Cannot read output header: {}", e))?;
        if header != [0xFF, 0xD8] {
            let _ = fs::remove_file(&dest_str);
            return Err("Output is not a valid JPEG — original HEIC preserved.".into());
        }

        if let Err(e) = safe_recycle_file(src, 5) {
            debug_log(&format!("HEIC->JPG: could not recycle original {}: {}", src_path, e));
        }

        Ok(dest_str)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn snapshot_video_frame(
    real_path: String,
    timestamp_secs: f64,
    file_name: String,
    custom_dir: Option<String>,
) -> Result<String, String> {
    let real_path = clean_local_path(&real_path);
    let file_name = file_name.clone();
    let custom_dir = custom_dir.clone();

    tauri::async_runtime::spawn_blocking(move || {
        use std::os::windows::process::CommandExt;
        let base_path = if let Some(ref d) = custom_dir {
            let custom = PathBuf::from(d);
            match fs::create_dir_all(&custom) {
                Ok(_) => custom,
                Err(e) => {
                    debug_log(&format!(
                        "snapshot_video_frame: custom dir '{}' unavailable ({}), falling back to Pictures/Cosmo_Snapshots",
                        d, e
                    ));
                    let fallback = dirs::picture_dir()
                        .ok_or_else(|| format!("Snapshot dir '{}' not accessible and no fallback Pictures dir: {}", d, e))?
                        .join("Cosmo_Snapshots");
                    fs::create_dir_all(&fallback)
                        .map_err(|e2| format!("Could not create snapshot directory '{}': {}", fallback.display(), e2))?;
                    fallback
                }
            }
        } else {
            let default_dir = dirs::picture_dir()
                .ok_or("No Pictures directory found")?
                .join("Cosmo_Snapshots");
            fs::create_dir_all(&default_dir)
                .map_err(|e| format!("Could not create snapshot directory '{}': {}", default_dir.display(), e))?;
            default_dir
        };
        let out_path = base_path.join(&file_name);

        let total_secs = timestamp_secs as u64;
        let millis = ((timestamp_secs - total_secs as f64) * 1000.0) as u64;
        let hh = total_secs / 3600;
        let mm = (total_secs % 3600) / 60;
        let ss = total_secs % 60;
        let ts_str = format!("{:02}:{:02}:{:02}.{:03}", hh, mm, ss, millis);

        let output = Command::new("ffmpeg")
            .args([
                "-y",
                "-ss", &ts_str,
                "-i", &real_path,
                "-frames:v", "1",
                "-update", "1",
                "-q:v", "1",
                "-vf", "scale=iw:ih",
                out_path.to_str().ok_or("Bad output path")?,
            ])
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| format!("Failed to spawn ffmpeg: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("FFmpeg failed: {}", stderr));
        }

        if !out_path.exists() {
            return Err("FFmpeg ran but output frame was not created".to_string());
        }

        Ok(out_path.to_string_lossy().to_string())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn save_snapshot(
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
pub async fn save_persistence(app: AppHandle, key: String, data: String) {
    let _ = tauri::async_runtime::spawn_blocking(move || {
        if let Ok(mut dir_path) = app.path().app_data_dir() {
            dir_path.push("persistence");
            let _ = fs::create_dir_all(&dir_path);
            
            let file_path = dir_path.join(format!("{}.json", key));
            let bak_path = dir_path.join(format!("{}.json.bak", key));
            let tmp_path = dir_path.join(format!("{}.json.tmp", key));

            let is_json_key = key == "cosmo-v2" || key == "cosmo-video-v2" || key == "cosmo-video" 
                || key == "cosmo-collections" || key == "cosmo-video-collections";
            
            let data_valid = if is_json_key {
                serde_json::from_str::<Value>(&data).is_ok()
            } else {
                !data.trim().is_empty()
            };

            if !data_valid {
                eprintln!("[Persistence Warning] Attempted to save invalid/empty data for key: {}", key);
                return;
            }

            if file_path.exists() {
                if let Ok(existing_content) = fs::read_to_string(&file_path) {
                    let existing_valid = if is_json_key {
                        serde_json::from_str::<Value>(&existing_content).is_ok()
                    } else {
                        !existing_content.trim().is_empty()
                    };
                    if existing_valid {
                        let _ = fs::copy(&file_path, &bak_path);
                    }
                }
            }

            if fs::write(&tmp_path, &data).is_ok() {
                let _ = fs::rename(&tmp_path, &file_path);
            }

            if key == "cosmo-collections" || key == "cosmo-v2" {
                if let Ok(mut doc_path) = app.path().document_dir() {
                    doc_path.push("CosmoSymphony");
                    let _ = fs::create_dir_all(&doc_path);
                    
                    let doc_file_path = doc_path.join(format!("{}.json", key));
                    let doc_tmp_path = doc_path.join(format!("{}.json.tmp", key));
                    
                    if fs::write(&doc_tmp_path, &data).is_ok() {
                        let _ = fs::rename(&doc_tmp_path, &doc_file_path);
                    }
                }
            }
        }
    }).await;
}

#[tauri::command]
pub async fn load_persistence(app: AppHandle, key: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let is_json_key = key == "cosmo-v2" || key == "cosmo-video-v2" || key == "cosmo-video" 
            || key == "cosmo-collections" || key == "cosmo-video-collections";

        let is_valid = |content: &str| -> bool {
            if content.trim().is_empty() {
                return false;
            }
            if is_json_key {
                serde_json::from_str::<Value>(content).is_ok()
            } else {
                true
            }
        };

        if let Ok(mut dir_path) = app.path().app_data_dir() {
            dir_path.push("persistence");
            let file_path = dir_path.join(format!("{}.json", key));
            let bak_path = dir_path.join(format!("{}.json.bak", key));

            if file_path.exists() {
                if let Ok(content) = fs::read_to_string(&file_path) {
                    if is_valid(&content) {
                        return Some(content);
                    } else {
                        eprintln!("[Persistence] Primary file for {} is invalid/corrupted.", key);
                    }
                }
            }

            if bak_path.exists() {
                if let Ok(content) = fs::read_to_string(&bak_path) {
                    if is_valid(&content) {
                        eprintln!("[Persistence] Recovered {} from AppData backup.", key);
                        return Some(content);
                    }
                }
            }
        }

        if key == "cosmo-collections" || key == "cosmo-v2" {
            if let Ok(mut doc_path) = app.path().document_dir() {
                doc_path.push("CosmoSymphony");
                let doc_file_path = doc_path.join(format!("{}.json", key));
                if doc_file_path.exists() {
                    if let Ok(content) = fs::read_to_string(&doc_file_path) {
                        if is_valid(&content) {
                            eprintln!("[Persistence] Recovered {} from Documents backup.", key);
                            return Some(content);
                        }
                    }
                }
            }
        }

        None
    }).await.ok().flatten()
}

#[tauri::command]
pub async fn get_video_metadata(app: AppHandle, path: String) -> Result<Value, String> {
    let clean_path = clean_local_path(&path);

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

    let mut upscaled_by = None;
    if let Ok(app_data) = app.path().app_data_dir() {
        let history_file = app_data.join("upscale_history.json");
        if let Ok(s) = fs::read_to_string(&history_file) {
            if let Ok(history) = serde_json::from_str::<serde_json::Map<String, Value>>(&s) {
                let norm_clean = clean_path.replace("/", "\\");
                if let Some(desc) = history.get(&clean_path).or_else(|| history.get(&norm_clean)) {
                    upscaled_by = desc.as_str().map(|s| s.to_string());
                } else if let Ok(abs_path) = fs::canonicalize(&p) {
                    let abs_str = abs_path.to_string_lossy().to_string();
                    if let Some(desc) = history.get(&abs_str) {
                        upscaled_by = desc.as_str().map(|s| s.to_string());
                    }
                }
            }
        }
    }

    if upscaled_by.is_none() {
        let file_name = p.file_name().and_then(|s| s.to_str()).unwrap_or("");
        if file_name.contains("_upscaled") {
            upscaled_by = Some("Unknown Model (Pre-existing upscale)".to_string());
        }
    }

    let created_time = if let Ok(created) = metadata.created() {
        let datetime: chrono::DateTime<chrono::Local> = created.into();
        datetime.format("%Y-%m-%d %H:%M:%S").to_string()
    } else {
        "Unknown".to_string()
    };

    let mut probe_cmd = std::process::Command::new("ffprobe");
    probe_cmd
        .args(["-v", "error", "-select_streams", "v:0",
               "-show_entries", "stream=width,height",
               "-of", "csv=s=x:p=0", &clean_path]);
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        probe_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    
    let (w, h) = if let Ok(out) = probe_cmd.output() {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        let parts: Vec<&str> = s.split('x').collect();
        if parts.len() == 2 {
            let width = parts[0].trim().parse::<u32>().unwrap_or(0);
            let height = parts[1].trim().parse::<u32>().unwrap_or(0);
            (width, height)
        } else {
            (0, 0)
        }
    } else {
        (0, 0)
    };

    let mut duration_cmd = std::process::Command::new("ffprobe");
    duration_cmd
        .args(["-v", "error", "-show_entries", "format=duration",
               "-of", "default=noprint_wrappers=1:nokey=1", &clean_path]);
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        duration_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let duration_sec = if let Ok(out) = duration_cmd.output() {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        s.parse::<f64>().ok()
    } else {
        None
    };

    Ok(serde_json::json!({
        "size": size_formatted,
        "format": extension,
        "path": path,
        "name": p.file_name().and_then(|s| s.to_str()).unwrap_or("Unknown"),
        "upscaled_by": upscaled_by,
        "created": created_time,
        "width": w,
        "height": h,
        "duration": duration_sec
    }))
}

#[tauri::command]
pub async fn rotate_media_on_disk(path: String, rotation: i32, is_image: bool) -> Result<String, String> {
    let path = clean_local_path(&path);
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
    
    let temp_dir = std::env::temp_dir();
    let temp_file_name = format!("{}_rot_{}.{}", stem, timestamp, ext);
    let temp_path = temp_dir.join(&temp_file_name);
    debug_log(&format!("temp_path={:?}", temp_path));

    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y");

    if is_image {
        cmd.arg("-threads").arg("1");
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
           .arg(filter)
           .arg("-map_metadata").arg("-1");

        if ext == "jpg" || ext == "jpeg" {
            cmd.arg("-q:v").arg("1");
        } else if ext == "webp" {
            cmd.arg("-quality").arg("100");
        }

        cmd.arg("-update").arg("1");
        cmd.arg(temp_path.to_string_lossy().to_string());
    } else {
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
        cmd.creation_flags(0x08000000);
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
            let _ = secure_delete_file(&temp_path);
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

    debug_log(&format!("Copying temp_path {:?} to original path {:?}", temp_path, path));
    if let Err(e) = fs::copy(&temp_path, &path) {
        let err_str = format!("Failed to overwrite original file: {}", e);
        debug_log(&err_str);
        return Err(err_str);
    }
    
    let _ = secure_delete_file(&temp_path);
    debug_log("SUCCESS — file rotated and saved successfully!");
    Ok(path)
}

#[tauri::command]
pub async fn mirror_media_on_disk(path: String, is_image: bool) -> Result<String, String> {
    let path = clean_local_path(&path);
    debug_log(&format!("START mirror_media_on_disk: path={}, is_image={}", path, is_image));
    tauri::async_runtime::spawn_blocking(move || {
        let path_obj = Path::new(&path);
        if !path_obj.exists() {
            return Err("File does not exist".to_string());
        }

        let ext = path_obj.extension().ok_or("No extension")?.to_string_lossy().to_lowercase();
        let stem = path_obj.file_stem().ok_or("No file stem")?.to_string_lossy().to_string();

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        
        let temp_dir = std::env::temp_dir();
        let temp_file_name = format!("{}_mir_{}.{}", stem, timestamp, ext);
        let temp_path = temp_dir.join(&temp_file_name);

        let mut cmd = Command::new("ffmpeg");
        cmd.arg("-y");

        if is_image {
            cmd.arg("-threads").arg("1");
            cmd.arg("-noautorotate")
               .arg("-i")
               .arg(&path)
               .arg("-vf")
               .arg("hflip")
               .arg("-map_metadata").arg("-1");

            if ext == "jpg" || ext == "jpeg" {
                cmd.arg("-q:v").arg("1");
            } else if ext == "webp" {
                cmd.arg("-quality").arg("100");
            }

            cmd.arg("-update").arg("1");
            cmd.arg(temp_path.to_string_lossy().to_string());
        } else {
            cmd.arg("-i")
               .arg(&path)
               .arg("-vf")
               .arg("hflip")
               .arg("-c:v")
               .arg("libx264")
               .arg("-preset")
               .arg("fast")
               .arg("-crf")
               .arg("22")
               .arg("-c:a")
               .arg("copy")
               .arg(temp_path.to_string_lossy().to_string());
        }

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }

        debug_log(&format!("Running ffmpeg: {:?}", cmd));
        let output = cmd.output().map_err(|e| format!("Failed to spawn ffmpeg: {}", e))?;

        if !output.status.success() {
            if temp_path.exists() {
                let _ = secure_delete_file(&temp_path);
            }
            return Err(format!("FFmpeg mirroring failed: {}", String::from_utf8_lossy(&output.stderr)));
        }

        if !temp_path.exists() {
            return Err("FFmpeg ran but mirror file was not created".to_string());
        }

        debug_log(&format!("Copying temp_path {:?} to original path {:?}", temp_path, path));
        fs::copy(&temp_path, &path).map_err(|e| format!("Failed to overwrite original: {}", e))?;
        let _ = secure_delete_file(&temp_path);

        Ok(path)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn apply_color_adjustments_on_disk(
    path: String,
    brightness: f32,
    contrast: f32,
    saturation: f32,
    hue: f32,
    gamma: f32,
    final_r: f32,
    final_g: f32,
    final_b: f32,
    alpha: f32,
    negative: bool,
    is_image: bool,
    save_as_copy: bool,
) -> Result<String, String> {
    let path = clean_local_path(&path);
    let log_msg = format!(
        "START apply_color_adjustments_on_disk: path={}, brightness={}, contrast={}, saturation={}, hue={}, gamma={}, final_r={}, final_g={}, final_b={}, alpha={}, negative={}, is_image={}, save_as_copy={}",
        path, brightness, contrast, saturation, hue, gamma, final_r, final_g, final_b, alpha, negative, is_image, save_as_copy
    );
    debug_log(&log_msg);

    let path_obj = Path::new(&path);
    if !path_obj.exists() {
        let err_msg = format!("File does not exist: {}", path);
        debug_log(&err_msg);
        return Err(err_msg);
    }

    let ext = path_obj.extension().ok_or("No extension")?.to_string_lossy().to_lowercase();
    let stem = path_obj.file_stem().ok_or("No file stem")?.to_string_lossy().to_string();
    let parent = path_obj.parent().ok_or("No parent dir")?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    
    let temp_dir = std::env::temp_dir();
    let temp_file_name = format!("{}_adj_{}.{}", stem, timestamp, ext);
    let temp_path = temp_dir.join(&temp_file_name);
    debug_log(&format!("temp_path={:?}", temp_path));

    let filter_str = format!(
        "lutrgb=r='clip(val*{},0,255)':g='clip(val*{},0,255)':b='clip(val*{},0,255)',eq=contrast={}:saturation={}:gamma={},hue=h={}{}",
        final_r * brightness * alpha,
        final_g * brightness * alpha,
        final_b * brightness * alpha,
        contrast,
        saturation,
        gamma,
        hue,
        if negative { ",negate" } else { "" }
    );
    debug_log(&format!("filter_str={}", filter_str));

    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y");

    if is_image {
        cmd.arg("-threads")
           .arg("1")
           .arg("-noautorotate")
           .arg("-i")
           .arg(&path)
           .arg("-vf")
           .arg(&filter_str)
           .arg("-map_metadata")
           .arg("-1");

        if ext == "jpg" || ext == "jpeg" {
            cmd.arg("-q:v").arg("1");
        } else if ext == "webp" {
            cmd.arg("-quality").arg("100");
        }
        cmd.arg("-update").arg("1");
        cmd.arg(temp_path.to_string_lossy().to_string());
    } else {
        cmd.arg("-i")
           .arg(&path)
           .arg("-vf")
           .arg(&filter_str)
           .arg("-c:v")
           .arg("libx264")
           .arg("-preset")
           .arg("fast")
           .arg("-crf")
           .arg("22")
           .arg("-c:a")
           .arg("copy")
           .arg(temp_path.to_string_lossy().to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
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
            let _ = secure_delete_file(&temp_path);
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

    let target_path = if save_as_copy {
        let mut index = 0;
        let mut check_path = parent.join(format!("{}_adjusted.{}", stem, ext));
        while check_path.exists() {
            index += 1;
            check_path = parent.join(format!("{}_adjusted.{}.{}", stem, index, ext));
        }
        check_path
    } else {
        PathBuf::from(&path)
    };

    debug_log(&format!("Copying temp_path {:?} to target path {:?}", temp_path, target_path));
    if let Err(e) = fs::copy(&temp_path, &target_path) {
        let _ = secure_delete_file(&temp_path);
        let err_str = format!("Failed to write to destination: {}", e);
        debug_log(&err_str);
        return Err(err_str);
    }
    
    let _ = secure_delete_file(&temp_path);
    debug_log("SUCCESS — file adjustments applied and saved!");
    Ok(target_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_drag_icon_path() -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let icon_path = temp_dir.join("cosmo_drag_icon.png");
    if !icon_path.exists() {
        let bytes = include_bytes!("../../icons/32x32.png");
        if let Err(e) = fs::write(&icon_path, bytes) {
            return Err(e.to_string());
        }
    }
    Ok(icon_path.to_string_lossy().to_string())
}

fn spawn_enhancement_server(app: Option<&AppHandle>) -> Result<(), String> {
    let (runner, args) = resolve_enhancer_command(app)?;
    let mut cmd = Command::new(&runner);
    cmd.args(&args);
    
    if let Some(models_dir) = resolve_models_dir(app) {
        cmd.env("COSMO_MODELS_DIR", &models_dir);
        println!("Passing COSMO_MODELS_DIR={} to enhancement server", models_dir);
    }

    if let Some(app) = app {
        if let Ok(app_data) = app.path().app_data_dir() {
            let _ = fs::create_dir_all(&app_data);
            cmd.current_dir(&app_data);
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    
    cmd.spawn().map_err(|e| format!("Failed to spawn AI enhancement server: {}", e))?;
    Ok(())
}

fn register_upscale_history(app: &AppHandle, file_path: &str, used_ai: bool) {
    if let Ok(app_data) = app.path().app_data_dir() {
        let history_file = app_data.join("upscale_history.json");
        let mut history: serde_json::Map<String, Value> = fs::read_to_string(&history_file)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();

        let model_desc = if used_ai {
            "Real-ESRGAN x4plus + GFPGAN v1.4 (GPU)"
        } else {
            "Bilateral Filter + INTER_CUBIC (CPU Fallback)"
        };

        history.insert(file_path.to_string(), Value::String(model_desc.to_string()));

        if let Ok(s) = serde_json::to_string_pretty(&history) {
            let _ = fs::create_dir_all(&app_data);
            let _ = fs::write(history_file, s);
        }
    }
}

#[tauri::command]
pub async fn extract_subject_on_disk(app: AppHandle, path: String) -> Result<String, String> {
    use std::io::{Write, Read};
    use std::net::TcpStream;

    let clean_path = clean_local_path(&path);
    let p = Path::new(&clean_path);
    if !p.exists() {
        return Err(format!("File does not exist: {}", clean_path));
    }

    let mut stream_connected = TcpStream::connect("127.0.0.1:12000").is_ok();
    
    if !stream_connected {
        println!("AI enhancer server offline. Spawning background server...");
        if let Ok(_) = spawn_enhancement_server(Some(&app)) {
            for _ in 0..30 {
                std::thread::sleep(std::time::Duration::from_millis(500));
                if TcpStream::connect("127.0.0.1:12000").is_ok() {
                    stream_connected = true;
                    println!("AI Enhancement Server booted and connected on port 12000 for cutout!");
                    break;
                }
            }
        }
    }

    if !stream_connected {
        return Err("AI Enhancement Server is offline and could not be started automatically. Please verify local Python dependencies.".into());
    }

    let mut server_success = false;
    let mut sticker_path = String::new();

    if let Ok(mut stream) = TcpStream::connect("127.0.0.1:12000") {
        let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(30)));
        let _ = stream.set_write_timeout(Some(std::time::Duration::from_secs(30)));
        let json_payload = serde_json::json!({
            "path": clean_path
        }).to_string();

        let request = format!(
            "POST /remove_background HTTP/1.1\r\n\
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
                    if let Ok(parsed) = serde_json::from_str::<Value>(body) {
                        if parsed.get("status").and_then(|s| s.as_str()) == Some("success") {
                            if let Some(out_p) = parsed.get("path").and_then(|v| v.as_str()) {
                                  sticker_path = out_p.to_string();
                                  server_success = true;
                            }
                        } else if let Some(err_msg) = parsed.get("error").and_then(|e| e.as_str()) {
                            return Err(format!("Background removal server error: {}", err_msg));
                        }
                    }
                }
            }
        }
    }

    if server_success && !sticker_path.is_empty() {
        Ok(sticker_path)
    } else {
        Err("Failed to process background removal. Make sure 'rembg' Python library is fully installed.".into())
    }
}

#[tauri::command]
pub async fn upscale_image(app: AppHandle, path: String, overwrite: bool) -> Result<String, String> {
    let path = clean_local_path(&path);
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

    let output_path = if overwrite {
        let temp_dir = std::env::temp_dir();
        let temp_file_name = format!("{}_upscale_temp_{}.{}", stem, timestamp, ext);
        temp_dir.join(&temp_file_name)
    } else {
        let parent = p.parent().unwrap_or_else(|| Path::new("."));
        let base_prefix = crate::commands::filesystem::extract_base_prefix(&stem);
        let next_num = crate::commands::filesystem::get_next_sequence_num(parent, &base_prefix, &ext);
        let mut final_path = parent.join(format!("{}_{:03}.{}", base_prefix, next_num, ext));
        let mut counter = next_num;
        while final_path.exists() {
            counter += 1;
            final_path = parent.join(format!("{}_{:03}.{}", base_prefix, counter, &ext));
        }
        final_path
    };

    let out_str = output_path.to_string_lossy().to_string();

    let mut stream_connected = std::net::TcpStream::connect("127.0.0.1:12000").is_ok();
    
    if !stream_connected {
        println!("AI enhancer server offline. Spawning background server...");
        if let Ok(_) = spawn_enhancement_server(Some(&app)) {
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
    let mut server_used_ai = false;

    if stream_connected {
        if let Ok(mut stream) = std::net::TcpStream::connect("127.0.0.1:12000") {
            let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(30)));
            let _ = stream.set_write_timeout(Some(std::time::Duration::from_secs(30)));
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
                        if let Ok(parsed) = serde_json::from_str::<Value>(body) {
                            if parsed.get("status").and_then(|s| s.as_str()) == Some("success") {
                                let used_ai = parsed.get("used_ai").and_then(|v| v.as_bool()).unwrap_or(false);
                                if !used_ai {
                                    println!("WARNING: Upscale completed but AI models were NOT loaded — fallback resize was used.");
                                }
                                server_success = true;
                                server_used_ai = used_ai;
                            }
                        }
                    }
                }
            }
        }
    }

    if server_success {
        let prefix = if !server_used_ai { "[FALLBACK]" } else { "" };
        let final_saved_path = if overwrite {
            if let Err(e) = fs::copy(&output_path, &p) {
                let _ = fs::remove_file(&output_path);
                return Err(format!("Failed to overwrite original file: {}", e));
            }
            let _ = fs::remove_file(&output_path);
            path.clone()
        } else {
            out_str.clone()
        };

        register_upscale_history(&app, &final_saved_path, server_used_ai);

        return Ok(format!("{}{}", prefix, final_saved_path));
    }

    println!("HTTP server upscale failed or server couldn't start. Falling back to CLI mode...");
    let (runner, mut args) = resolve_enhancer_command(Some(&app))?;
    
    args.push(path.clone());
    args.push(output_path.to_string_lossy().to_string());

    let mut cmd = Command::new(&runner);
    cmd.args(&args);

    if let Ok(app_data) = app.path().app_data_dir() {
        let _ = fs::create_dir_all(&app_data);
        cmd.current_dir(&app_data);
    }

    if let Some(models_dir) = resolve_models_dir(Some(&app)) {
        cmd.env("COSMO_MODELS_DIR", &models_dir);
    }

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
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::OpenOptions::new()
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
            let _ = fs::remove_file(&output_path);
        }
        return Err(format!(
            "Upscale failed (exit {:?}): {}",
            output.status.code(),
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let cli_used_ai = stdout_str.contains("[USED_AI=True]") || stdout_str.contains("[USED_AI=true]");

    let final_saved_path = if overwrite {
        if let Err(e) = fs::copy(&output_path, &p) {
            let _ = fs::remove_file(&output_path);
            return Err(format!("Failed to overwrite original file: {}", e));
        }
        let _ = fs::remove_file(&output_path);
        path.clone()
    } else {
        output_path.to_string_lossy().to_string()
    };

    register_upscale_history(&app, &final_saved_path, cli_used_ai);

    let prefix = if !cli_used_ai { "[FALLBACK]" } else { "" };
    Ok(format!("{}{}", prefix, final_saved_path))
}

#[tauri::command]
pub fn cancel_video_upscale() {
    CANCEL_UPSCALE.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub async fn upscale_video(app: AppHandle, path: String, overwrite: bool) -> Result<String, String> {
    let path = clean_local_path(&path);
    use std::time::{SystemTime, UNIX_EPOCH};
    use std::os::windows::process::CommandExt;
    
    CANCEL_UPSCALE.store(false, Ordering::SeqCst);
    
    let p = Path::new(&path);
    if !p.exists() {
        return Err("File does not exist".into());
    }
    
    let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("mp4").to_lowercase();
    let Some(stem) = p.file_stem().and_then(|s| s.to_str()) else {
        return Err("Invalid file name".into());
    };
    
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
    let parent = p.parent().unwrap_or_else(|| Path::new("."));
    
    let output_path = if overwrite {
        let temp_dir = std::env::temp_dir();
        let temp_file_name = format!("{}_upscale_temp_{}.{}", stem, timestamp, ext);
        temp_dir.join(&temp_file_name)
    } else {
        let base_prefix = crate::commands::filesystem::extract_base_prefix(&stem);
        let next_num = crate::commands::filesystem::get_next_sequence_num(parent, &base_prefix, &ext);
        let mut final_path = parent.join(format!("{}_{:03}.{}", base_prefix, next_num, ext));
        let mut counter = next_num;
        while final_path.exists() {
            counter += 1;
            final_path = parent.join(format!("{}_{:03}.{}", base_prefix, counter, &ext));
        }
        final_path
    };
    
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let temp_frames_dir = app_data.join(format!("video_upscale_{}", timestamp));
    fs::create_dir_all(&temp_frames_dir).map_err(|e| format!("Failed to create temp frames dir: {}", e))?;
    
    let _ = app.emit("upscale-progress", UpscaleProgress { frame: 0, total: 100, stage: "extracting".into() });
    
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    
    let fps_out = Command::new("ffprobe")
        .args(["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "default=noprint_wrappers=1:nokey=1", &path])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("ffprobe failed to resolve framerate: {}", e))?;
    let fps_str = String::from_utf8_lossy(&fps_out.stdout).trim().to_string();
    
    let frames_out = Command::new("ffprobe")
        .args(["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=nb_frames", "-of", "default=noprint_wrappers=1:nokey=1", &path])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("ffprobe failed to resolve frame count: {}", e))?;
    let frames_str = String::from_utf8_lossy(&frames_out.stdout).trim().to_string();
    let total_frames: u32 = frames_str.parse().unwrap_or(0);
    
    if total_frames == 0 {
        let _ = secure_delete_dir_all(&temp_frames_dir);
        return Err("Could not determine total frame count of video".into());
    }
    
    let extract_status = Command::new("ffmpeg")
        .args(["-y", "-i", &path, "-q:v", "2", &temp_frames_dir.join("frame_%06d.png").to_string_lossy().to_string()])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| format!("Failed to start ffmpeg for extraction: {}", e))?;
        
    if !extract_status.success() {
        let _ = secure_delete_dir_all(&temp_frames_dir);
        return Err("Failed to extract video frames".into());
    }
    
    let mut stream_connected = std::net::TcpStream::connect("127.0.0.1:12000").is_ok();
    if !stream_connected {
        if let Ok(_) = spawn_enhancement_server(Some(&app)) {
            for _ in 0..30 {
                std::thread::sleep(std::time::Duration::from_millis(500));
                if std::net::TcpStream::connect("127.0.0.1:12000").is_ok() {
                    stream_connected = true;
                    break;
                }
            }
        }
    }
    
    if !stream_connected {
        let _ = secure_delete_dir_all(&temp_frames_dir);
        return Err("AI Enhancement server is offline or failed to boot".into());
    }
    
    let mut used_ai_global = false;
    for i in 1..=total_frames {
        if CANCEL_UPSCALE.load(Ordering::SeqCst) {
            let _ = secure_delete_dir_all(&temp_frames_dir);
            return Err("Upscaling cancelled by user".into());
        }
        
        let frame_name = format!("frame_{:06}.png", i);
        let frame_path = temp_frames_dir.join(&frame_name);
        
        if !frame_path.exists() {
            break;
        }
        
        let _ = app.emit("upscale-progress", UpscaleProgress {
            frame: i,
            total: total_frames,
            stage: "upscaling".into(),
        });
        
        let frame_path_str = frame_path.to_string_lossy().to_string();
        let mut server_success = false;
        
        if let Ok(mut stream) = std::net::TcpStream::connect("127.0.0.1:12000") {
            let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(30)));
            let _ = stream.set_write_timeout(Some(std::time::Duration::from_secs(30)));
            use std::io::{Write, Read};
            let json_payload = serde_json::json!({
                "path": frame_path_str,
                "output_path": frame_path_str,
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
                        if let Ok(parsed) = serde_json::from_str::<Value>(body) {
                            if parsed.get("status").and_then(|s| s.as_str()) == Some("success") {
                                let used_ai = parsed.get("used_ai").and_then(|v| v.as_bool()).unwrap_or(false);
                                if used_ai {
                                    used_ai_global = true;
                                }
                                server_success = true;
                            }
                        }
                    }
                }
            }
        }
        
        if !server_success {
            let (runner, mut args) = resolve_enhancer_command(Some(&app))?;
            args.push(frame_path_str.clone());
            args.push(frame_path_str.clone());
            let mut cmd = Command::new(&runner);
            cmd.args(&args);
            cmd.current_dir(&app_data);
            if let Some(models_dir) = resolve_models_dir(Some(&app)) {
                cmd.env("COSMO_MODELS_DIR", &models_dir);
            }
            cmd.creation_flags(CREATE_NO_WINDOW);
            let out = cmd.output();
            if let Ok(ref output) = out {
                if output.status.success() {
                    let stdout_str = String::from_utf8_lossy(&output.stdout);
                    let cli_used_ai = stdout_str.contains("[USED_AI=True]") || stdout_str.contains("[USED_AI=true]");
                    if cli_used_ai {
                        used_ai_global = true;
                    }
                }
            }
        }
    }
    
    let _ = app.emit("upscale-progress", UpscaleProgress { frame: total_frames, total: total_frames, stage: "assembling".into() });
    
    let out_str = output_path.to_string_lossy().to_string();
    
    let stitch_status = Command::new("ffmpeg")
        .args([
            "-y",
            "-f", "image2",
            "-framerate", &fps_str,
            "-i", &temp_frames_dir.join("frame_%06d.png").to_string_lossy().to_string(),
            "-i", &path,
            "-map", "0:v:0",
            "-map", "1:a:0?",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-movflags", "+faststart",
            &out_str
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| format!("Failed to stitch upscaled video: {}", e))?;
        
    let _ = secure_delete_dir_all(&temp_frames_dir);
    
    if !stitch_status.success() {
        return Err("FFmpeg stitching failed".into());
    }
    
    let final_saved_path = if overwrite {
        if let Err(e) = fs::copy(&output_path, &p) {
            let _ = secure_delete_file(&output_path);
            return Err(format!("Failed to overwrite original video file: {}", e));
        }
        let _ = secure_delete_file(&output_path);
        path.clone()
    } else {
        out_str.clone()
    };
    
    register_upscale_history(&app, &final_saved_path, used_ai_global);
    
    let prefix = if !used_ai_global { "[FALLBACK]" } else { "" };
    Ok(format!("{}{}", prefix, final_saved_path))
}

#[tauri::command]
pub fn enhance_image_crop(app: AppHandle, base64_data: String) -> Result<String, String> {
    use std::io::Write;
    use std::net::TcpStream;

    let mut stream_connected = TcpStream::connect("127.0.0.1:12000").is_ok();
    
    if !stream_connected {
        println!("AI crop enhancement requested but server is offline. Spawning background server...");
        if let Ok(_) = spawn_enhancement_server(Some(&app)) {
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
    
    if let Some(pos) = response_str.find("\r\n\r\n") {
        let body = &response_str[pos + 4..];
        
        let parsed: Value = serde_json::from_str(body).map_err(|e| format!("Upscaling server returned invalid JSON: {}", e))?;
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
pub async fn auto_erase_watermark(
    app: AppHandle,
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
        if let Ok(_) = spawn_enhancement_server(Some(&app)) {
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
    
    if let Some(pos) = response_str.find("\r\n\r\n") {
        let body = &response_str[pos + 4..];
        
        let parsed: Value = serde_json::from_str(body).map_err(|e| format!("Inpainting server returned invalid JSON: {}", e))?;
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
pub async fn save_inpainted_image(path: String, base64_data: String) -> Result<(), String> {
    let path = clean_local_path(&path);
    use std::fs::File;
    use std::io::Write;
    
    let decoded = general_purpose::STANDARD
        .decode(base64_data.trim())
        .map_err(|e| format!("Failed to decode base64 data: {}", e))?;
        
    let mut file = File::create(&path).map_err(|e| format!("Failed to open file for writing: {}", e))?;
    file.write_all(&decoded).map_err(|e| format!("Failed to write decoded bytes to disk: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub async fn crop_image_on_disk(
    path: String,
    crop_x: f64,
    crop_y: f64,
    crop_w: f64,
    crop_h: f64,
    overwrite: bool,
) -> Result<String, String> {
    let path = clean_local_path(&path);
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    debug_log(&format!(
        "START crop_image_on_disk: path={}, crop_x={}, crop_y={}, crop_w={}, crop_h={}, overwrite={}",
        path, crop_x, crop_y, crop_w, crop_h, overwrite
    ));

    tauri::async_runtime::spawn_blocking(move || {
        let path_obj = Path::new(&path);
        if !path_obj.exists() {
            return Err("File does not exist".to_string());
        }

        let ext = path_obj.extension().ok_or("No extension")?.to_string_lossy().to_lowercase();
        let stem = path_obj.file_stem().ok_or("No file stem")?.to_string_lossy().to_string();
        let parent = path_obj.parent().ok_or("No parent dir")?;

        let mut probe_cmd = Command::new("ffprobe");
        probe_cmd
            .args(["-v", "error", "-select_streams", "v:0",
                   "-show_entries", "stream=width,height",
                   "-of", "csv=s=x:p=0", &path]);
        probe_cmd.creation_flags(CREATE_NO_WINDOW);

        let probe_out = probe_cmd.output().map_err(|e| format!("ffprobe failed: {}", e))?;
        let dims_str = String::from_utf8_lossy(&probe_out.stdout).trim().to_string();
        let parts: Vec<&str> = dims_str.split('x').collect();
        if parts.len() != 2 {
            return Err(format!("Could not parse image dimensions from ffprobe: '{}'", dims_str));
        }
        let img_w: f64 = parts[0].trim().parse().map_err(|_| format!("Bad width: {}", parts[0]))?;
        let img_h: f64 = parts[1].trim().parse().map_err(|_| format!("Bad height: {}", parts[1]))?;

        let px_x = ((crop_x / 100.0) * img_w).round() as u64;
        let px_y = ((crop_y / 100.0) * img_h).round() as u64;
        let px_w = ((crop_w / 100.0) * img_w).round() as u64;
        let px_h = ((crop_h / 100.0) * img_h).round() as u64;

        if px_w == 0 || px_h == 0 {
            return Err("Crop dimensions are zero".to_string());
        }

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();

        let temp_dir = std::env::temp_dir();
        let temp_file_name = format!("{}_crop_{}.{}", stem, timestamp, ext);
        let temp_path = temp_dir.join(&temp_file_name);

        let crop_filter = format!("crop={}:{}:{}:{}", px_w, px_h, px_x, px_y);

        let mut cmd = Command::new("ffmpeg");
        cmd.arg("-y")
           .arg("-threads").arg("1")
           .arg("-noautorotate")
           .arg("-i").arg(&path)
           .arg("-vf").arg(&crop_filter)
           .arg("-map_metadata").arg("-1");

        if ext == "jpg" || ext == "jpeg" {
            cmd.arg("-q:v").arg("1");
        } else if ext == "webp" {
            cmd.arg("-quality").arg("100");
        }

        cmd.arg("-update").arg("1");
        cmd.arg(temp_path.to_string_lossy().to_string());
        cmd.creation_flags(CREATE_NO_WINDOW);

        debug_log(&format!("Running ffmpeg crop: {:?}", cmd));
        let output = cmd.output().map_err(|e| format!("Failed to spawn ffmpeg: {}", e))?;
        let stderr_str = String::from_utf8_lossy(&output.stderr).to_string();
        debug_log(&format!("ffmpeg crop exit: {}, stderr: {}", output.status, stderr_str));

        if !output.status.success() {
            if temp_path.exists() { let _ = secure_delete_file(&temp_path); }
            return Err(format!("FFmpeg crop failed: {}", stderr_str));
        }
        if !temp_path.exists() {
            return Err("FFmpeg ran but crop file was not created".to_string());
        }

        let target_path = if overwrite {
            PathBuf::from(&path)
        } else {
            let base_prefix = crate::commands::filesystem::extract_base_prefix(&stem);
            let next_num = crate::commands::filesystem::get_next_sequence_num(parent, &base_prefix, &ext);
            let mut candidate = parent.join(format!("{}_{:03}.{}", base_prefix, next_num, ext));
            let mut counter = next_num;
            while candidate.exists() {
                counter += 1;
                candidate = parent.join(format!("{}_{:03}.{}", base_prefix, counter, &ext));
            }
            candidate
        };

        fs::copy(&temp_path, &target_path)
            .map_err(|e| format!("Failed to write crop to destination: {}", e))?;
        let _ = secure_delete_file(&temp_path);

        debug_log(&format!("Crop saved to: {:?}", target_path));
        Ok(target_path.to_string_lossy().to_string())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn resize_image_on_disk(
    path: String,
    width: u32,
    height: u32,
    overwrite: bool,
) -> Result<String, String> {
    let path = clean_local_path(&path);
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    use std::path::{Path, PathBuf};
    use std::fs;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    debug_log(&format!(
        "START resize_image_on_disk: path={}, width={}, height={}, overwrite={}",
        path, width, height, overwrite
    ));

    tauri::async_runtime::spawn_blocking(move || {
        let path_obj = Path::new(&path);
        if !path_obj.exists() {
            return Err("File does not exist".to_string());
        }

        let ext = path_obj.extension().ok_or("No extension")?.to_string_lossy().to_lowercase();
        let stem = path_obj.file_stem().ok_or("No file stem")?.to_string_lossy().to_string();
        let parent = path_obj.parent().ok_or("No parent dir")?;

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();

        let temp_dir = std::env::temp_dir();
        let temp_file_name = format!("{}_resize_{}.{}", stem, timestamp, ext);
        let temp_path = temp_dir.join(&temp_file_name);

        let scale_filter = format!("scale={}:{}", width, height);

        let mut cmd = Command::new("ffmpeg");
        cmd.arg("-y")
           .arg("-threads").arg("1")
           .arg("-noautorotate")
           .arg("-i").arg(&path)
           .arg("-vf").arg(&scale_filter)
           .arg("-map_metadata").arg("-1");

        if ext == "jpg" || ext == "jpeg" {
            cmd.arg("-q:v").arg("1");
        } else if ext == "webp" {
            cmd.arg("-quality").arg("100");
        }

        cmd.arg("-update").arg("1");
        cmd.arg(temp_path.to_string_lossy().to_string());
        cmd.creation_flags(CREATE_NO_WINDOW);

        debug_log(&format!("Running ffmpeg resize: {:?}", cmd));
        let output = cmd.output().map_err(|e| format!("Failed to spawn ffmpeg: {}", e))?;
        let stderr_str = String::from_utf8_lossy(&output.stderr).to_string();
        debug_log(&format!("ffmpeg resize exit: {}, stderr: {}", output.status, stderr_str));

        if !output.status.success() {
            if temp_path.exists() { let _ = secure_delete_file(&temp_path); }
            return Err(format!("FFmpeg resize failed: {}", stderr_str));
        }
        if !temp_path.exists() {
            return Err("FFmpeg ran but resize file was not created".to_string());
        }

        let target_path = if overwrite {
            PathBuf::from(&path)
        } else {
            let base_prefix = crate::commands::filesystem::extract_base_prefix(&stem);
            let next_num = crate::commands::filesystem::get_next_sequence_num(parent, &base_prefix, &ext);
            let mut candidate = parent.join(format!("{}_{:03}.{}", base_prefix, next_num, ext));
            let mut counter = next_num;
            while candidate.exists() {
                counter += 1;
                candidate = parent.join(format!("{}_{:03}.{}", base_prefix, counter, &ext));
            }
            candidate
        };

        fs::copy(&temp_path, &target_path)
            .map_err(|e| format!("Failed to write resize to destination: {}", e))?;
        let _ = secure_delete_file(&temp_path);

        debug_log(&format!("Resize saved to: {:?}", target_path));
        Ok(target_path.to_string_lossy().to_string())
    }).await.map_err(|e| e.to_string())?
}


#[tauri::command]
pub async fn generate_store_logos(app: AppHandle, path: String, bg_color: String) -> Result<String, String> {
    let clean_path = clean_local_path(&path);
    let p = Path::new(&clean_path);
    if !p.exists() {
        return Err(format!("File does not exist: {}", clean_path));
    }

    let mut stream_connected = std::net::TcpStream::connect("127.0.0.1:12000").is_ok();
    if !stream_connected {
        println!("AI enhancer server offline. Spawning background server...");
        if let Ok(_) = spawn_enhancement_server(Some(&app)) {
            for _ in 0..30 {
                std::thread::sleep(std::time::Duration::from_millis(500));
                if std::net::TcpStream::connect("127.0.0.1:12000").is_ok() {
                    stream_connected = true;
                    break;
                }
            }
        }
    }

    if !stream_connected {
        return Err("AI Enhancement Server is offline and could not be started automatically.".into());
    }

    if let Ok(mut stream) = std::net::TcpStream::connect("127.0.0.1:12000") {
        let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(30)));
        let _ = stream.set_write_timeout(Some(std::time::Duration::from_secs(30)));
        use std::io::{Write, Read};

        let json_payload = serde_json::json!({
            "path": clean_path,
            "bg_color": bg_color
        }).to_string();

        let request = format!(
            "POST /generate_store_logos HTTP/1.1\r\n\
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
                    if let Ok(parsed) = serde_json::from_str::<Value>(body) {
                        if parsed.get("status").and_then(|s| s.as_str()) == Some("success") {
                            if let Some(out_dir) = parsed.get("output_dir").and_then(|v| v.as_str()) {
                                return Ok(out_dir.to_string());
                            }
                        } else if let Some(err_msg) = parsed.get("error").and_then(|e| e.as_str()) {
                            return Err(format!("Server error: {}", err_msg));
                        }
                    }
                }
            }
        }
    }

    Err("Failed to communicate with the logo generator server.".into())
}
