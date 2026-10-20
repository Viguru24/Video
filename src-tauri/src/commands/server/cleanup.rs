use std::{fs, path::PathBuf};
use tauri::Manager;
use super::types::now_millis;

pub fn infer_extension_from_mime(mime: &str) -> Option<&'static str> {
    let clean = mime.to_ascii_lowercase();
    if clean.contains("video/mp4") {
        Some("mp4")
    } else if clean.contains("video/webm") {
        Some("webm")
    } else if clean.contains("video/quicktime") {
        Some("mov")
    } else if clean.contains("video/x-matroska") || clean.contains("video/mkv") {
        Some("mkv")
    } else if clean.contains("video/x-msvideo") || clean.contains("video/avi") {
        Some("avi")
    } else if clean.contains("image/jpeg") || clean.contains("image/jpg") {
        Some("jpg")
    } else if clean.contains("image/png") {
        Some("png")
    } else if clean.contains("image/webp") {
        Some("webp")
    } else if clean.contains("image/gif") {
        Some("gif")
    } else if clean.contains("image/heic") || clean.contains("image/heif") {
        Some("heic")
    } else if clean.contains("image/avif") {
        Some("avif")
    } else if clean.contains("image/bmp") {
        Some("bmp")
    } else {
        None
    }
}

pub fn sanitize_filename_for_windows(name: &str, mime_type: &str) -> String {
    // 1. Strip any directory path components (both / and \)
    let raw_leaf = name.split(['/', '\\']).last().unwrap_or(name).trim();

    // 2. Replace illegal Windows characters: < > : " / \ | ? * and ASCII control chars
    let mut safe_chars: String = raw_leaf
        .chars()
        .map(|c| {
            if c < ' ' || c == '<' || c == '>' || c == ':' || c == '"' || c == '/' || c == '\\' || c == '|' || c == '?' || c == '*' {
                '_'
            } else {
                c
            }
        })
        .collect();

    // 3. Trim dots and spaces from edges (Windows doesn't allow trailing dots/spaces)
    safe_chars = safe_chars.trim_matches(|c| c == ' ' || c == '.').to_string();

    // If completely empty after sanitization, generate a default name
    if safe_chars.is_empty() {
        safe_chars = format!("cosmo_media_{}", now_millis());
    }

    // 4. Check if it already has a recognizable extension
    let path = std::path::Path::new(&safe_chars);
    let has_valid_ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|ext| !ext.is_empty() && ext.len() <= 5 && ext.chars().all(|c| c.is_ascii_alphanumeric()))
        .unwrap_or(false);

    if !has_valid_ext {
        if let Some(ext) = infer_extension_from_mime(mime_type) {
            safe_chars = format!("{}.{}", safe_chars, ext);
        }
    }

    safe_chars
}

pub fn resolve_fallback_download_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Some(d) = dirs::download_dir() {
        if fs::create_dir_all(&d).is_ok() {
            return Ok(d);
        }
    }

    if let Ok(d) = app.path().download_dir() {
        if fs::create_dir_all(&d).is_ok() {
            return Ok(d);
        }
    }

    if let Some(home) = dirs::home_dir() {
        let d = home.join("Downloads");
        if fs::create_dir_all(&d).is_ok() {
            return Ok(d);
        }
    }

    let temp_downloads = std::env::temp_dir().join("CosmoDownloads");
    let _ = fs::create_dir_all(&temp_downloads);
    Ok(temp_downloads)
}

/// Overwrites a file's bytes with zeroes, flushes it to disk, and deletes it.
/// This prevents forensic tools from recovering the file content from the drive.
pub fn secure_delete_file<P: AsRef<std::path::Path>>(path: P) -> std::io::Result<()> {
    let path = path.as_ref();
    if !path.exists() {
        return Ok(());
    }
    if path.is_file() {
        let metadata = std::fs::metadata(path)?;
        let size = metadata.len();
        if size > 0 {
            let mut file = std::fs::OpenOptions::new()
                .write(true)
                .open(path)?;
            let chunk_size = 65536;
            let zero_buf = vec![0u8; chunk_size];
            let mut remaining = size;
            use std::io::Write;
            while remaining > 0 {
                let to_write = std::cmp::min(remaining as usize, chunk_size);
                file.write_all(&zero_buf[..to_write])?;
                remaining -= to_write as u64;
            }
            file.sync_all()?;
        }
        std::fs::remove_file(path)?;
    }
    Ok(())
}

/// Recursively overwrites and deletes all files inside a directory, then removes the directory.
pub fn secure_delete_dir_all<P: AsRef<std::path::Path>>(path: P) -> std::io::Result<()> {
    let path = path.as_ref();
    if !path.exists() {
        return Ok(());
    }
    if path.is_dir() {
        for entry in std::fs::read_dir(path)? {
            let entry = entry?;
            let entry_path = entry.path();
            if entry_path.is_dir() {
                secure_delete_dir_all(&entry_path)?;
            } else {
                let _ = secure_delete_file(&entry_path);
            }
        }
        std::fs::remove_dir(path)?;
    } else {
        let _ = secure_delete_file(path);
    }
    Ok(())
}

/// Performs a secure forensic cleanup on application exit of all temp upload files and upscale frames.
pub fn secure_cleanup_on_exit(app: &tauri::AppHandle) -> std::io::Result<()> {
    // 1. Clean up local Wi-Fi share directory and temp helper artifacts
    let upload_dir = std::env::temp_dir().join("wi-share-files");
    if upload_dir.exists() {
        let _ = secure_delete_dir_all(upload_dir);
    }
    let crop_frames = std::env::temp_dir().join("cosmo_crop_frames");
    if crop_frames.exists() {
        let _ = secure_delete_dir_all(crop_frames);
    }
    let heic_script = std::env::temp_dir().join("cosmo_convert_heic.py");
    if heic_script.exists() {
        let _ = secure_delete_file(heic_script);
    }

    // 2. Clean up any leftover upscale temp directories in App Data folder
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        if app_data_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&app_data_dir) {
                for entry in entries {
                    if let Ok(entry) = entry {
                        let path = entry.path();
                        if path.is_dir() {
                            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                            if name.starts_with("video_upscale_") {
                                let _ = secure_delete_dir_all(&path);
                            } else if name == "pasted_screenshots" {
                                let _ = secure_delete_dir_all(&path);
                            }
                        } else if path.is_file() {
                            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                            if name == "cosmo_activity.log" || name == "cosmo_activity.log.old" || name == "upscale.log" {
                                let _ = secure_delete_file(&path);
                            }
                        }
                    }
                }
            }
        }
    }

    // 3. Remove legacy plaintext Documents\CosmoSymphony duplicate folder if present
    if let Ok(mut doc_path) = app.path().document_dir() {
        doc_path.push("CosmoSymphony");
        if doc_path.exists() {
            let _ = secure_delete_dir_all(&doc_path);
        }
    }

    // 4. Scrub WebView2 HTTP/Media disk cache folders on C:\
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let wv2_roots = [
            PathBuf::from(&local_app_data).join("MicroMeadow.CosmoSymphony").join("EBWebView").join("Default"),
            PathBuf::from(&local_app_data).join("CosmoSymphonyDev").join("WebView2Dev").join("EBWebView").join("Default"),
        ];
        for root in &wv2_roots {
            for cache_sub in ["Cache", "Code Cache", "GPUCache", "DawnCache"] {
                let cache_dir = root.join(cache_sub);
                if cache_dir.exists() {
                    let _ = secure_delete_dir_all(&cache_dir);
                }
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_filename_for_windows() {
        assert_eq!(
            sanitize_filename_for_windows("image:12345", "image/jpeg"),
            "image_12345.jpg"
        );
        assert_eq!(
            sanitize_filename_for_windows("20260904_081134(0).jpg", "image/jpeg"),
            "20260904_081134(0).jpg"
        );
        assert_eq!(
            sanitize_filename_for_windows("path/to/my video?.mp4", "video/mp4"),
            "my video_.mp4"
        );
        assert_eq!(
            sanitize_filename_for_windows("VID_20260904_123", "video/mp4"),
            "VID_20260904_123.mp4"
        );
        assert_eq!(
            sanitize_filename_for_windows("..//weird*name:test..", "image/png"),
            "weird_name_test.png"
        );
    }
}
