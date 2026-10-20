use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use serde_json::Value;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use crate::commands::filesystem::clean_local_path;
use crate::commands::server::{secure_delete_file, secure_delete_dir_all};
use crate::commands::system::{resolve_enhancer_command, resolve_models_dir};
use super::super::utils::{new_hidden_command, new_hidden_ffmpeg_command, new_hidden_ffprobe_command};
use super::persistence::register_upscale_history;
use super::server::spawn_enhancement_server;

pub static CANCEL_UPSCALE: AtomicBool = AtomicBool::new(false);

#[derive(serde::Serialize, Clone)]
pub struct UpscaleProgress {
    pub frame: u32,
    pub total: u32,
    pub stage: String,
}

pub fn cancel_video_upscale() {
    CANCEL_UPSCALE.store(true, Ordering::SeqCst);
}

pub async fn upscale_video(app: AppHandle, path: String, overwrite: bool) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = clean_local_path(&path);
        
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
        let temp_frames_dir = parent.join(format!(".cosmo_tmp_vupscale_{}", timestamp));
        fs::create_dir_all(&temp_frames_dir).map_err(|e| format!("Failed to create temp frames dir: {}", e))?;
        
        let _ = app.emit("upscale-progress", UpscaleProgress { frame: 0, total: 100, stage: "extracting".into() });
        
        const CREATE_NO_WINDOW_LOW_PRIORITY: u32 = 0x08000000 | 0x00004000;
        
        let mut fps_cmd = new_hidden_ffprobe_command(Some(&app));
        fps_cmd.args(["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "default=noprint_wrappers=1:nokey=1", &path]);
        #[cfg(windows)]
        fps_cmd.creation_flags(CREATE_NO_WINDOW_LOW_PRIORITY);

        let fps_out = fps_cmd.output().map_err(|e| format!("ffprobe failed to resolve framerate: {}", e))?;
        let fps_str = String::from_utf8_lossy(&fps_out.stdout).trim().to_string();
        
        let mut frames_cmd = new_hidden_ffprobe_command(Some(&app));
        frames_cmd.args(["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=nb_frames", "-of", "default=noprint_wrappers=1:nokey=1", &path]);
        #[cfg(windows)]
        frames_cmd.creation_flags(CREATE_NO_WINDOW_LOW_PRIORITY);

        let frames_out = frames_cmd.output().map_err(|e| format!("ffprobe failed to resolve frame count: {}", e))?;
        let frames_str = String::from_utf8_lossy(&frames_out.stdout).trim().to_string();
        let total_frames: u32 = frames_str.parse().unwrap_or(0);
        
        if total_frames == 0 {
            let _ = secure_delete_dir_all(&temp_frames_dir);
            return Err("Could not determine total frame count of video".into());
        }

        if total_frames > 3600 {
            let _ = secure_delete_dir_all(&temp_frames_dir);
            return Err("Video exceeds maximum limit for local AI super-resolution (capped at 3,600 frames / ~2 minutes to protect system memory and disk space).".into());
        }

        // Automatic safety check: block videos with resolution > 1080p from blowing up disk/memory
        let mut dim_cmd = new_hidden_ffprobe_command(Some(&app));
        dim_cmd.args(["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", &path]);
        #[cfg(windows)]
        dim_cmd.creation_flags(CREATE_NO_WINDOW_LOW_PRIORITY);
        if let Ok(dim_out) = dim_cmd.output() {
            let dim_str = String::from_utf8_lossy(&dim_out.stdout).trim().to_string();
            let parts: Vec<&str> = dim_str.split('x').collect();
            if parts.len() == 2 {
                let vw: u32 = parts[0].parse().unwrap_or(0);
                let vh: u32 = parts[1].parse().unwrap_or(0);
                if vw > 1920 || vh > 1080 {
                    let _ = secure_delete_dir_all(&temp_frames_dir);
                    return Err(format!(
                        "Video resolution ({}×{}) is too large for 4x AI super-resolution (maximum supported input is 1080p). Please downscale the video before upscaling.",
                        vw, vh
                    ));
                }
            }
        }
        
        let mut ext_cmd = new_hidden_ffmpeg_command(Some(&app));
        ext_cmd.args(["-y", "-i", &path, "-q:v", "2", &temp_frames_dir.join("frame_%06d.jpg").to_string_lossy().to_string()]);
        #[cfg(windows)]
        ext_cmd.creation_flags(CREATE_NO_WINDOW_LOW_PRIORITY);

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
            
            let frame_name = format!("frame_{:06}.jpg", i);
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
                cmd.creation_flags(CREATE_NO_WINDOW_LOW_PRIORITY);

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
            "-i", &temp_frames_dir.join("frame_%06d.jpg").to_string_lossy().to_string(),
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
        stitch_cmd.creation_flags(CREATE_NO_WINDOW_LOW_PRIORITY);

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
    }).await.map_err(|e| e.to_string())?
}
