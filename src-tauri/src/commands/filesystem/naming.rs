use std::fs;
use std::path::{Path, PathBuf};

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
    tauri::async_runtime::spawn_blocking(move || {
        let old_p = PathBuf::from(&old_path);
        if !old_p.exists() {
            return Err("Source file not found".into());
        }

        let parent = old_p.parent().ok_or("Invalid parent directory")?;
        let extension = old_p.extension().and_then(|e| e.to_str()).ok_or("File has no extension")?;
        
        let sanitized_name = new_name.replace(|c: char| !c.is_alphanumeric() && c != ' ' && c != '_' && c != '-', "");
        let sanitized_name = sanitized_name.trim();
        if sanitized_name.is_empty() {
            return Err("Invalid new name".into());
        }

        let new_filename = format!("{}.{}", sanitized_name, extension);
        let mut new_p = parent.join(&new_filename);

        let canonical_old = fs::canonicalize(&old_p).unwrap_or_else(|_| old_p.clone());
        let canonical_new = fs::canonicalize(&new_p).unwrap_or_else(|_| new_p.clone());

        if new_p.exists() && canonical_old != canonical_new {
            let base_prefix = extract_base_prefix(sanitized_name);
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

        let mut rename_err = None;
        for attempt in 0..5 {
            match fs::rename(&old_p, &new_p) {
                Ok(_) => {
                    rename_err = None;
                    break;
                }
                Err(e) => {
                    rename_err = Some(e);
                    if attempt < 4 {
                        std::thread::sleep(std::time::Duration::from_millis(60 * (attempt + 1)));
                    }
                }
            }
        }

        if let Some(err) = rename_err {
            fs::copy(&old_p, &new_p).map_err(|copy_err| {
                format!(
                    "Rename failed ({:?}) and copy fallback failed: {}",
                    err,
                    copy_err
                )
            })?;
            if let Err(_) = crate::commands::server::secure_delete_file(&old_p) {
                let _ = fs::remove_file(&old_p);
            }
        }

        Ok(new_p.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn duplicate_file_on_disk(src_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let clean_src = super::ops::clean_local_path(&src_path);
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
