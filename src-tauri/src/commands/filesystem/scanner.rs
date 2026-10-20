use rayon::prelude::*;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::RwLock;

pub static STATS_CACHE: std::sync::OnceLock<RwLock<std::collections::HashMap<String, (u64, u64, u64)>>> = std::sync::OnceLock::new();

#[cfg(windows)]
pub fn is_file_still_writing(p: &Path) -> bool {
    use std::os::windows::fs::OpenOptionsExt;
    const FILE_SHARE_READ: u32 = 0x00000001;
    const FILE_SHARE_DELETE: u32 = 0x00000004;

    std::fs::OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_DELETE)
        .open(p)
        .is_err()
}

#[cfg(not(windows))]
pub fn is_file_still_writing(p: &Path) -> bool {
    std::fs::File::open(p).is_err()
}

pub fn get_cached_file_stats(p: &Path) -> (u64, u64, u64) {
    let key = p.to_string_lossy().to_string();
    let cache = STATS_CACHE.get_or_init(|| RwLock::new(std::collections::HashMap::new()));
    
    if let Ok(guard) = cache.read() {
        if let Some(stats) = guard.get(&key) {
            return *stats;
        }
    }
    
    let metadata = fs::metadata(p).ok();
    let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
    let modified = metadata.as_ref()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let created = metadata.as_ref()
        .and_then(|m| m.created().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    
    let stats = (size, modified, created);
    if let Ok(mut guard) = cache.write() {
        if size > 0 && !is_file_still_writing(p) && guard.len() < 20000 {
            guard.insert(key, stats);
        }
    }
    stats
}

#[tauri::command]
pub async fn get_folder_videos(path: String, mode: String) -> Result<Vec<serde_json::Value>, String> {
    tauri::async_runtime::spawn_blocking(move || {
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
            if name_lower.starts_with(".cosmo_tmp_") { return true; }
            matches!(
                name_lower.as_str(),
                ".git" | "node_modules" | ".next" | "target" | "dist" | "build" |
                "venv" | ".venv" | ".cosmo_models" | "__pycache__" | "bin" | "obj" |
                "appdata" | "$recycle.bin" | "system volume information"
            )
        }

        let mut collected_paths = Vec::new();
        fn collect_file_paths(dir: &Path, target_exts: &[&str], out: &mut Vec<PathBuf>, depth: usize) {
            if depth > 2 || out.len() >= 5000 {
                return;
            }
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    if out.len() >= 5000 {
                        break;
                    }
                    let p = entry.path();
                    if p.is_dir() {
                        if let Some(dname) = p.file_name().and_then(|s| s.to_str()) {
                            if !is_ignored_dir(dname) {
                                collect_file_paths(&p, target_exts, out, depth + 1);
                            }
                        }
                    } else if p.is_file() {
                        let fname = p.file_name().and_then(|s| s.to_str()).unwrap_or("");
                        let name_lower = fname.to_lowercase();
                        if name_lower.ends_with(".temp.mp4")
                            || name_lower.ends_with(".part")
                            || name_lower.ends_with(".crdownload")
                            || name_lower.ends_with(".tmp")
                            || name_lower.ends_with(".ytdl")
                            || name_lower.ends_with(".download")
                            || name_lower.starts_with(".cosmo_tmp_")
                            || name_lower.contains("_upscale_temp_") {
                            continue;
                        }
                        if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                            if target_exts.contains(&ext.to_lowercase().as_str()) {
                                out.push(p);
                            }
                        }
                    }
                }
            }
        }

        let root = Path::new(&path);
        if !root.exists() || !root.is_dir() {
            return Err("Invalid or non-existent folder path".into());
        }

        collect_file_paths(root, &target_exts, &mut collected_paths, 0);

        let vids: Vec<serde_json::Value> = collected_paths
            .par_iter()
            .map(|p| {
                let name = p.file_name().and_then(|s| s.to_str()).unwrap_or("Unknown").to_string();
                let (size, modified, created) = get_cached_file_stats(p);
                serde_json::json!({
                    "name": name,
                    "path": p.to_string_lossy().to_string(),
                    "size": size,
                    "modified": modified,
                    "created": created
                })
            })
            .collect();

        Ok(vids)
    }).await.map_err(|e| e.to_string())?
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
        let audio_exts = ["mp3", "wav", "flac", "aac", "ogg", "wma", "opus", "m4a"];
        
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                let p = entry.path();
                let name = p.file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_string();
                let is_dir = p.is_dir();
                if is_dir && name.starts_with(".cosmo_tmp_") { continue; }
                let mut is_media = false;
                if !is_dir {
                    let name_lower = name.to_lowercase();
                    if name_lower.ends_with(".temp.mp4") 
                        || name_lower.ends_with(".part") 
                        || name_lower.ends_with(".crdownload") 
                        || name_lower.ends_with(".tmp") 
                        || name_lower.ends_with(".ytdl") 
                        || name_lower.ends_with(".download")
                        || name_lower.starts_with(".cosmo_tmp_")
                        || name_lower.contains("_upscale_temp_") {
                        continue;
                    }
                    if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                        let ext_lower = ext.to_lowercase();
                        is_media = video_exts.contains(&ext_lower.as_str()) 
                            || image_exts.contains(&ext_lower.as_str())
                            || audio_exts.contains(&ext_lower.as_str());
                    }
                    if !is_media {
                        continue;
                    }
                }
                
                let mut size = 0u64;
                let mut modified = 0u64;
                let mut created = 0u64;
                let mut is_writing = false;

                if let Ok(metadata) = p.metadata() {
                    size = metadata.len();
                    if !is_dir && is_media {
                        if size == 0 {
                            is_writing = true;
                        } else if is_file_still_writing(&p) {
                            is_writing = true;
                        } else if let Ok(time) = metadata.modified() {
                            if let Ok(elapsed) = time.elapsed() {
                                if elapsed.as_millis() < 400 {
                                    std::thread::sleep(std::time::Duration::from_millis(60));
                                    if let Ok(m2) = p.metadata() {
                                        if m2.len() != size || is_file_still_writing(&p) {
                                            is_writing = true;
                                            size = m2.len();
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if let Ok(time) = metadata.modified() {
                        if let Ok(duration) = time.duration_since(std::time::SystemTime::UNIX_EPOCH) {
                            modified = duration.as_millis() as u64;
                        }
                    }
                    if let Ok(time) = metadata.created() {
                        if let Ok(duration) = time.duration_since(std::time::SystemTime::UNIX_EPOCH) {
                            created = duration.as_millis() as u64;
                        }
                    }
                }

                items.push(serde_json::json!({
                    "name": name,
                    "path": p.to_string_lossy().to_string(),
                    "is_dir": is_dir,
                    "is_media": is_media,
                    "is_writing": is_writing,
                    "size": size,
                    "modified": modified,
                    "created": created
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
pub fn get_file_stats(path: String) -> Result<(u64, u64, u64), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("File does not exist".into());
    }
    Ok(get_cached_file_stats(p))
}
