use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State, Emitter};
use crate::DirectoryWatcherState;

#[tauri::command]
pub async fn select_folder_cmd(app: AppHandle) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;
    let folder = app.dialog().file().blocking_pick_folder();
    if let Some(path) = folder {
        Ok(path.to_string())
    } else {
        Err("Cancelled".into())
    }
}

#[tauri::command]
pub async fn select_files_cmd(app: AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let files = app.dialog().file().blocking_pick_files();
    if let Some(paths) = files {
        Ok(paths.iter().map(|p| p.to_string()).collect())
    } else {
        Err("Cancelled".into())
    }
}

#[tauri::command]
pub async fn get_folder_videos(path: String, mode: String) -> Result<Vec<serde_json::Value>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut vids = Vec::new();
        let video_exts = ["mp4", "webm", "mov", "m4v", "3gp", "avi", "mkv", "flv", "wmv",
                          "ts", "mts", "m2ts", "vob", "mpg", "mpeg", "ogv", "divx", "rm", "rmvb"];
        let image_exts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "tiff",
                          "heic", "heif", "avif", "jxl", "cr2", "cr3", "nef", "arw", "dng", "tga"];
        
        let target_exts: Vec<&str> = if mode == "picture" { 
            image_exts.to_vec() 
        } else if mode == "video" { 
            video_exts.to_vec() 
        } else {
            video_exts.iter().chain(image_exts.iter()).cloned().collect()
        };

        fn is_ignored_dir(name: &str) -> bool {
            let name_lower = name.to_lowercase();
            matches!(
                name_lower.as_str(),
                ".git" | "node_modules" | ".next" | "target" | "dist" | "build" |
                "venv" | ".venv" | ".cosmo_models" | "__pycache__" | "bin" | "obj" |
                "appdata" | "$recycle.bin" | "system volume information"
            )
        }

        fn scan_dir_recursive(dir: &Path, target_exts: &[&str], vids: &mut Vec<serde_json::Value>, depth: usize) {
            if depth > 2 || vids.len() >= 5000 {
                return;
            }
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    if vids.len() >= 5000 {
                        break;
                    }
                    let p = entry.path();
                    if p.is_dir() {
                        if let Some(dir_name) = p.file_name().and_then(|s| s.to_str()) {
                            if !is_ignored_dir(dir_name) {
                                scan_dir_recursive(&p, target_exts, vids, depth + 1);
                            }
                        }
                    } else if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                        if target_exts.contains(&ext.to_lowercase().as_str()) {
                            if let Some(name) = p.file_name().and_then(|s| s.to_str()) {
                                let metadata = fs::metadata(&p).ok();
                                let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
                                let modified = metadata.as_ref()
                                    .and_then(|m| m.modified().ok())
                                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                    .map(|d| d.as_secs())
                                    .unwrap_or(0);
                                let created = metadata.as_ref()
                                    .and_then(|m| m.created().ok())
                                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                    .map(|d| d.as_secs())
                                    .unwrap_or(0);

                                vids.push(serde_json::json!({
                                    "name": name,
                                    "url": p.to_string_lossy().to_string(),
                                    "size": size,
                                    "modified": modified,
                                    "created": created
                                }));
                            }
                        }
                    }
                }
            }
        }

        scan_dir_recursive(Path::new(&path), &target_exts, &mut vids, 0);
        Ok(vids)
    }).await.map_err(|e| e.to_string())?
}

fn get_default_snapshots_dir() -> PathBuf {
    if let Some(pic_dir) = dirs::picture_dir() {
        pic_dir.join("Cosmo_Snapshots")
    } else if let Some(doc_dir) = dirs::document_dir() {
        doc_dir.join("Cosmo_Snapshots")
    } else if let Some(home_dir) = dirs::home_dir() {
        home_dir.join("Pictures").join("Cosmo_Snapshots")
    } else if let Ok(curr_dir) = std::env::current_dir() {
        curr_dir.join("Cosmo_Snapshots")
    } else {
        PathBuf::from("C:\\Cosmo_Snapshots")
    }
}

/// Extract a clean Windows file path from any URL-wrapped or raw path string.
/// Handles Tauri asset URLs, percent encoding, and protocol prefixes.
fn clean_file_path(path: &str) -> String {
    let mut clean = path.trim().to_string();

    // 1. Decode percent encoding
    if let Ok(decoded) = urlencoding::decode(&clean) {
        clean = decoded.into_owned();
    }

    // Remove query parameters
    if let Some(idx) = clean.find('?') {
        clean = clean[..idx].to_string();
    }

    // 2. Scan for a Windows drive letter pattern: a SINGLE alpha char followed by :/ or :\
    //    We must skip multi-char protocol prefixes like http:// by checking that the
    //    character before the drive letter (if any) is NOT alphabetic.
    let bytes = clean.as_bytes();
    for i in 0..clean.len().saturating_sub(1) {
        if bytes[i].is_ascii_alphabetic() && i + 1 < bytes.len() && bytes[i + 1] == b':' {
            // Check next char is / or backslash (drive separator)
            let has_sep = i + 2 < bytes.len() && (bytes[i + 2] == b'/' || bytes[i + 2] == b'\\');
            if has_sep {
                // Make sure the char before is NOT alphabetic (to skip "http://")
                let prev_is_alpha = i > 0 && bytes[i - 1].is_ascii_alphabetic();
                if !prev_is_alpha {
                    return clean[i..].to_string();
                }
            }
        }
    }

    // 3. Fallback prefix stripping (for non-Windows paths or edge cases)
    let prefixes = [
        "local://",
        "cosmo://",
        "asset://localhost/",
        "asset://",
        "http://asset.localhost/",
        "https://asset.localhost/",
        "http://cosmo.localhost/",
        "https://cosmo.localhost/",
        "asset.localhost/",
        "cosmo.localhost/",
    ];

    for prefix in prefixes {
        if clean.to_lowercase().starts_with(prefix) {
            clean = clean[prefix.len()..].to_string();
            break;
        }
    }

    // Strip subroutes
    let subroutes = ["localhost/", "media/", "video/"];
    for subroute in subroutes {
        if clean.to_lowercase().starts_with(subroute) {
            clean = clean[subroute.len()..].to_string();
        }
    }

    clean
}

#[tauri::command]
pub fn open_folder(path: String) -> Result<(), String> {
    let mut resolved_path = path.trim().to_string();
    println!("[open_folder] Raw input: {}", resolved_path);

    // 1. Handle default snapshots alias
    if resolved_path == "default_snapshots" || resolved_path.is_empty() {
        let snap_dir = get_default_snapshots_dir();
        let _ = fs::create_dir_all(&snap_dir);
        resolved_path = snap_dir.to_string_lossy().to_string();
    } else if resolved_path.starts_with("/demos/") || resolved_path.starts_with("demos/") {
        let suffix = if resolved_path.starts_with('/') {
            &resolved_path[1..]
        } else {
            &resolved_path[..]
        };
        
        let mut resolved = None;
        
        // Traverse up from current executable/run path to find public/demos
        if let Ok(curr) = std::env::current_dir() {
            let mut p_check = curr.clone();
            for _ in 0..6 {
                let test_path = p_check.join("public").join(suffix);
                if test_path.exists() {
                    resolved = Some(test_path);
                    break;
                }
                if let Some(parent) = p_check.parent() {
                    p_check = parent.to_path_buf();
                } else {
                    break;
                }
            }
        }
        
        // Fallback check OneDrive and Documents paths
        if resolved.is_none() {
            let paths_to_try = [
                PathBuf::from("C:\\Users\\louis\\Documents\\GitHub\\Video\\public").join(suffix),
                PathBuf::from("C:\\Users\\louis\\OneDrive\\Documents\\GitHub\\Video\\public").join(suffix)
            ];
            for p_try in paths_to_try {
                if p_try.exists() {
                    resolved = Some(p_try);
                    break;
                }
            }
        }

        if let Some(p_res) = resolved {
            resolved_path = p_res.to_string_lossy().to_string();
        }
    }

    let clean_path = clean_file_path(&resolved_path);
    let normalized_path = clean_path.replace("/", "\\");
    println!("[open_folder] Cleaned: {}", normalized_path);
    let p = Path::new(&normalized_path);

    // Create the directory if it looks like a folder path and doesn't exist
    if !p.exists() {
        let is_likely_file = p.extension().is_some();
        if !is_likely_file {
            let _ = fs::create_dir_all(p);
        }
    }

    // Check existence. If path doesn't exist, fallback to parent → home → C:\
    let final_path = if !p.exists() {
        if let Some(parent) = p.parent() {
            if parent.exists() {
                parent.to_string_lossy().to_string()
            } else if let Some(home) = dirs::home_dir() {
                home.to_string_lossy().to_string()
            } else {
                std::env::current_dir().unwrap_or_else(|_| PathBuf::from("C:\\")).to_string_lossy().to_string()
            }
        } else if let Some(home) = dirs::home_dir() {
            home.to_string_lossy().to_string()
        } else {
            std::env::current_dir().unwrap_or_else(|_| PathBuf::from("C:\\")).to_string_lossy().to_string()
        }
    } else {
        normalized_path
    };

    println!("[open_folder] Final: {}", final_path);

    let p_final = Path::new(&final_path);
    if !p_final.exists() {
        return Err(format!("Path not found: {}", final_path));
    }

    // Use explorer.exe with /select, for files, or direct path for directories.
    #[cfg(target_os = "windows")]
    {
        if p_final.is_dir() {
            std::process::Command::new("explorer.exe")
                .arg(&final_path)
                .spawn()
                .map_err(|e| format!("Failed to launch explorer: {}", e))?;
        } else {
            // Pass /select, and the file path as separate arguments so Windows explorer doesn't get confused by quotes around /select
            std::process::Command::new("explorer.exe")
                .arg("/select,")
                .arg(&final_path)
                .spawn()
                .map_err(|e| format!("Failed to launch explorer select: {}", e))?;
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("xdg-open")
            .arg(&final_path)
            .spawn()
            .map_err(|e| format!("Failed to launch open tool: {}", e))?;
    }

    Ok(())
}


#[tauri::command]
pub async fn recycle_unit(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        trash::delete(&path).map_err(|e| format!("Failed to recycle: {}", e))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Extract the clean base prefix by stripping trailing sequential numbers,
/// crop suffixes, and upscale suffixes recursively.
/// e.g. "LAURA_002_crop_001" → "LAURA"
///      "LAURA_002_upscaled" → "LAURA"
///      "Isabel00010001"     → "Isabel"
pub fn extract_base_prefix(name: &str) -> String {
    let mut current = name.to_string();
    loop {
        let prev_len = current.len();

        // 1. Strip trailing _NNN
        if let Some(pos) = current.rfind('_') {
            let after = &current[pos + 1..];
            if !after.is_empty() && after.chars().all(|c| c.is_ascii_digit()) {
                current = current[..pos].to_string();
                continue;
            }
        }

        // 2. Strip trailing digits directly (e.g. "Isabel0001" -> "Isabel")
        let temp = current.trim_end_matches(|c: char| c.is_ascii_digit());
        if temp.len() < current.len() {
            if !temp.is_empty() {
                if temp.ends_with('_') {
                    current = temp[..temp.len() - 1].to_string();
                } else {
                    current = temp.to_string();
                }
                continue;
            }
        }

        // 3. Strip trailing _crop or _upscaled or _upscale
        let lower = current.to_lowercase();
        if lower.ends_with("_crop") {
            current = current[..current.len() - 5].to_string();
            continue;
        }
        if lower.ends_with("_upscaled") {
            current = current[..current.len() - 9].to_string();
            continue;
        }
        if lower.ends_with("_upscale") {
            current = current[..current.len() - 8].to_string();
            continue;
        }

        if current.len() == prev_len {
            break;
        }
    }
    current
}

/// Scan parent directory for matching prefix files and return the next sequential number.
/// e.g. if highest file is "LAURA_002_crop_001.jpg", it parses the number "2" and returns "3".
pub fn get_next_sequence_num(parent: &Path, base_prefix: &str, extension: &str) -> u32 {
    let lower_base = base_prefix.to_lowercase();
    let lower_ext = extension.to_lowercase();
    let mut highest: u32 = 0;

    if let Ok(entries) = fs::read_dir(parent) {
        for entry in entries.flatten() {
            if let Some(fname) = entry.file_name().to_str().map(|s| s.to_string()) {
                let lower_fname = fname.to_lowercase();
                if let Some(dot_pos) = lower_fname.rfind('.') {
                    let file_ext = &lower_fname[dot_pos + 1..];
                    let file_stem = &lower_fname[..dot_pos];
                    if file_ext != lower_ext {
                        continue;
                    }
                    if let Some(rest) = file_stem.strip_prefix(&lower_base) {
                        let num_str = rest.trim_start_matches('_');
                        // Extract only the leading digits from rest, ignoring extra suffixes
                        let only_digits: String = num_str.chars().take_while(|c| c.is_ascii_digit()).collect();
                        if !only_digits.is_empty() {
                            if let Ok(n) = only_digits.parse::<u32>() {
                                if n > highest {
                                    highest = n;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    highest + 1
}

#[tauri::command]
pub async fn rename_video(old_path: String, new_name: String) -> Result<String, String> {
    let old_p = PathBuf::from(&old_path);
    if !old_p.exists() {
        return Err("Source file not found".into());
    }

    let parent = old_p.parent().ok_or("Invalid parent directory")?;
    let extension = old_p.extension().and_then(|e| e.to_str()).ok_or("File has no extension")?;
    
    let sanitized_name = new_name.replace(|c: char| !c.is_alphanumeric() && c != ' ' && c != '_' && c != '-', "");
    if sanitized_name.is_empty() {
        return Err("Invalid new name".into());
    }

    let new_filename = format!("{}.{}", sanitized_name, extension);
    let mut new_p = parent.join(&new_filename);

    let canonical_old = fs::canonicalize(&old_p).unwrap_or_else(|_| old_p.clone());
    let canonical_new = fs::canonicalize(&new_p).unwrap_or_else(|_| new_p.clone());

    if new_p.exists() && canonical_old != canonical_new {
        let base_prefix = extract_base_prefix(&sanitized_name);
        let next_num = get_next_sequence_num(parent, &base_prefix, extension);
        let numbered_name = format!("{}_{:03}.{}", base_prefix, next_num, extension);
        new_p = parent.join(&numbered_name);

        let mut counter = next_num;
        while new_p.exists() {
            let canonical_candidate = fs::canonicalize(&new_p).unwrap_or_else(|_| new_p.clone());
            if canonical_candidate == canonical_old {
                break;
            }
            counter += 1;
            let name = format!("{}_{:03}.{}", base_prefix, counter, extension);
            new_p = parent.join(&name);
            if counter > next_num + 10000 {
                return Err("Could not find an available filename after 10000 attempts".into());
            }
        }
    }

    let rename_result = fs::rename(&old_p, &new_p);
    if rename_result.is_err() {
        fs::copy(&old_p, &new_p).map_err(|e| {
            format!(
                "Rename failed and copy fallback failed. Rename error: {:?}. Copy error: {}",
                rename_result.err(),
                e
            )
        })?;
        if let Err(_) = trash::delete(&old_p) {
            let _ = fs::remove_file(&old_p);
        }
    }

    Ok(new_p.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn get_subdirectories(dir_path: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = Path::new(&dir_path);
        if !path.exists() || !path.is_dir() {
            return Err("Directory does not exist".to_string());
        }
        let mut subdirs = Vec::new();
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    if let Some(name) = p.file_name().and_then(|s| s.to_str()) {
                        subdirs.push(name.to_string());
                    }
                }
            }
        }
        subdirs.sort();
        Ok(subdirs)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn list_directory_contents(dir_path: String) -> Result<Vec<serde_json::Value>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = Path::new(&dir_path);
        if !path.exists() || !path.is_dir() {
            return Err("Directory does not exist".to_string());
        }
        let mut items = Vec::new();
        let video_exts = ["mp4", "webm", "mov", "m4v", "3gp", "avi", "mkv", "flv", "wmv",
                          "ts", "mts", "m2ts", "vob", "mpg", "mpeg", "ogv", "divx", "rm", "rmvb"];
        let image_exts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "tiff",
                          "heic", "heif", "avif", "jxl", "cr2", "cr3", "nef", "arw", "dng", "tga"];
        
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                let p = entry.path();
                let name = p.file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_string();
                let is_dir = p.is_dir();
                let mut is_media = false;
                if !is_dir {
                    if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                        let ext_lower = ext.to_lowercase();
                        is_media = video_exts.contains(&ext_lower.as_str()) || image_exts.contains(&ext_lower.as_str());
                    }
                    if !is_media {
                        continue;
                    }
                }
                
                let mut size = 0u64;
                let mut modified = 0u64;
                if let Ok(metadata) = p.metadata() {
                    size = metadata.len();
                    if let Ok(time) = metadata.modified() {
                        if let Ok(duration) = time.duration_since(std::time::SystemTime::UNIX_EPOCH) {
                            modified = duration.as_secs();
                        }
                    }
                }

                items.push(serde_json::json!({
                    "name": name,
                    "path": p.to_string_lossy().to_string(),
                    "is_dir": is_dir,
                    "is_media": is_media,
                    "size": size,
                    "modified": modified
                }));
            }
        }
        
        items.sort_by(|a, b| {
            let a_is_dir = a["is_dir"].as_bool().unwrap_or(false);
            let b_is_dir = b["is_dir"].as_bool().unwrap_or(false);
            if a_is_dir && !b_is_dir {
                std::cmp::Ordering::Less
            } else if !a_is_dir && b_is_dir {
                std::cmp::Ordering::Greater
            } else {
                let a_name = a["name"].as_str().unwrap_or("").to_lowercase();
                let b_name = b["name"].as_str().unwrap_or("").to_lowercase();
                a_name.cmp(&b_name)
            }
        });
        Ok(items)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn create_new_folder(parent_dir: String, folder_name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let parent_path = Path::new(&parent_dir);
        if !parent_path.exists() || !parent_path.is_dir() {
            return Err("Parent directory does not exist".to_string());
        }
        let sanitized = folder_name.replace(|c: char| !c.is_alphanumeric() && c != ' ' && c != '_' && c != '-', "");
        if sanitized.trim().is_empty() {
            return Err("Invalid folder name".to_string());
        }
        let new_folder_path = parent_path.join(&sanitized);
        fs::create_dir_all(&new_folder_path).map_err(|e| format!("Failed to create folder: {}", e))?;
        Ok(new_folder_path.to_string_lossy().to_string())
    }).await.map_err(|e| e.to_string())?
}

pub fn clean_local_path(p: &str) -> String {
    // Use clean_file_path first to strip Tauri v2 scheme protocol prefixes and isolate raw Windows paths
    let mut clean = clean_file_path(p);

    // Decode percent encoding
    if let Ok(decoded) = urlencoding::decode(&clean) {
        clean = decoded.into_owned();
    }

    // Remove query parameters
    if let Some(idx) = clean.find('?') {
        clean = clean[..idx].to_string();
    }

    // Resolve relative demo paths to AppData directory so they are writable
    if clean.starts_with("/demos/") || clean.starts_with("demos/") {
        let suffix = if clean.starts_with('/') {
            &clean[1..]
        } else {
            &clean[..]
        };
        
        let mut resolved = None;
        
        let file_name = std::path::Path::new(suffix)
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or(suffix);

        // Check Roaming AppData (used by Tauri app_data_dir() on Windows)
        if let Some(roaming_dir) = dirs::data_dir() {
            let p_prod = roaming_dir.join("MicroMeadow.CosmoSymphony").join("demos").join(file_name);
            let p_dev = roaming_dir.join("MicroMeadow.CosmoSymphonyDev").join("demos").join(file_name);
            if p_prod.exists() {
                resolved = Some(p_prod);
            } else if p_dev.exists() {
                resolved = Some(p_dev);
            }
        }

        // Check Local AppData fallback
        if resolved.is_none() {
            if let Some(local_dir) = dirs::data_local_dir() {
                let p_prod = local_dir.join("MicroMeadow.CosmoSymphony").join("demos").join(file_name);
                let p_dev = local_dir.join("MicroMeadow.CosmoSymphonyDev").join("demos").join(file_name);
                if p_prod.exists() {
                    resolved = Some(p_prod);
                } else if p_dev.exists() {
                    resolved = Some(p_dev);
                }
            }
        }
        
        if resolved.is_none() {
            // Traverse up from current executable/run path to find public/demos
            if let Ok(curr) = std::env::current_dir() {
                let mut p_check = curr.clone();
                for _ in 0..6 {
                    let test_path = p_check.join("public").join(suffix);
                    if test_path.exists() {
                        resolved = Some(test_path);
                        break;
                    }
                    if let Some(parent) = p_check.parent() {
                        p_check = parent.to_path_buf();
                    } else {
                        break;
                    }
                }
            }
        }
        
        // Fallback check OneDrive and Documents paths
        if resolved.is_none() {
            let paths_to_try = [
                PathBuf::from("C:\\Users\\louis\\Documents\\GitHub\\Video\\public").join(suffix),
                PathBuf::from("C:\\Users\\louis\\OneDrive\\Documents\\GitHub\\Video\\public").join(suffix)
            ];
            for p_try in paths_to_try {
                if p_try.exists() {
                    resolved = Some(p_try);
                    break;
                }
            }
        }

        if let Some(p_res) = resolved {
            clean = p_res.to_string_lossy().to_string();
        } else if let Some(local_dir) = dirs::data_local_dir() {
            // Last resort: point to default AppData directory
            let file_name = std::path::Path::new(suffix)
                .file_name()
                .and_then(|f| f.to_str())
                .unwrap_or(suffix);
            let p_prod = local_dir.join("MicroMeadow.CosmoSymphony").join("demos").join(file_name);
            clean = p_prod.to_string_lossy().to_string();
        }
    }

    clean.replace("/", "\\")
}

#[tauri::command]
pub async fn move_file_on_disk(
    src_path: String,
    dest_dir: String,
    overwrite: bool,
    rename_sibling: bool,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let clean_src = clean_local_path(&src_path);
        let clean_dest = clean_local_path(&dest_dir);
        let src = Path::new(&clean_src);
        let dest_folder = Path::new(&clean_dest);
        if !src.exists() {
            return Err(format!("Source file does not exist: {}", clean_src));
        }
        if !dest_folder.exists() || !dest_folder.is_dir() {
            return Err("Destination folder does not exist".to_string());
        }
        let file_name = src.file_name().ok_or("Invalid source filename")?;
        let mut dest_path = dest_folder.join(file_name);
        
        if dest_path.exists() {
            if overwrite {
                let _ = trash::delete(&dest_path);
            } else if rename_sibling {
                let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
                let ext = src.extension().and_then(|s| s.to_str()).unwrap_or("");
                let mut counter = 1;
                loop {
                    let new_name = if ext.is_empty() {
                        format!("{} ({})", stem, counter)
                    } else {
                        format!("{} ({}).{}", stem, counter, ext)
                    };
                    let candidate = dest_folder.join(new_name);
                    if !candidate.exists() {
                        dest_path = candidate;
                        break;
                    }
                    counter += 1;
                }
            } else {
                return Err("File already exists in destination folder".to_string());
            }
        }

        let rename_result = fs::rename(src, &dest_path);
        if rename_result.is_err() {
            fs::copy(src, &dest_path).map_err(|e| format!("Copy fallback failed: {}", e))?;
            if let Err(recycle_err) = trash::delete(src) {
                println!("Recycle bin delete failed for source during move: {:?}. Attempting hard delete.", recycle_err);
                if let Err(remove_err) = fs::remove_file(src) {
                    // Both recycle and hard delete failed. Rollback the copy!
                    let _ = fs::remove_file(&dest_path);
                    return Err(format!("Failed to delete source file: {}. Copy rolled back.", remove_err));
                }
            }
        }
        Ok(dest_path.to_string_lossy().to_string())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn copy_file_on_disk(
    src_path: String,
    dest_dir: String,
    overwrite: bool,
    rename_sibling: bool,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let clean_src = clean_local_path(&src_path);
        let clean_dest = clean_local_path(&dest_dir);
        let src = Path::new(&clean_src);
        let dest_folder = Path::new(&clean_dest);
        if !src.exists() {
            return Err(format!("Source file does not exist: {}", clean_src));
        }
        if !dest_folder.exists() || !dest_folder.is_dir() {
            return Err("Destination folder does not exist".to_string());
        }
        let file_name = src.file_name().ok_or("Invalid source filename")?;
        let mut dest_path = dest_folder.join(file_name);
        
        if dest_path.exists() {
            if overwrite {
                let _ = fs::remove_file(&dest_path);
            } else if rename_sibling {
                let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
                let ext = src.extension().and_then(|s| s.to_str()).unwrap_or("");
                let mut counter = 1;
                loop {
                    let new_name = if ext.is_empty() {
                        format!("{} ({})", stem, counter)
                    } else {
                        format!("{} ({}).{}", stem, counter, ext)
                    };
                    let candidate = dest_folder.join(new_name);
                    if !candidate.exists() {
                        dest_path = candidate;
                        break;
                    }
                    counter += 1;
                }
            } else {
                return Err("File already exists in destination folder".to_string());
            }
        }

        fs::copy(src, &dest_path).map_err(|e| format!("Copy failed: {}", e))?;
        Ok(dest_path.to_string_lossy().to_string())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn file_exists(path: String) -> bool {
    let clean = clean_local_path(&path);
    Path::new(&clean).exists()
}

#[tauri::command]
pub async fn duplicate_file_on_disk(src_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let clean_src = clean_local_path(&src_path);
        let src = Path::new(&clean_src);
        if !src.exists() {
            return Err(format!("Source file does not exist: {}", clean_src));
        }
        let parent = src.parent().ok_or("Invalid parent directory")?;
        let file_stem = src.file_stem().ok_or("Invalid file stem")?.to_string_lossy().to_string();
        let ext = src.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default();
        
        let ext_str = if ext.is_empty() {
            "".to_string()
        } else {
            format!(".{}", ext)
        };
        
        let mut index = 1;
        let mut target_path = parent.join(format!("{}_{:03}{}", file_stem, index, ext_str));
        while target_path.exists() {
            index += 1;
            target_path = parent.join(format!("{}_{:03}{}", file_stem, index, ext_str));
        }

        fs::copy(src, &target_path).map_err(|e| format!("Duplicate copy failed: {}", e))?;
        Ok(target_path.to_string_lossy().to_string())
    }).await.map_err(|e| e.to_string())?
}

#[repr(C)]
struct FILE_LEVEL_TRIM_RANGE {
    offset: u64,
    length: u64,
}

#[repr(C)]
struct FILE_LEVEL_TRIM_HEADER {
    key: u32,
    num_ranges: u32,
}

#[cfg(target_os = "windows")]
#[link(name = "kernel32")]
extern "system" {
    fn CreateFileW(
        lpFileName: *const u16,
        dwDesiredAccess: u32,
        dwShareMode: u32,
        lpSecurityAttributes: *const std::ffi::c_void,
        dwCreationDisposition: u32,
        dwFlagsAndAttributes: u32,
        hTemplateFile: *mut std::ffi::c_void,
    ) -> *mut std::ffi::c_void;

    fn DeviceIoControl(
        hDevice: *mut std::ffi::c_void,
        dwIoControlCode: u32,
        lpInBuffer: *const std::ffi::c_void,
        nInBufferSize: u32,
        lpOutBuffer: *mut std::ffi::c_void,
        nOutBufferSize: u32,
        lpBytesReturned: *mut u32,
        lpOverlapped: *mut std::ffi::c_void,
    ) -> i32;

    fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;
}

#[cfg(target_os = "windows")]
fn detect_is_ssd(drive_letter: char) -> bool {
    use std::process::Command;
    use std::os::windows::process::CommandExt;
    let cmd = format!("(Get-PhysicalDisk | Where-Object DeviceId -eq (Get-Partition -DriveLetter {}).DiskNumber).MediaType", drive_letter);
    if let Ok(output) = Command::new("powershell")
        .args(&["-NoProfile", "-NonInteractive", "-Command", &cmd])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        stdout.trim().to_uppercase() == "SSD"
    } else {
        false
    }
}

#[cfg(not(target_os = "windows"))]
fn detect_is_ssd(_drive_letter: char) -> bool {
    false
}

#[cfg(target_os = "windows")]
fn trigger_hardware_trim(drive_letter: char, offset: u64, length: u64) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    
    let volume_path_str = format!("\\\\.\\{}:", drive_letter);
    let mut volume_path: Vec<u16> = std::ffi::OsStr::new(&volume_path_str).encode_wide().collect();
    volume_path.push(0);

    const GENERIC_WRITE: u32 = 0x40000000;
    const FILE_SHARE_READ: u32 = 0x00000001;
    const FILE_SHARE_WRITE: u32 = 0x00000002;
    const OPEN_EXISTING: u32 = 3;
    const INVALID_HANDLE_VALUE: *mut std::ffi::c_void = -1i64 as *mut std::ffi::c_void;
    const FSCTL_FILE_LEVEL_TRIM: u32 = 0x00090310;

    unsafe {
        let h_volume = CreateFileW(
            volume_path.as_ptr(),
            GENERIC_WRITE,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            std::ptr::null(),
            OPEN_EXISTING,
            0,
            std::ptr::null_mut(),
        );

        if h_volume == INVALID_HANDLE_VALUE {
            return Err("Failed to open volume handle for TRIM".to_string());
        }

        let header = FILE_LEVEL_TRIM_HEADER {
            key: 0,
            num_ranges: 1,
        };

        let range = FILE_LEVEL_TRIM_RANGE {
            offset,
            length,
        };

        #[repr(C)]
        struct TrimPayload {
            header: FILE_LEVEL_TRIM_HEADER,
            range: FILE_LEVEL_TRIM_RANGE,
        }

        let payload = TrimPayload { header, range };
        let mut bytes_returned: u32 = 0;

        let result = DeviceIoControl(
            h_volume,
            FSCTL_FILE_LEVEL_TRIM,
            &payload as *const _ as *const std::ffi::c_void,
            std::mem::size_of::<TrimPayload>() as u32,
            std::ptr::null_mut(),
            0,
            &mut bytes_returned,
            std::ptr::null_mut(),
        );

        CloseHandle(h_volume);

        if result == 0 {
            return Err("DeviceIoControl TRIM failed".to_string());
        }
    }

    // Trigger defrag/retrim asynchronously using powershell to optimize free space — hidden, no console
    let retrim_cmd = format!("Optimize-Volume -DriveLetter {} -ReTrim", drive_letter);
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("powershell")
            .args(&["-NoProfile", "-NonInteractive", "-Command", &retrim_cmd])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn();
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn trigger_hardware_trim(_drive_letter: char, _offset: u64, _length: u64) -> Result<(), String> {
    Err("TRIM is only supported on Windows".to_string())
}

#[tauri::command]
pub async fn secure_delete_file(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path_obj = Path::new(&path);
        if !path_obj.exists() {
            return Err("File not found".to_string());
        }
        
        let metadata = fs::metadata(&path_obj).map_err(|e| e.to_string())?;
        if !metadata.is_file() {
            return Err("Only files can be securely deleted".to_string());
        }
        
        let file_size = metadata.len();
        
        // Resolve absolute canonical path to extract drive letter
        let abs_path = path_obj.canonicalize().map_err(|e| format!("Failed to get absolute path: {}", e))?;
        let abs_path_str = abs_path.to_string_lossy();
        let clean_path = if abs_path_str.starts_with(r"\\?\") {
            &abs_path_str[4..]
        } else {
            &abs_path_str
        };
        let drive_letter = clean_path
            .chars()
            .next()
            .map(|c| c.to_ascii_uppercase());
        
        let is_ssd = if let Some(dl) = drive_letter {
            detect_is_ssd(dl)
        } else {
            false
        };

        if is_ssd {
            // Delete path normally and trigger TRIM deallocation
            fs::remove_file(&path_obj).map_err(|e| format!("Failed to delete file from disk: {}", e))?;
            if let Some(dl) = drive_letter {
                let _ = trigger_hardware_trim(dl, 0, file_size);
            }
        } else {
            // Traditional HDD: Overwrite 3 passes with random/zero patterns, truncate, then delete
            for pass in 0..3 {
                let mut file = fs::OpenOptions::new()
                    .write(true)
                    .open(&path_obj)
                    .map_err(|e| format!("Failed to open file for overwrite: {}", e))?;
                
                use std::io::{Seek, SeekFrom, Write};
                file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
                
                // Pass 0: Zero, Pass 1: 0xFF, Pass 2: Random
                let chunk = match pass {
                    0 => vec![0u8; 65536],
                    1 => vec![255u8; 65536],
                    _ => {
                        let mut r = vec![0u8; 65536];
                        use std::time::SystemTime;
                        let seed = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
                        let mut seed_u64 = (seed & 0xFFFFFFFFFFFFFFFF) as u64;
                        for i in 0..r.len() {
                            // Simple LCG pseudo-random generator
                            seed_u64 = seed_u64.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
                            r[i] = (seed_u64 >> 56) as u8;
                        }
                        r
                    }
                };
                
                let mut remaining = file_size;
                while remaining > 0 {
                    let write_size = remaining.min(65536) as usize;
                    file.write_all(&chunk[..write_size])
                        .map_err(|e| format!("Failed to overwrite file content: {}", e))?;
                    remaining -= write_size as u64;
                }
                file.flush().map_err(|e| format!("Failed to flush file to disk: {}", e))?;
            }
            
            let file = fs::OpenOptions::new()
                .write(true)
                .open(&path_obj)
                .map_err(|e| format!("Failed to open file for truncation: {}", e))?;
            file.set_len(0).map_err(|e| format!("Failed to truncate file: {}", e))?;
            
            fs::remove_file(&path_obj).map_err(|e| format!("Failed to delete file from disk: {}", e))?;
        }
        
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn get_file_stats(path: String) -> Result<(u64, u64, u64), String> {
    let p = Path::new(&path);
    let metadata = fs::metadata(&p).map_err(|e| e.to_string())?;
    let size = metadata.len();
    let modified = metadata.modified().ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let created = metadata.created().ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    Ok((size, modified, created))
}

#[tauri::command]
pub async fn watch_directory(
    app: AppHandle,
    state: State<'_, DirectoryWatcherState>,
    dir_path: String,
) -> Result<(), String> {
    let mut lock = state.watcher.lock().map_err(|e| e.to_string())?;
    
    if let Some((current_path, _)) = &*lock {
        if current_path == &dir_path {
            return Ok(());
        }
    }
    
    *lock = None;
    
    if dir_path.is_empty() {
        return Ok(());
    }
    
    let path = Path::new(&dir_path);
    if !path.exists() || !path.is_dir() {
        return Err("Directory does not exist".to_string());
    }
    
    let app_clone = app.clone();
    let dir_path_clone = dir_path.clone();
    
    use notify::{Watcher, RecursiveMode};
    let mut watcher = notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
        if let Ok(event) = res {
            if event.kind.is_create() || event.kind.is_modify() || event.kind.is_remove() {
                let _ = app_clone.emit("directory-changed", dir_path_clone.clone());
            }
        }
    }).map_err(|e| e.to_string())?;
    
    watcher.watch(path, RecursiveMode::NonRecursive).map_err(|e| e.to_string())?;
    
    *lock = Some((dir_path, watcher));
    Ok(())
}
