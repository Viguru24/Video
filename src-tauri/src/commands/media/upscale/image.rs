use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use serde_json::Value;

use crate::commands::filesystem::clean_local_path;
use crate::commands::system::{resolve_enhancer_command, resolve_models_dir};
use super::super::utils::{get_next_upscale_filename, new_hidden_command, new_hidden_ffmpeg_command};
use super::persistence::register_upscale_history;
use super::server::spawn_enhancement_server;

pub fn convert_png_to_webp(png_path: &str) -> Result<String, String> {
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

pub async fn upscale_image(
    app: AppHandle,
    path: String,
    overwrite: bool,
    restore_faces: Option<bool>,
    restore_color: Option<bool>,
    outscale: Option<u32>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = clean_local_path(&path);

        let p = Path::new(&path);
        if !p.exists() {
            return Err("File does not exist".into());
        }

        let scale_factor = outscale.unwrap_or(4);

        // Automatic safety check: block oversized images from exhausting GPU VRAM and locking up
        if let Ok((w, h)) = image::image_dimensions(p) {
            let max_dim = 4096;
            let max_pixels: u64 = 12_000_000;
            if scale_factor > 1 && (w > max_dim || h > max_dim || (w as u64 * h as u64) > max_pixels) {
                return Err(format!(
                    "Image resolution ({}×{}) is too large for 4x AI super-resolution (will exhaust GPU memory and fail). Maximum supported input is 4K (~12 MP). Please resize or crop the image first, or use 1× Restore mode.",
                    w, h
                ));
            }
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
                    "fidelity": 0.5,
                    "restore_faces": restore_faces.unwrap_or(true),
                    "restore_color": restore_color.unwrap_or(false),
                    "outscale": scale_factor
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
                cmd.creation_flags(0x08000000 | 0x00004000);
            }

            if let Ok(output) = cmd.output() {
                if output.status.success() {
                    let stdout_str = String::from_utf8_lossy(&output.stdout);
                    cli_used_ai = stdout_str.contains("[USED_AI=True]") || stdout_str.contains("[USED_AI=true]");
                    run_native_fallback = false;
                } else {
                    println!("CLI upscaler returned error status. Falling back to high-performance FFmpeg upscaler.");
                }
            } else {
                println!("Failed to run CLI upscaler command. Falling back to high-performance FFmpeg upscaler.");
            }
        } else {
            println!("Could not resolve CLI upscaler command. Falling back to high-performance FFmpeg upscaler.");
        }

        if run_native_fallback {
            println!("Performing high-performance hardware-accelerated FFmpeg image upscale (Lanczos)...");
            
            let temp_dir = p.parent().map(|d| d.to_path_buf()).unwrap_or_else(std::env::temp_dir);
            let temp_render_path = temp_dir.join(format!(".cosmo_tmp_render_{}_{}.{}", stem, timestamp, ext));
            
            let mut ffmpeg_cmd = new_hidden_ffmpeg_command(Some(&app));
            ffmpeg_cmd.arg("-y")
                      .arg("-nostdin")
                      .arg("-i").arg(&path)
                      .arg("-vf").arg("scale=iw*2:ih*2:flags=lanczos+accurate_rnd")
                      .arg("-frames:v").arg("1")
                      .arg("-update").arg("1")
                      .arg("-q:v").arg("2")
                      .arg(&temp_render_path);

            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                ffmpeg_cmd.creation_flags(0x08000000);
            }

            let ffmpeg_status = ffmpeg_cmd.status();
            let mut success = false;

            if let Ok(st) = ffmpeg_status {
                if st.success() && temp_render_path.exists() {
                    success = true;
                }
            }

            if !success {
                let mut fallback_cmd = new_hidden_ffmpeg_command(Some(&app));
                fallback_cmd.arg("-y")
                            .arg("-nostdin")
                            .arg("-i").arg(&path)
                            .arg("-vf").arg("scale=iw*2:ih*2")
                            .arg("-frames:v").arg("1")
                            .arg("-update").arg("1")
                            .arg(&temp_render_path);

                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    fallback_cmd.creation_flags(0x08000000);
                }

                if let Ok(st2) = fallback_cmd.status() {
                    if st2.success() && temp_render_path.exists() {
                        success = true;
                    }
                }
            }

            if !success {
                let _ = fs::remove_file(&temp_render_path);
                if overwrite && output_path.exists() {
                    let _ = fs::remove_file(&output_path);
                }
                return Err("Failed to upscale image with fallback scaler.".to_string());
            }

            if let Err(e) = fs::copy(&temp_render_path, &output_path) {
                let _ = fs::remove_file(&temp_render_path);
                return Err(format!("Failed to finalize upscaled file: {}", e));
            }
            let _ = fs::remove_file(&temp_render_path);
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
    }).await.map_err(|e| e.to_string())?
}
