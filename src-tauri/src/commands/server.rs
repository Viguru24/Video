use axum::{
    extract::{DefaultBodyLimit, Multipart, Path as AxumPath, Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{Html, IntoResponse, Json},
    routing::{delete, get, post},
    Router,
};
use base64::Engine as _;
use image::{ImageBuffer, Rgba};
use qrcode::QrCode;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    io::Cursor,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tower_http::cors::CorsLayer;
use tauri::Manager;

// ─── Data Types ───

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

pub fn get_file_info(code: &str, file_id: &str) -> Option<(PathBuf, String)> {
    let rooms = ROOMS.get()?.lock().unwrap();
    let room = rooms.get(code)?;
    let file = room.files.iter().find(|f| f.id == file_id)?;
    let upload_dir = std::env::temp_dir().join("wi-share-files");
    let path = if file.filename.contains(':') || file.filename.starts_with('/') || file.filename.starts_with('\\') {
        PathBuf::from(&file.filename)
    } else {
        upload_dir.join(&file.filename)
    };
    Some((path, file.name.clone()))
}

#[derive(Clone)]
struct AppState {
    rooms: RoomStore,
    upload_dir: PathBuf,
    frontend_path: PathBuf,
}

// ─── Helpers ───

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

fn get_local_ip() -> String {
    let virtual_keywords = [
        "virtual",
        "vbox",
        "wsl",
        "docker",
        "host-only",
        "hyper-v",
        "vpn",
        "tailscale",
        "surfshark",
        "openvpn",
        "loopback",
        "pseudo",
    ];

    let is_virtual = |name: &str| -> bool {
        let lower = name.to_lowercase();
        virtual_keywords.iter().any(|kw| lower.contains(kw))
    };

    let mut fallback_ip: Option<String> = None;

    if let Ok(ifaces) = if_addrs::get_if_addrs() {
        for iface in &ifaces {
            if let std::net::IpAddr::V4(ipv4) = iface.addr.ip() {
                let ip_str = ipv4.to_string();

                // Skip loopback and link-local
                if iface.is_loopback()
                    || ip_str.starts_with("169.254.")
                    || ip_str.starts_with("127.")
                {
                    continue;
                }

                if is_virtual(&iface.name) {
                    if fallback_ip.is_none() {
                        fallback_ip = Some(ip_str);
                    }
                } else {
                    return ip_str; // Prefer physical interface
                }
            }
        }
    }

    fallback_ip.unwrap_or_else(|| "127.0.0.1".to_string())
}

fn generate_qr_data_url(text: &str) -> String {
    let code = match QrCode::new(text.as_bytes()) {
        Ok(c) => c,
        Err(_) => return String::new(),
    };

    let matrix = code
        .render::<char>()
        .quiet_zone(true)
        .module_dimensions(1, 1)
        .build();
    let lines: Vec<&str> = matrix.lines().collect();
    let h = lines.len();
    let w = if h > 0 { lines[0].chars().count() } else { 0 };

    let scale = 8u32;
    let img_w = (w as u32) * scale;
    let img_h = (h as u32) * scale;

    let mut img = ImageBuffer::<Rgba<u8>, Vec<u8>>::new(img_w, img_h);

    // Fill white
    for pixel in img.pixels_mut() {
        *pixel = Rgba([255, 255, 255, 255]);
    }

    // Draw black modules
    for (row_idx, line) in lines.iter().enumerate() {
        for (col_idx, ch) in line.chars().enumerate() {
            if ch == '█' || ch == '\u{2588}' {
                for dy in 0..scale {
                    for dx in 0..scale {
                        let px = (col_idx as u32) * scale + dx;
                        let py = (row_idx as u32) * scale + dy;
                        if px < img_w && py < img_h {
                            img.put_pixel(px, py, Rgba([0, 0, 0, 255]));
                        }
                    }
                }
            }
        }
    }

    let mut buf = Cursor::new(Vec::new());
    if image::write_buffer_with_format(
        &mut buf,
        &img,
        img_w,
        img_h,
        image::ColorType::Rgba8,
        image::ImageFormat::Png,
    )
    .is_err()
    {
        return String::new();
    }

    let b64 = base64::engine::general_purpose::STANDARD.encode(buf.into_inner());
    format!("data:image/png;base64,{}", b64)
}

// ─── Route Handlers ───

async fn create_room(State(state): State<AppState>) -> Json<serde_json::Value> {
    let mut rooms = state.rooms.lock().unwrap();
    let code = "local".to_string();
    let now = now_millis();

    let room = rooms
        .entry(code.clone())
        .or_insert_with(|| Room {
            code: code.clone(),
            created_at: now,
            last_activity: now,
            receiver_connected: false,
            receiver_last_seen: now,
            files: vec![],
        })
        .clone();

    let local_ip = get_local_ip();
    let share_url = format!("http://{}:48273/", local_ip);
    let qr_data_url = generate_qr_data_url(&share_url);

    Json(serde_json::json!({
        "success": true,
        "code": code,
        "shareUrl": share_url,
        "qrDataUrl": qr_data_url,
        "room": room.to_response()
    }))
}

#[derive(Deserialize)]
struct StatusQuery {
    role: Option<String>,
}

async fn room_status(
    State(state): State<AppState>,
    AxumPath(code): AxumPath<String>,
    Query(query): Query<StatusQuery>,
) -> impl IntoResponse {
    let mut rooms = state.rooms.lock().unwrap();
    let Some(room) = rooms.get_mut(&code) else {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Room not found or expired."})),
        ).into_response();
    };

    if query.role.as_deref() == Some("receiver") {
        room.receiver_connected = true;
        room.receiver_last_seen = now_millis();
    }

    // Check receiver timeout (12s)
    if now_millis() - room.receiver_last_seen > 12000 {
        room.receiver_connected = false;
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "success": true,
            "room": room.to_response()
        })),
    ).into_response()
}

async fn join_room(State(state): State<AppState>, AxumPath(code): AxumPath<String>) -> impl IntoResponse {
    let mut rooms = state.rooms.lock().unwrap();
    let Some(room) = rooms.get_mut(&code) else {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Room not found or expired."})),
        ).into_response();
    };

    room.receiver_connected = true;
    room.receiver_last_seen = now_millis();

    (StatusCode::OK, Json(serde_json::json!({"success": true}))).into_response()
}

async fn upload_files(
    State(state): State<AppState>,
    AxumPath(code): AxumPath<String>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    // Check room exists
    {
        let rooms = state.rooms.lock().unwrap();
        if !rooms.contains_key(&code) {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "Room not found or expired."})),
            ).into_response();
        }
    }

    let mut uploaded: Vec<FileItem> = vec![];

    while let Ok(Some(mut field)) = multipart.next_field().await {
        let original_name = field.file_name().unwrap_or("unknown").to_string();
        let content_type = field
            .content_type()
            .unwrap_or("application/octet-stream")
            .to_string();

        let file_id = uuid::Uuid::new_v4().to_string()[..9].to_string();
        let safe_name: String = original_name
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        let disk_name = format!("{}-{}", now_millis(), safe_name);

        let file_path = state.upload_dir.join(&disk_name);
        
        let mut file = match tokio::fs::File::create(&file_path).await {
            Ok(f) => f,
            Err(_) => continue,
        };

        use tokio::io::AsyncWriteExt;
        let mut total_size = 0u64;
        let mut stream_error = false;

        while let Ok(Some(chunk)) = field.chunk().await {
            if file.write_all(&chunk).await.is_err() {
                stream_error = true;
                break;
            }
            total_size += chunk.len() as u64;
        }

        if stream_error {
            let _ = tokio::fs::remove_file(&file_path).await;
            continue;
        }

        let item = FileItem {
            id: file_id,
            name: original_name,
            size: total_size,
            mime_type: content_type,
            filename: disk_name,
            uploaded_at: now_millis(),
        };

        uploaded.push(item);
    }

    if uploaded.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "No files uploaded."})),
        ).into_response();
    }

    let mut rooms = state.rooms.lock().unwrap();
    let Some(room) = rooms.get_mut(&code) else {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Room not found or expired."})),
        ).into_response();
    };

    let response_files: Vec<FileItemResponse> = uploaded.iter().map(|f| f.to_response()).collect();
    room.files.extend(uploaded);
    room.last_activity = now_millis();

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "success": true,
            "files": response_files,
            "room": room.to_response()
        })),
    ).into_response()
}

async fn download_file(
    State(state): State<AppState>,
    AxumPath((code, file_id)): AxumPath<(String, String)>,
) -> impl IntoResponse {
    let mut rooms = state.rooms.lock().unwrap();
    let Some(room) = rooms.get_mut(&code) else {
        return (StatusCode::NOT_FOUND, HeaderMap::new(), vec![]).into_response();
    };

    let Some(file) = room.files.iter().find(|f| f.id == file_id) else {
        return (StatusCode::NOT_FOUND, HeaderMap::new(), vec![]).into_response();
    };

    let file_path = if file.filename.contains(':') || file.filename.starts_with('/') || file.filename.starts_with('\\') {
        PathBuf::from(&file.filename)
    } else {
        state.upload_dir.join(&file.filename)
    };

    let Ok(data) = fs::read(&file_path) else {
        return (StatusCode::NOT_FOUND, HeaderMap::new(), vec![]).into_response();
    };

    room.last_activity = now_millis();

    let mut headers = HeaderMap::new();
    let encoded_name = urlencoding_name(&file.name);
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("attachment; filename=\"{}\"", encoded_name))
            .unwrap_or_else(|_| HeaderValue::from_static("attachment")),
    );
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(&file.mime_type)
            .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
    );

    (StatusCode::OK, headers, data).into_response()
}

fn urlencoding_name(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c.to_string()
            } else {
                format!("%{:02X}", c as u32)
            }
        })
        .collect()
}

async fn delete_room(State(state): State<AppState>, AxumPath(code): AxumPath<String>) -> impl IntoResponse {
    let mut rooms = state.rooms.lock().unwrap();
    if let Some(room) = rooms.remove(&code) {
        for file in &room.files {
            // Only remove temporary uploads, not direct PC sharing paths
            if !file.filename.contains(':') && !file.filename.starts_with('/') && !file.filename.starts_with('\\') {
                let path = state.upload_dir.join(&file.filename);
                let _ = secure_delete_file(path);
            }
        }
        (
            StatusCode::OK,
            Json(serde_json::json!({"success": true, "message": "Room destroyed successfully"})),
        ).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Room not found"})),
        ).into_response()
    }
}

async fn delete_file(
    State(state): State<AppState>,
    AxumPath((code, file_id)): AxumPath<(String, String)>,
) -> impl IntoResponse {
    let mut rooms = state.rooms.lock().unwrap();
    let Some(room) = rooms.get_mut(&code) else {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Room not found"})),
        ).into_response();
    };

    if let Some(pos) = room.files.iter().position(|f| f.id == file_id) {
        let file = room.files.remove(pos);
        if !file.filename.contains(':') && !file.filename.starts_with('/') && !file.filename.starts_with('\\') {
            let path = state.upload_dir.join(&file.filename);
            let _ = secure_delete_file(path);
        }
        room.last_activity = now_millis();
        (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": "File deleted successfully",
                "room": room.to_response()
            })),
        ).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "File not found"})),
        ).into_response()
    }
}

async fn spa_fallback(State(state): State<AppState>) -> impl IntoResponse {
    let index_path = state.frontend_path.join("index.html");
    match fs::read_to_string(&index_path) {
        Ok(html) => Html(html).into_response(),
        Err(_) => (StatusCode::NOT_FOUND, "Frontend not found").into_response(),
    }
}

// ─── Background Cleanup ───

fn spawn_cleanup_task(rooms: RoomStore, upload_dir: PathBuf) {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;

            let now = now_millis();
            let max_inactivity: u64 = 15 * 60 * 1000; // 15 minutes

            let mut store = rooms.lock().unwrap();
            if let Some(room) = store.get_mut("local") {
                if now - room.last_activity > max_inactivity && !room.files.is_empty() {
                    println!("[CleanUp] Room local timed out due to inactivity. Clearing files...");
                    for file in &room.files {
                        if !file.filename.contains(':') && !file.filename.starts_with('/') && !file.filename.starts_with('\\') {
                            let path = upload_dir.join(&file.filename);
                            let _ = fs::remove_file(path);
                        }
                    }
                    room.files.clear();
                    room.last_activity = now;
                }
            }
        }
    });
}

// ─── Server Entry Point ───

async fn view_local_file(
    Query(params): Query<HashMap<String, String>>,
    req: axum::extract::Request,
) -> impl IntoResponse {
    let host = req
        .headers()
        .get(axum::http::header::HOST)
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");
    if !host.starts_with("127.0.0.1") && !host.starts_with("localhost") {
        return (StatusCode::FORBIDDEN, "Access denied: route restricted to localhost").into_response();
    }

    let Some(path_str) = params.get("path") else {
        return (StatusCode::BAD_REQUEST, "Missing path parameter").into_response();
    };
    let p = PathBuf::from(path_str);
    if !p.is_file() {
        return (StatusCode::NOT_FOUND, "File not found").into_response();
    }

    use tower::util::ServiceExt;
    let service = tower_http::services::ServeFile::new(&p);
    match service.oneshot(req).await {
        Ok(res) => res.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn start_server(frontend_dist_path: String) {
    let upload_dir = std::env::temp_dir().join("wi-share-files");
    let _ = fs::create_dir_all(&upload_dir);

    let frontend_path = PathBuf::from(&frontend_dist_path);

    let rooms = ROOMS
        .get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
        .clone();

    let state = AppState {
        rooms,
        upload_dir: upload_dir.clone(),
        frontend_path: frontend_path.clone(),
    };

    // Spawn background room cleanup
    spawn_cleanup_task(state.rooms.clone(), upload_dir);

    // CORS — allow all origins for phone access
    let cors = CorsLayer::permissive();

    // API routes
    let api = Router::new()
        .route("/api/rooms/create", post(create_room))
        .route("/api/rooms/{code}/status", get(room_status))
        .route("/api/rooms/{code}/join", post(join_room))
        .route("/api/rooms/{code}/upload", post(upload_files))
        .route(
            "/api/rooms/{code}/files/{file_id}",
            get(download_file).delete(delete_file),
        )
        .route("/api/rooms/{code}", delete(delete_room))
        .route("/api/view-file", get(view_local_file));

    // Static file serving + SPA fallback
    let serve_dir = tower_http::services::ServeDir::new(&frontend_path)
        .fallback(get(spa_fallback).with_state(state.clone()));

    let app = api
        .fallback_service(serve_dir)
        .layer(cors)
        .layer(DefaultBodyLimit::disable()) // Allow large video files via Wi-Fi
        .with_state(state);

    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], 48273));
    println!("[Wi-Fi Share Server] running on http://0.0.0.0:48273");

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            println!("[Wi-Fi Share Server] Bind failed (port may be in use): {}", e);
            return;
        }
    };

    let _ = axum::serve(listener, app).await;
}

// ─── Tauri Command Integrations ───

#[tauri::command]
pub async fn set_wifi_shared_files(paths: Vec<String>) -> Result<(), String> {
    let rooms = ROOMS.get_or_init(|| Arc::new(Mutex::new(HashMap::new()))).clone();
    let mut store = rooms.lock().unwrap();
    let room = store.entry("local".to_string()).or_insert_with(|| Room {
        code: "local".to_string(),
        created_at: now_millis(),
        last_activity: now_millis(),
        receiver_connected: false,
        receiver_last_seen: now_millis(),
        files: vec![],
    });

    // Remove any existing direct PC shared paths, but KEEP phone-uploaded files.
    // Phone-uploaded files are saved as relative filenames, whereas PC files are absolute paths containing colons/slashes.
    let mut clean_files: Vec<FileItem> = room.files.iter()
        .filter(|f| !f.filename.contains(':') && !f.filename.starts_with('/') && !f.filename.starts_with('\\'))
        .cloned()
        .collect();

    // Add newly shared PC files
    for path_str in paths {
        let p = std::path::Path::new(&path_str);
        if !p.exists() || !p.is_file() {
            continue;
        }
        let name = p.file_name()
            .and_then(|s: &std::ffi::OsStr| s.to_str())
            .unwrap_or("file")
            .to_string();
        let size = p.metadata().map(|m: std::fs::Metadata| m.len()).unwrap_or(0);
        let ext = p.extension().and_then(|s: &std::ffi::OsStr| s.to_str()).unwrap_or("");
        
        let mime_type = match ext.to_lowercase().as_str() {
            "mp4" | "m4v" => "video/mp4",
            "webm" => "video/webm",
            "ogg" | "ogv" => "video/ogg",
            "mov" => "video/quicktime",
            "jpg" | "jpeg" => "image/jpeg",
            "png" => "image/png",
            "gif" => "image/gif",
            "webp" => "image/webp",
            _ => "application/octet-stream",
        }.to_string();

        let id = uuid::Uuid::new_v4().to_string()[..9].to_string();

        clean_files.push(FileItem {
            id,
            name,
            size,
            mime_type,
            filename: path_str,
            uploaded_at: now_millis(),
        });
    }

    room.files = clean_files;
    room.last_activity = now_millis();
    Ok(())
}

#[tauri::command]
pub async fn download_shared_file_to_downloads(
    app: tauri::AppHandle,
    code: String,
    file_id: String,
) -> Result<String, String> {
    let (file_path, file_name) = get_file_info(&code, &file_id)
        .ok_or_else(|| "File not found or room expired".to_string())?;

    let download_dir = app.path()
        .download_dir()
        .map_err(|e| format!("Failed to resolve downloads directory: {}", e))?;

    let _ = fs::create_dir_all(&download_dir);

    // Make sure we have a unique filename
    let mut target_path = download_dir.join(&file_name);
    if target_path.exists() {
        let stem = target_path.file_stem().and_then(|s: &std::ffi::OsStr| s.to_str()).unwrap_or("");
        let extension = target_path.extension().and_then(|e: &std::ffi::OsStr| e.to_str()).unwrap_or("");

        let mut counter = 1;
        loop {
            let new_filename = if extension.is_empty() {
                format!("{} ({})", stem, counter)
            } else {
                format!("{} ({}).{}", stem, counter, extension)
            };
            let new_path = download_dir.join(&new_filename);
            if !new_path.exists() {
                target_path = new_path;
                break;
            }
            counter += 1;
        }
    }

    fs::copy(&file_path, &target_path).map_err(|e| format!("Failed to copy file: {}", e))?;
    Ok(target_path.to_string_lossy().to_string())
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
    // 1. Clean up local Wi-Fi share directory
    let upload_dir = std::env::temp_dir().join("wi-share-files");
    let _ = secure_delete_dir_all(upload_dir);

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
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(())
}
