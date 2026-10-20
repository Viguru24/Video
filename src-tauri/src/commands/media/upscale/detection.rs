use std::path::Path;
use std::io::{Read, Write};
use std::net::TcpStream;
use serde_json::Value;
use tauri::AppHandle;

use crate::commands::filesystem::clean_local_path;
use crate::commands::server::secure_delete_file;
use super::super::utils::new_hidden_ffmpeg_command;
use super::server::spawn_enhancement_server;
use super::image::convert_png_to_webp;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct AutoCropBox {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub detected: bool,
    pub label: String,
}

pub async fn extract_subject_on_disk(app: AppHandle, path: String) -> Result<String, String> {
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

pub async fn detect_person_crop(app: AppHandle, path: String) -> Result<AutoCropBox, String> {
    let clean_path = clean_local_path(&path);
    let p = Path::new(&clean_path);
    if !p.exists() {
        return Err(format!("File does not exist: {}", clean_path));
    }

    let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    let is_video = ext == "mp4" || ext == "mkv" || ext == "avi" || ext == "mov" || ext == "webm";

    let target_img_path = if is_video {
        let temp_dir = p.parent().map(|d| d.to_path_buf()).unwrap_or_else(|| std::env::temp_dir().join("cosmo_crop_frames"));
        let _ = std::fs::create_dir_all(&temp_dir);
        let frame_path = temp_dir.join(format!(".cosmo_tmp_frame_{}.jpg", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()));
        
        let mut cmd = new_hidden_ffmpeg_command(Some(&app));
        cmd.args(["-y", "-ss", "0.5", "-i", &clean_path, "-vframes", "1", "-q:v", "2", frame_path.to_str().unwrap()]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        let _ = cmd.output();
        if frame_path.exists() {
            frame_path.to_string_lossy().to_string()
        } else {
            clean_path.clone()
        }
    } else {
        clean_path.clone()
    };

    let mut stream_connected = TcpStream::connect("127.0.0.1:12000").is_ok();
    if !stream_connected {
        println!("AI enhancer server offline. Spawning background server for person detection...");
        if spawn_enhancement_server(Some(&app)).is_ok() {
            for _ in 0..60 {
                std::thread::sleep(std::time::Duration::from_millis(300));
                if TcpStream::connect("127.0.0.1:12000").is_ok() {
                    stream_connected = true;
                    break;
                }
            }
        }
    }

    if !stream_connected {
        return Ok(AutoCropBox {
            x: 15.0,
            y: 15.0,
            w: 70.0,
            h: 70.0,
            detected: false,
            label: { if is_video && target_img_path != clean_path { let _ = secure_delete_file(&target_img_path); } "Center Default (AI Offline)".to_string() },
        });
    }

    if let Ok(mut stream) = TcpStream::connect("127.0.0.1:12000") {
        let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(30)));
        let _ = stream.set_write_timeout(Some(std::time::Duration::from_secs(30)));
        let json_payload = serde_json::json!({
            "path": target_img_path
        }).to_string();

        let request = format!(
            "POST /detect_subject HTTP/1.1\r\n\
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
                            let box_obj = parsed.get("box");
                            let x = box_obj.and_then(|b| b.get("x")).and_then(|v| v.as_f64()).unwrap_or(15.0);
                            let y = box_obj.and_then(|b| b.get("y")).and_then(|v| v.as_f64()).unwrap_or(15.0);
                            let w = box_obj.and_then(|b| b.get("w")).and_then(|v| v.as_f64()).unwrap_or(70.0);
                            let h = box_obj.and_then(|b| b.get("h")).and_then(|v| v.as_f64()).unwrap_or(70.0);
                            let detected = parsed.get("detected").and_then(|v| v.as_bool()).unwrap_or(false);
                            let label = parsed.get("label").and_then(|v| v.as_str()).unwrap_or("Person Detected").to_string();

                            if is_video && target_img_path != clean_path { let _ = secure_delete_file(&target_img_path); }
                            return Ok(AutoCropBox { x, y, w, h, detected, label });
                        }
                    }
                }
            }
        }
    }

    Ok(AutoCropBox {
        x: 15.0,
        y: 15.0,
        w: 70.0,
        h: 70.0,
        detected: false,
        label: { if is_video && target_img_path != clean_path { let _ = secure_delete_file(&target_img_path); } "Center Default".to_string() },
    })
}
