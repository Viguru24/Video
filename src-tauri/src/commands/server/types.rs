use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

pub static WIFI_SHARE_TOKEN: OnceLock<String> = OnceLock::new();

pub fn constant_time_token_eq(expected: &str, provided: Option<&str>) -> bool {
    let Some(cand) = provided else {
        return false;
    };
    let a = expected.as_bytes();
    let b = cand.trim().as_bytes();
    if a.len() != b.len() || a.is_empty() {
        return false;
    }
    let mut diff = 0u8;
    for (&x, &y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

fn is_valid_persisted_token(s: &str) -> bool {
    let t = s.trim();
    t.len() >= 16 && t.len() <= 128 && t.bytes().all(|b| b.is_ascii_alphanumeric())
}

pub fn init_wifi_token_from_dir(app_data_dir: &Path) -> String {
    WIFI_SHARE_TOKEN
        .get_or_init(|| {
            let token_path = app_data_dir.join("wifi_share_token.key");
            if let Ok(existing) = fs::read_to_string(&token_path) {
                let trimmed = existing.trim();
                if is_valid_persisted_token(trimmed) {
                    return trimmed.to_string();
                }
            }
            let generated = uuid::Uuid::new_v4().simple().to_string();
            let _ = fs::create_dir_all(app_data_dir);
            let _ = fs::write(&token_path, &generated);
            generated
        })
        .clone()
}

pub fn get_or_init_wifi_token() -> String {
    WIFI_SHARE_TOKEN
        .get_or_init(|| uuid::Uuid::new_v4().simple().to_string())
        .clone()
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileItemResponse {
    pub id: String,
    pub name: String,
    pub size: u64,
    pub mime_type: String,
    pub uploaded_at: u64,
    pub is_phone_upload: bool,
}

#[derive(Clone)]
pub struct FileItem {
    pub id: String,
    pub name: String,
    pub size: u64,
    pub mime_type: String,
    pub filename: String, // can be absolute path or relative upload name
    pub uploaded_at: u64,
}

impl FileItem {
    pub fn to_response(&self) -> FileItemResponse {
        let is_phone_upload = !self.filename.contains(':') && !self.filename.starts_with('/') && !self.filename.starts_with('\\');
        FileItemResponse {
            id: self.id.clone(),
            name: self.name.clone(),
            size: self.size,
            mime_type: self.mime_type.clone(),
            uploaded_at: self.uploaded_at,
            is_phone_upload,
        }
    }
}

#[derive(Clone)]
pub struct Room {
    pub code: String,
    pub created_at: u64,
    pub last_activity: u64,
    pub receiver_connected: bool,
    pub receiver_last_seen: u64,
    pub files: Vec<FileItem>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomResponse {
    pub code: String,
    pub created_at: u64,
    pub receiver_connected: bool,
    pub files: Vec<FileItemResponse>,
}

impl Room {
    pub fn to_response(&self) -> RoomResponse {
        RoomResponse {
            code: self.code.clone(),
            created_at: self.created_at,
            receiver_connected: self.receiver_connected,
            files: self.files.iter().map(|f| f.to_response()).collect(),
        }
    }
}

pub type RoomStore = Arc<Mutex<HashMap<String, Room>>>;

pub static ROOMS: std::sync::OnceLock<RoomStore> = std::sync::OnceLock::new();

pub fn get_file_info(code: &str, file_id: &str) -> Option<(PathBuf, String, String)> {
    let rooms = ROOMS.get_or_init(|| Arc::new(Mutex::new(HashMap::new()))).clone();
    let store = rooms.lock().unwrap_or_else(|e| e.into_inner());
    let upload_dir = std::env::temp_dir().join("wi-share-files");

    // 1. Try exact match in the requested room code
    if let Some(room) = store.get(code) {
        if let Some(file) = room.files.iter().find(|f| f.id == file_id) {
            let path = if file.filename.contains(':') || file.filename.starts_with('/') || file.filename.starts_with('\\') {
                PathBuf::from(&file.filename)
            } else {
                upload_dir.join(&file.filename)
            };
            return Some((path, file.name.clone(), file.mime_type.clone()));
        }
    }

    // 2. Fallback: Search across all active rooms for the file_id
    for (_, room) in store.iter() {
        if let Some(file) = room.files.iter().find(|f| f.id == file_id) {
            let path = if file.filename.contains(':') || file.filename.starts_with('/') || file.filename.starts_with('\\') {
                PathBuf::from(&file.filename)
            } else {
                upload_dir.join(&file.filename)
            };
            return Some((path, file.name.clone(), file.mime_type.clone()));
        }
    }

    None
}

#[derive(Clone)]
pub struct AppState {
    pub rooms: RoomStore,
    pub upload_dir: PathBuf,
    pub frontend_path: PathBuf,
    pub auth_token: String,
}

pub fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
