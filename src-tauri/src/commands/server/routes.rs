use axum::{
    body::Bytes,
    extract::{DefaultBodyLimit, Multipart, Path as AxumPath, Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{Html, IntoResponse, Json},
    routing::{delete, get, post},
    Router,
};
use std::{collections::HashMap, fs, path::PathBuf};
use tower_http::cors::CorsLayer;

use super::cleanup::secure_delete_file;
use super::network::{generate_qr_data_url, get_local_ip, urlencoding_name};
use super::types::{now_millis, AppState, FileItem, FileItemResponse, Room, RoomStore, ROOMS};

pub async fn create_room(State(state): State<AppState>) -> Json<serde_json::Value> {
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

#[derive(serde::Deserialize)]
pub struct StatusQuery {
    pub role: Option<String>,
}

pub async fn room_status(
    State(state): State<AppState>,
    AxumPath(code): AxumPath<String>,
    Query(query): Query<StatusQuery>,
) -> impl IntoResponse {
    let mut rooms = state.rooms.lock().unwrap();
    let room = rooms.entry(code.clone()).or_insert_with(|| Room {
        code: code.clone(),
        created_at: now_millis(),
        last_activity: now_millis(),
        receiver_connected: false,
        receiver_last_seen: now_millis(),
        files: vec![],
    });

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

pub async fn join_room(State(state): State<AppState>, AxumPath(code): AxumPath<String>) -> impl IntoResponse {
    let mut rooms = state.rooms.lock().unwrap();
    let room = rooms.entry(code.clone()).or_insert_with(|| Room {
        code: code.clone(),
        created_at: now_millis(),
        last_activity: now_millis(),
        receiver_connected: true,
        receiver_last_seen: now_millis(),
        files: vec![],
    });

    room.receiver_connected = true;
    room.receiver_last_seen = now_millis();

    (StatusCode::OK, Json(serde_json::json!({"success": true}))).into_response()
}

pub async fn upload_files(
    State(state): State<AppState>,
    AxumPath(code): AxumPath<String>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let _ = tokio::fs::create_dir_all(&state.upload_dir).await;

    // Ensure room exists
    {
        let mut rooms = state.rooms.lock().unwrap();
        rooms.entry(code.clone()).or_insert_with(|| Room {
            code: code.clone(),
            created_at: now_millis(),
            last_activity: now_millis(),
            receiver_connected: true,
            receiver_last_seen: now_millis(),
            files: vec![],
        });
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

pub async fn download_file(
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
    headers.insert(
        header::CONTENT_LENGTH,
        HeaderValue::from_str(&data.len().to_string())
            .unwrap_or_else(|_| HeaderValue::from_static("0")),
    );

    (StatusCode::OK, headers, data).into_response()
}

pub async fn download_zip(
    State(state): State<AppState>,
    AxumPath(code): AxumPath<String>,
) -> impl IntoResponse {
    let rooms = state.rooms.lock().unwrap();
    let Some(room) = rooms.get(&code) else {
        return (StatusCode::NOT_FOUND, HeaderMap::new(), Bytes::new()).into_response();
    };

    // Collect all PC-shared files (absolute path entries)
    let pc_files: Vec<(String, PathBuf)> = room.files.iter()
        .filter(|f| f.filename.contains(':') || f.filename.starts_with('/') || f.filename.starts_with('\\'))
        .map(|f| (f.name.clone(), PathBuf::from(&f.filename)))
        .collect();

    drop(rooms); // release lock before doing IO

    if pc_files.is_empty() {
        return (StatusCode::NOT_FOUND, HeaderMap::new(), Bytes::new()).into_response();
    }

    // Build ZIP in memory
    let mut buf = std::io::Cursor::new(Vec::<u8>::new());
    {
        let mut zip = zip::ZipWriter::new(&mut buf);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .compression_level(Some(3)); // fast, good enough for media

        for (name, path) in &pc_files {
            if let Ok(data) = fs::read(path) {
                let _ = zip.start_file(name, options);
                use std::io::Write;
                let _ = zip.write_all(&data);
            }
        }
        let _ = zip.finish();
    }

    let zip_bytes = buf.into_inner();
    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment; filename=\"cosmo-share.zip\""),
    );
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/zip"),
    );
    headers.insert(
        header::CONTENT_LENGTH,
        HeaderValue::from_str(&zip_bytes.len().to_string())
            .unwrap_or_else(|_| HeaderValue::from_static("0")),
    );

    (StatusCode::OK, headers, Bytes::from(zip_bytes)).into_response()
}

pub async fn delete_room(State(state): State<AppState>, AxumPath(code): AxumPath<String>) -> impl IntoResponse {
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

pub async fn delete_file(
    State(state): State<AppState>,
    AxumPath((code, file_id)): AxumPath<(String, String)>,
) -> impl IntoResponse {
    let to_delete: Option<PathBuf>;
    let response: axum::response::Response;

    {
        let mut rooms = state.rooms.lock().unwrap();
        if let Some(room) = rooms.get_mut(&code) {
            if let Some(pos) = room.files.iter().position(|f| f.id == file_id) {
                let file = room.files.remove(pos);
                if !file.filename.contains(':') && !file.filename.starts_with('/') && !file.filename.starts_with('\\') {
                    to_delete = Some(state.upload_dir.join(&file.filename));
                } else {
                    to_delete = None;
                }
                room.last_activity = now_millis();
                response = (
                    StatusCode::OK,
                    Json(serde_json::json!({
                        "success": true,
                        "message": "File deleted successfully",
                        "room": room.to_response()
                    })),
                ).into_response();
            } else {
                to_delete = None;
                response = (
                    StatusCode::NOT_FOUND,
                    Json(serde_json::json!({"error": "File not found"})),
                ).into_response();
            }
        } else {
            to_delete = None;
            response = (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "Room not found"})),
            ).into_response();
        }
    }

    if let Some(path) = to_delete {
        tokio::task::spawn_blocking(move || {
            let _ = secure_delete_file(path);
        });
    }

    response
}

pub async fn spa_fallback(State(state): State<AppState>) -> impl IntoResponse {
    let index_path = state.frontend_path.join("index.html");
    match fs::read_to_string(&index_path) {
        Ok(html) => Html(html).into_response(),
        Err(_) => (StatusCode::NOT_FOUND, "Frontend not found").into_response(),
    }
}

pub fn spawn_cleanup_task(rooms: RoomStore, upload_dir: PathBuf) {
    tauri::async_runtime::spawn(async move {
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
                            let _ = secure_delete_file(path);
                        }
                    }
                    room.files.clear();
                    room.last_activity = now;
                }
            }
        }
    });
}

pub async fn view_local_file(
    Query(params): Query<HashMap<String, String>>,
    req: axum::extract::Request,
) -> impl IntoResponse {
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

pub async fn start_server_internal(frontend_dist_path: String) {
    let upload_dir = std::env::temp_dir().join("wi-share-files");
    let _ = fs::create_dir_all(&upload_dir);

    let frontend_path = PathBuf::from(&frontend_dist_path);

    let rooms = ROOMS
        .get_or_init(|| std::sync::Arc::new(std::sync::Mutex::new(HashMap::new())))
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
        .route("/api/rooms/{code}/download-zip", get(download_zip))
        .route("/api/rooms/{code}", delete(delete_room))
        .route("/api/view-file", get(view_local_file));

    // Static file serving + SPA fallback
    let serve_dir = tower_http::services::ServeDir::new(&frontend_path)
        .fallback(get(spa_fallback).with_state(state.clone()));

    let app = api
        .fallback_service(serve_dir)
        .layer(cors)
        .layer(DefaultBodyLimit::disable())
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
