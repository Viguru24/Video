use std::fs;
use std::path::{Path, PathBuf};
use std::io::{Read, Write};
use tauri::AppHandle;
use serde_json::Value;

use crate::commands::filesystem::clean_local_path;
use crate::commands::server::secure_delete_file;
use super::utils::{
    debug_log, new_hidden_ffmpeg_command,
};

pub async fn rotate_media_on_disk(app: AppHandle, path: String, rotation: i32, is_image: bool) -> Result<String, String> {
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

    let mut cmd = new_hidden_ffmpeg_command(Some(&app));
    cmd.arg("-y");
    cmd.arg("-nostdin");

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

pub async fn mirror_media_on_disk(app: AppHandle, path: String, is_image: bool) -> Result<String, String> {
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

        let mut cmd = new_hidden_ffmpeg_command(Some(&app));
        cmd.arg("-y");
        cmd.arg("-nostdin");

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

pub async fn apply_color_adjustments_on_disk(
    app: AppHandle,
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

    let neg_str = if negative { "1.0-" } else { "" };
    
    let expr_r = format!(
        "clip((((({}pow(clip(val/255*{}\\,0\\,1)\\,{}))*{}-0.5)*{}+0.5)*255)\\,0\\,255)",
        neg_str, final_r, gamma, brightness, contrast
    );
    let expr_g = format!(
        "clip((((({}pow(clip(val/255*{}\\,0\\,1)\\,{}))*{}-0.5)*{}+0.5)*255)\\,0\\,255)",
        neg_str, final_g, gamma, brightness, contrast
    );
    let expr_b = format!(
        "clip((((({}pow(clip(val/255*{}\\,0\\,1)\\,{}))*{}-0.5)*{}+0.5)*255)\\,0\\,255)",
        neg_str, final_b, gamma, brightness, contrast
    );
    
    let mut filters = vec![
        format!(
            r#"lutrgb=r='{}':g='{}':b='{}':a='clip(val*{}\,0\,255)'"#,
            expr_r, expr_g, expr_b, alpha
        ),
        format!("eq=saturation={}", saturation)
    ];
    
    if hue != 0.0 {
        filters.push(format!("hue=h={}", hue));
    }
    
    let filter_str = filters.join(",");
    debug_log(&format!("filter_str={}", filter_str));

    let mut cmd = new_hidden_ffmpeg_command(Some(&app));
    cmd.arg("-y");
    cmd.arg("-nostdin");

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
            cmd.arg("-pix_fmt").arg("yuvj420p");
        } else if ext == "webp" {
            cmd.arg("-quality").arg("100");
            cmd.arg("-pix_fmt").arg("yuv420p");
        } else if ext == "png" {
            cmd.arg("-pix_fmt").arg("rgb24");
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
           .arg("-pix_fmt")
           .arg("yuv420p")
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

pub async fn save_adjusted_image_bytes(
    path: String,
    base64_data: String,
    save_as_copy: bool,
) -> Result<String, String> {
    let path = clean_local_path(&path);
    let path_obj = Path::new(&path);
    if !path_obj.exists() {
        return Err(format!("File does not exist: {}", path));
    }
    
    let ext = path_obj.extension().ok_or("No extension")?.to_string_lossy().to_lowercase();
    let stem = path_obj.file_stem().ok_or("No file stem")?.to_string_lossy().to_string();
    let parent = path_obj.parent().ok_or("No parent dir")?;

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

    use base64::{Engine as _, engine::general_purpose};
    let decoded = general_purpose::STANDARD
        .decode(base64_data.trim())
        .map_err(|e| format!("Failed to decode base64 data: {}", e))?;

    std::fs::write(&target_path, &decoded)
        .map_err(|e| format!("Failed to write file to disk: {}", e))?;

    Ok(target_path.to_string_lossy().to_string())
}

pub async fn crop_image_on_disk(
    app: AppHandle,
    path: String,
    crop_x: f64,
    crop_y: f64,
    crop_w: f64,
    crop_h: f64,
    img_w: f64,
    img_h: f64,
    overwrite: bool,
) -> Result<String, String> {
    let path = clean_local_path(&path);
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    debug_log(&format!(
        "START crop_image_on_disk: path={}, crop_x={}, crop_y={}, crop_w={}, crop_h={}, img_w={}, img_h={}, overwrite={}",
        path, crop_x, crop_y, crop_w, crop_h, img_w, img_h, overwrite
    ));

    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let path_obj = Path::new(&path);
        if !path_obj.exists() {
            return Err("File does not exist".to_string());
        }

        let ext = path_obj.extension().ok_or("No extension")?.to_string_lossy().to_lowercase();
        let stem = path_obj.file_stem().ok_or("No file stem")?.to_string_lossy().to_string();
        let parent = path_obj.parent().ok_or("No parent dir")?;

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

        let mut cmd = new_hidden_ffmpeg_command(Some(&app_handle));
        cmd.arg("-y")
           .arg("-nostdin")
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
        #[cfg(windows)]
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

pub async fn resize_image_on_disk(
    app: AppHandle,
    path: String,
    width: u32,
    height: u32,
    overwrite: bool,
) -> Result<String, String> {
    let path = clean_local_path(&path);
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    debug_log(&format!(
        "START resize_image_on_disk: path={}, width={}, height={}, overwrite={}",
        path, width, height, overwrite
    ));

    let app_handle = app.clone();
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

        let mut cmd = new_hidden_ffmpeg_command(Some(&app_handle));
        cmd.arg("-y")
           .arg("-nostdin")
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
        #[cfg(windows)]
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

pub async fn generate_store_logos(app: AppHandle, path: String, bg_color: String) -> Result<String, String> {
    let clean_path = clean_local_path(&path);
    let p = Path::new(&clean_path);
    if !p.exists() {
        return Err(format!("File does not exist: {}", clean_path));
    }

    let mut stream_connected = std::net::TcpStream::connect("127.0.0.1:12000").is_ok();
    if !stream_connected {
        println!("AI enhancer server offline. Spawning background server...");
        if let Ok(_) = super::upscale::spawn_enhancement_server(Some(&app)) {
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
        return Err("AI Enhancement Server is offline and could not be started automatically.".into());
    }

    if let Ok(mut stream) = std::net::TcpStream::connect("127.0.0.1:12000") {
        let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(180)));
        let _ = stream.set_write_timeout(Some(std::time::Duration::from_secs(180)));

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
