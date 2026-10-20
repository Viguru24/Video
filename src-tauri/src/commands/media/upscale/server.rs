use std::fs;
use std::io::{Read, Write};
use tauri::{AppHandle, Manager};
use serde_json::Value;

use crate::commands::system::{resolve_enhancer_command, resolve_models_dir};
use super::super::utils::new_hidden_command;

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
        // 0x08000000 (CREATE_NO_WINDOW) | 0x00004000 (BELOW_NORMAL_PRIORITY_CLASS)
        cmd.creation_flags(0x08000000 | 0x00004000);
    }
    
    cmd.spawn().map_err(|e| format!("Failed to spawn AI enhancement server: {}", e))?;
    Ok(())
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
