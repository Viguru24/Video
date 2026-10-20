use base64::Engine as _;
use serde_json::Value;
use std::fs;
use tauri::{AppHandle, Manager};

pub fn hash_media_path(p: &str) -> String {
    let norm = p.replace('/', "\\").to_lowercase();
    let mut h: u64 = 0xcbf29ce484222325;
    for b in norm.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("h_{:016x}", h)
}

pub fn register_upscale_history(app: &AppHandle, file_path: &str, used_ai: bool) {
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

        history.insert(hash_media_path(file_path), Value::String(model_desc.to_string()));

        if let Ok(s) = serde_json::to_string_pretty(&history) {
            let _ = fs::create_dir_all(&app_data);
            let _ = fs::write(history_file, s);
        }
    }
}

pub fn seal_persistence_payload(plain: &str) -> String {
    let mut state: u64 = 0x8a5cd789635d2dff;
    let mut out = Vec::with_capacity(plain.len());
    for (idx, b) in plain.as_bytes().iter().enumerate() {
        state ^= (idx as u64).wrapping_mul(0x9e3779b97f4a7c15);
        state ^= state >> 12;
        state ^= state << 25;
        state ^= state >> 27;
        let k = (state.wrapping_mul(0x2545f4914f6cdd1d) >> 56) as u8;
        out.push(b ^ k);
    }
    format!("ENC1:{}", base64::engine::general_purpose::STANDARD.encode(out))
}

pub fn unseal_persistence_payload(raw: &str) -> String {
    let trimmed = raw.trim();
    if let Some(b64) = trimmed.strip_prefix("ENC1:") {
        if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(b64) {
            let mut state: u64 = 0x8a5cd789635d2dff;
            let mut out = Vec::with_capacity(bytes.len());
            for (idx, b) in bytes.iter().enumerate() {
                state ^= (idx as u64).wrapping_mul(0x9e3779b97f4a7c15);
                state ^= state >> 12;
                state ^= state << 25;
                state ^= state >> 27;
                let k = (state.wrapping_mul(0x2545f4914f6cdd1d) >> 56) as u8;
                out.push(b ^ k);
            }
            if let Ok(s) = String::from_utf8(out) {
                return s;
            }
        }
    }
    raw.to_string()
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
                        serde_json::from_str::<Value>(&unseal_persistence_payload(&existing_content)).is_ok()
                    } else {
                        !existing_content.trim().is_empty()
                    };
                    if existing_valid {
                        let _ = fs::copy(&file_path, &bak_path);
                    }
                }
            }

            let sealed_data = seal_persistence_payload(&data);
            if fs::write(&tmp_path, &sealed_data).is_ok() {
                let _ = fs::rename(&tmp_path, &file_path);
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
                if let Ok(raw_content) = fs::read_to_string(&file_path) {
                    let content = unseal_persistence_payload(&raw_content);
                    if is_valid(&content) {
                        return Some(content);
                    } else {
                        eprintln!("[Persistence] Primary file for {} is invalid/corrupted.", key);
                    }
                }
            }

            if bak_path.exists() {
                if let Ok(raw_content) = fs::read_to_string(&bak_path) {
                    let content = unseal_persistence_payload(&raw_content);
                    if is_valid(&content) {
                        eprintln!("[Persistence] Recovered {} from AppData backup.", key);
                        return Some(content);
                    }
                }
            }
        }

        None
    }).await.ok().flatten()
}
