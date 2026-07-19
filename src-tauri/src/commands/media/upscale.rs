use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::io::{Read, Write};
use tauri::{AppHandle, Emitter, Manager};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use crate::commands::filesystem::clean_local_path;
use crate::commands::system::{
    resolve_enhancer_command, resolve_models_dir,
};
use crate::commands::server::{secure_delete_file, secure_delete_dir_all};
use serde_json::{self, Value};

use super::utils::{
    new_hidden_command, new_hidden_ffmpeg_command, new_hidden_ffprobe_command,
    get_next_upscale_filename,
};

pub static CANCEL_UPSCALE: AtomicBool = AtomicBool::new(false);

#[derive(serde::Serialize, Clone)]
pub struct UpscaleProgress {
    pub frame: u32,
    pub total: u32,
    pub stage: String,
}

pub fn spawn_enhancement_server(app: Option<&AppHandle>) -> Result<(), String> {
    let (runner, args) = resolve_enhancer_command(app)?;
    let mut cmd = new_hidden_command(&runner);
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

fn convert_png_to_webp(png_path: &str) -> Result<String, String> {
    let png_path_buf = Path::new(png_path);
    if !png_path_buf.exists() {
        return Err("PNG file not found".to_string());
    }

    let webp_path = png_path_buf.with_extension("webp");
    
    let img = image::ImageReader::open(&png_path_buf)
        .map_err(|e| format!("Failed to open PNG reader: {}", e))?
        .decode()
        .map_err(|e| format!("Failed to decode PNG: {}", e))?;
    
    let mut rgba_img = img.into_rgba8();
    
    for pixel in rgba_img.pixels_mut() {
        if pixel[3] < 5 {
            pixel[0] = 0;
            pixel[1] = 0;
            pixel[2] = 0;
            pixel[3] = 0;
        }
    }
    
    let file = std::fs::File::create(&webp_path)
        .map_err(|e| format!("Failed to create WebP file: {}", e))?;
    
    let encoder = image::codecs::webp::WebPEncoder::new_lossless(file);
    
    use image::ImageEncoder;
    encoder.write_image(
        rgba_img.as_raw(),
        rgba_img.width(),
        rgba_img.height(),
        image::ExtendedColorType::Rgba8
    ).map_err(|e| format!("Failed to encode WebP: {}", e))?;
    
    let _ = std::fs::remove_file(png_path_buf);
    
    Ok(webp_path.to_string_lossy().to_string())
}

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

pub async fn extract_subject_on_disk(app: AppHandle, path: String) -> Result<String, String> {
    use std::net::TcpStream;

    let clean_path = clean_local_path(&path);
    
    let p = Path::new(&clean_path);
    if !p.exists() {
        return Err(format!("File does not exist: {}", clean_path));
    }

    let mut stream_connected = TcpStream::connect("127.0.0.1:12000").is_ok();
    
    if !stream_connected {
        println!("AI enhancer server offline. Spawning background server...");
        if spawn_enhancement_server(Some(&app)).is_ok() {
            for _ in 0..100 {
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

    let max_attempts = 2;
    for attempt in 1..=max_attempts {
        let mut server_success = false;
        let mut sticker_path = String::new();
        let mut server_error: Option<String> = None;

        if let Ok(mut stream) = TcpStream::connect("127.0.0.1:12000") {
            let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(180)));
            let _ = stream.set_write_timeout(Some(std::time::Duration::from_secs(180)));
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
                                server_error = Some(err_msg.to_string());
                            }
                        }
                    }
                }
            }
        }

        if server_success && !sticker_path.is_empty() {
            if sticker_path.to_lowercase().ends_with(".png") {
                match convert_png_to_webp(&sticker_path) {
                    Ok(webp_path) => return Ok(webp_path),
                    Err(e) => {
                        println!("Failed to convert sticker PNG to WebP: {}. Returning original PNG.", e);
                        return Ok(sticker_path);
                    }
                }
            }
            return Ok(sticker_path);
        }

        if attempt < max_attempts {
            println!("AI sticker attempt {} failed ({}). Retrying in 2s...",
                attempt, server_error.as_deref().unwrap_or("unknown"));
            std::thread::sleep(std::time::Duration::from_secs(2));
            continue;
        }

        if let Some(err_msg) = server_error {
            return Err(format!("Background removal server error: {}", err_msg));
        }
    }

    Err("Failed to process background removal. Make sure 'rembg' Python library is fully installed.".into())
}

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
        let parent = p.parent().unwrap_or_else(|| Path::new("."));
        let temp_file_name = format!("{}_upscale_temp_{}.{}", stem, timestamp, ext);
        parent.join(&temp_file_name)
    } else {
        let parent = p.parent().unwrap_or_else(|| Path::new("."));
        get_next_upscale_filename(parent, stem, &ext)
    };

    let out_str = output_path.to_string_lossy().to_string();

    let mut stream_connected = std::net::TcpStream::connect("127.0.0.1:12000").is_ok();
    
    if !stream_connected {
        println!("AI enhancer server offline. Spawning background server...");
        if spawn_enhancement_server(Some(&app)).is_ok() {
            for _ in 0..100 {
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
            let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(180)));
            let _ = stream.set_write_timeout(Some(std::time::Duration::from_secs(180)));
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
    
    let mut run_native_fallback = true;
    let mut cli_used_ai = false;

    if let Ok((runner, mut args)) = resolve_enhancer_command(Some(&app)) {
        args.push(path.clone());
        args.push(output_path.to_string_lossy().to_string());

        let mut cmd = new_hidden_command(&runner);
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

        if let Ok(output) = cmd.output() {
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

            if output.status.success() {
                let stdout_str = String::from_utf8_lossy(&output.stdout);
                cli_used_ai = stdout_str.contains("[USED_AI=True]") || stdout_str.contains("[USED_AI=true]");
                run_native_fallback = false;
            } else {
                println!("CLI upscaler returned error status. Falling back to native Rust upscaler.");
            }
        } else {
            println!("Failed to run CLI upscaler command. Falling back to native Rust upscaler.");
        }
    } else {
        println!("Could not resolve CLI upscaler command. Falling back to native Rust upscaler.");
    }

    if run_native_fallback {
        println!("Performing native Rust image upscale fallback (Lanczos3)...");
        match image::ImageReader::open(&path)
            .map_err(|e| format!("Failed to open source image: {}", e))
            .and_then(|r| r.decode().map_err(|e| format!("Failed to decode source image: {}", e)))
        {
            Ok(img) => {
                let (w, h) = (img.width(), img.height());
                let target_w = w * 4;
                let target_h = h * 4;
                let max_width = 3840;
                let max_height = 2160;

                let (final_w, final_h) = if target_w > max_width || target_h > max_height {
                    let scale = (max_width as f64 / target_w as f64).min(max_height as f64 / target_h as f64);
                    ((target_w as f64 * scale) as u32, (target_h as f64 * scale) as u32)
                } else {
                    (target_w, target_h)
                };

                let resized = img.resize(final_w, final_h, image::imageops::FilterType::Lanczos3);
                if let Err(e) = resized.save(&output_path) {
                    if overwrite && output_path.exists() {
                        let _ = fs::remove_file(&output_path);
                    }
                    return Err(format!("Failed to save downscaled native fallback image: {}", e));
                }
            }
            Err(e) => {
                if overwrite && output_path.exists() {
                    let _ = fs::remove_file(&output_path);
                }
                return Err(format!("Native upscaler fallback failed: {}", e));
            }
        }
    }

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

pub fn cancel_video_upscale() {
    CANCEL_UPSCALE.store(true, Ordering::SeqCst);
}

pub async fn upscale_video(app: AppHandle, path: String, overwrite: bool) -> Result<String, String> {
    let path = clean_local_path(&path);

    use std::time::{SystemTime, UNIX_EPOCH};
    
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
        let temp_file_name = format!("{}_upscale_temp_{}.{}", stem, timestamp, ext);
        parent.join(&temp_file_name)
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
    
    let mut fps_cmd = new_hidden_ffprobe_command(Some(&app));
    fps_cmd.args(["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "default=noprint_wrappers=1:nokey=1", &path]);
    #[cfg(windows)]
    fps_cmd.creation_flags(CREATE_NO_WINDOW);

    let fps_out = fps_cmd.output().map_err(|e| format!("ffprobe failed to resolve framerate: {}", e))?;
    let fps_str = String::from_utf8_lossy(&fps_out.stdout).trim().to_string();
    
    let mut frames_cmd = new_hidden_ffprobe_command(Some(&app));
    frames_cmd.args(["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=nb_frames", "-of", "default=noprint_wrappers=1:nokey=1", &path]);
    #[cfg(windows)]
    frames_cmd.creation_flags(CREATE_NO_WINDOW);

    let frames_out = frames_cmd.output().map_err(|e| format!("ffprobe failed to resolve frame count: {}", e))?;
    let frames_str = String::from_utf8_lossy(&frames_out.stdout).trim().to_string();
    let total_frames: u32 = frames_str.parse().unwrap_or(0);
    
    if total_frames == 0 {
        let _ = secure_delete_dir_all(&temp_frames_dir);
        return Err("Could not determine total frame count of video".into());
    }
    
    let mut ext_cmd = new_hidden_ffmpeg_command(Some(&app));
    ext_cmd.args(["-y", "-i", &path, "-q:v", "2", &temp_frames_dir.join("frame_%06d.png").to_string_lossy().to_string()]);
    #[cfg(windows)]
    ext_cmd.creation_flags(CREATE_NO_WINDOW);

    let extract_status = ext_cmd.status().map_err(|e| format!("Failed to start ffmpeg for extraction: {}", e))?;
        
    if !extract_status.success() {
        let _ = secure_delete_dir_all(&temp_frames_dir);
        return Err("Failed to extract video frames".into());
    }
    
    let mut stream_connected = std::net::TcpStream::connect("127.0.0.1:12000").is_ok();
    if !stream_connected {
        if spawn_enhancement_server(Some(&app)).is_ok() {
            for _ in 0..100 {
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
            let mut cmd = new_hidden_command(&runner);
            cmd.args(&args);
            cmd.current_dir(&app_data);
            if let Some(models_dir) = resolve_models_dir(Some(&app)) {
                cmd.env("COSMO_MODELS_DIR", &models_dir);
            }
            #[cfg(windows)]
            cmd.creation_flags(CREATE_NO_WINDOW);

            let out = cmd.output();
            let mut fallback_success = false;
            if let Ok(ref output) = out {
                if output.status.success() {
                    let stdout_str = String::from_utf8_lossy(&output.stdout);
                    let cli_used_ai = stdout_str.contains("[USED_AI=True]") || stdout_str.contains("[USED_AI=true]");
                    if cli_used_ai {
                        used_ai_global = true;
                    }
                    fallback_success = true;
                }
            }
            if !fallback_success {
                let _ = secure_delete_dir_all(&temp_frames_dir);
                return Err("Upscaling failed: Both server and CLI fallback failed to process frame. Your GPU may be out of VRAM or CUDA errored.".into());
            }
        }
    }
    
    let _ = app.emit("upscale-progress", UpscaleProgress { frame: total_frames, total: total_frames, stage: "assembling".into() });
    
    let out_str = output_path.to_string_lossy().to_string();
    
    let mut stitch_cmd = new_hidden_ffmpeg_command(Some(&app));
    stitch_cmd.args([
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
    ]);
    #[cfg(windows)]
    stitch_cmd.creation_flags(CREATE_NO_WINDOW);

    let stitch_status = stitch_cmd.status().map_err(|e| format!("Failed to stitch upscaled video: {}", e))?;
        
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

pub fn enhance_image_crop(app: AppHandle, base64_data: String) -> Result<String, String> {
    use std::net::TcpStream;

    let mut stream_connected = TcpStream::connect("127.0.0.1:12000").is_ok();
    
    if !stream_connected {
        println!("AI crop enhancement requested but server is offline. Spawning background server...");
        if spawn_enhancement_server(Some(&app)).is_ok() {
            for _ in 0..100 {
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
