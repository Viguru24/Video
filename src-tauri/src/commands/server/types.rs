use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

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
    let store = rooms.lock().unwrap();
    let room = store.get(code)?;
    let file = room.files.iter().find(|f| f.id == file_id)?;
    let upload_dir = std::env::temp_dir().join("wi-share-files");
    let path = if file.filename.contains(':') || file.filename.starts_with('/') || file.filename.starts_with('\\') {
        PathBuf::from(&file.filename)
    } else {
        upload_dir.join(&file.filename)
    };
    Some((path, file.name.clone(), file.mime_type.clone()))
}

#[derive(Clone)]
pub struct AppState {
    pub rooms: RoomStore,
    pub upload_dir: PathBuf,
    pub frontend_path: PathBuf,
}

pub fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}
