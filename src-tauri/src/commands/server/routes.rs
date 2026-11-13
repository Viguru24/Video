use axum::{
    body::Bytes,
    extract::{ConnectInfo, DefaultBodyLimit, Multipart, Path as AxumPath, Query, Request, State},
    http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{Html, IntoResponse, Json, Response},
    routing::{delete, get, post},
    Router,
};
use std::{collections::HashMap, fs, net::{IpAddr, SocketAddr}, path::PathBuf};
use tower_http::cors::{AllowOrigin, CorsLayer};

use super::cleanup::secure_delete_file;
use super::network::{generate_qr_data_url, get_local_ip, urlencoding_name};
use super::types::{
    constant_time_token_eq, get_or_init_wifi_token, now_millis, AppState, FileItem,
    FileItemResponse, Room, RoomStore, ROOMS,
};

fn is_private_or_loopback_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_loopback() || v4.is_private() || v4.is_link_local(),
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unique_local()
                || v6
                    .to_ipv4_mapped()
                    .map(|v4| v4.is_loopback() || v4.is_private() || v4.is_link_local())
                    .unwrap_or(false)
        }
    }
}

fn is_allowed_cors_origin(origin: &str) -> bool {
    let lower = origin.trim().to_ascii_lowercase();
    if lower == "tauri://localhost"
        || lower == "http://tauri.localhost"
        || lower == "https://tauri.localhost"
    {
        return true;
    }
    let Some(without_scheme) = lower
        .strip_prefix("http://")
        .or_else(|| lower.strip_prefix("https://"))
    else {
        return false;
    };
    let host_port = without_scheme.split('/').next().unwrap_or("");
    let host = if host_port.starts_with('[') {
        host_port.split(']').next().unwrap_or("").trim_start_matches('[')
    } else {
        host_port.split(':').next().unwrap_or("")
    };
    if host == "localhost" {
        return true;
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        return is_private_or_loopback_ip(ip);
    }
    false
}

async fn require_lan_client(req: Request, next: Next) -> Response {
    if let Some(ConnectInfo(addr)) = req.extensions().get::<ConnectInfo<SocketAddr>>() {
        if !is_private_or_loopback_ip(addr.ip()) {
            return (
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({ "error": "Access restricted to local network devices" })),
            )
                .into_response();
        }
    }
    next.run(req).await
}

async fn require_room_auth(State(state): State<AppState>, req: Request, next: Next) -> Response {
    if req.method() == Method::OPTIONS {
        return next.run(req).await;
    }
    let header_token = req
        .headers()
        .get("x-cosmo-token")
        .and_then(|v| v.to_str().ok());
    let query_token = req.uri().query().and_then(|q| {
        q.split('&').find_map(|pair| {
            let (k, v) = pair.split_once('=')?;
            if k == "token" {
                Some(v)
            } else {
                None
            }
        })
    });
    if !constant_time_token_eq(&state.auth_token, header_token.or(query_token)) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Unauthorized: invalid or missing pairing token" })),
        )
            .into_response();
    }
    next.run(req).await
}

pub async fn create_room(State(state): State<AppState>) -> Json<serde_json::Value> {
    let mut rooms = state.rooms.lock().unwrap_or_else(|e| e.into_inner());
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
    let share_url = format!("http://{}:48273/?token={}", local_ip, state.auth_token);
    let qr_data_url = generate_qr_data_url(&share_url);

    Json(serde_json::json!({
        "success": true,
        "code": code,
        "token": state.auth_token,
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
    let mut rooms = state.rooms.lock().unwrap_or_else(|e| e.into_inner());
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
    if now_millis().saturating_sub(room.receiver_last_seen) > 12000 {
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
    let mut rooms = state.rooms.lock().unwrap_or_else(|e| e.into_inner());
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
        let mut rooms = state.rooms.lock().unwrap_or_else(|e| e.into_inner());
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

    let mut rooms = state.rooms.lock().unwrap_or_else(|e| e.into_inner());
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
    req: Request,
) -> impl IntoResponse {
    let (file_path, file_name, mime_type) = {
        let mut rooms = state.rooms.lock().unwrap_or_else(|e| e.into_inner());
        let Some(room) = rooms.get_mut(&code) else {
            return (StatusCode::NOT_FOUND, HeaderMap::new(), Bytes::new()).into_response();
        };

        let Some(file) = room.files.iter().find(|f| f.id == file_id) else {
            return (StatusCode::NOT_FOUND, HeaderMap::new(), Bytes::new()).into_response();
        };

        let file_path = if file.filename.contains(':') || file.filename.starts_with('/') || file.filename.starts_with('\\') {
            PathBuf::from(&file.filename)
        } else {
            state.upload_dir.join(&file.filename)
        };
        room.last_activity = now_millis();
        (file_path, file.name.clone(), file.mime_type.clone())
    };

    if !file_path.is_file() {
        return (StatusCode::NOT_FOUND, HeaderMap::new(), Bytes::new()).into_response();
    }

    use tower::util::ServiceExt;
    let service = tower_http::services::ServeFile::new(&file_path);
    match service.oneshot(req).await {
        Ok(mut res) => {
            let encoded_name = urlencoding_name(&file_name);
            if let Ok(cd) = HeaderValue::from_str(&format!("attachment; filename=\"{}\"", encoded_name)) {
                res.headers_mut().insert(header::CONTENT_DISPOSITION, cd);
            }
            if !res.headers().contains_key(header::CONTENT_TYPE) {
                if let Ok(ct) = HeaderValue::from_str(&mime_type) {
                    res.headers_mut().insert(header::CONTENT_TYPE, ct);
                }
            }
            res.into_response()
        }
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn download_zip(
    State(state): State<AppState>,
    AxumPath(code): AxumPath<String>,
) -> impl IntoResponse {
    let pc_files: Vec<(String, PathBuf)> = {
        let rooms = state.rooms.lock().unwrap_or_else(|e| e.into_inner());
        let Some(room) = rooms.get(&code) else {
            return (StatusCode::NOT_FOUND, HeaderMap::new(), Bytes::new()).into_response();
        };

        room.files
            .iter()
            .filter(|f| f.filename.contains(':') || f.filename.starts_with('/') || f.filename.starts_with('\\'))
            .map(|f| (f.name.clone(), PathBuf::from(&f.filename)))
            .collect()
    };

    if pc_files.is_empty() {
        return (StatusCode::NOT_FOUND, HeaderMap::new(), Bytes::new()).into_response();
    }

    const MAX_ZIP_INPUT_BYTES: u64 = 2 * 1024 * 1024 * 1024; // 2 GiB cap
    let zip_result = tokio::task::spawn_blocking(move || -> Result<Vec<u8>, StatusCode> {
        let mut total_bytes = 0u64;
        for (_, path) in &pc_files {
            if let Ok(meta) = fs::metadata(path) {
                total_bytes = total_bytes.saturating_add(meta.len());
                if total_bytes > MAX_ZIP_INPUT_BYTES {
                    return Err(StatusCode::PAYLOAD_TOO_LARGE);
                }
            }
        }

        let mut buf = std::io::Cursor::new(Vec::<u8>::new());
        {
            let mut zip = zip::ZipWriter::new(&mut buf);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated)
                .compression_level(Some(3));

            for (name, path) in &pc_files {
                if let Ok(mut f) = fs::File::open(path) {
                    if zip.start_file(name, options).is_ok() {
                        let _ = std::io::copy(&mut f, &mut zip);
                    }
                }
            }
            let _ = zip.finish();
        }
        Ok(buf.into_inner())
    })
    .await;

    let zip_bytes = match zip_result {
        Ok(Ok(bytes)) => bytes,
        Ok(Err(status)) => return (status, "Selection exceeds 2 GiB ZIP archive limit; download files individually.").into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

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
    let removed = {
        let mut rooms = state.rooms.lock().unwrap_or_else(|e| e.into_inner());
        rooms.remove(&code)
    };
    if let Some(room) = removed {
        let to_delete: Vec<PathBuf> = room
            .files
            .iter()
            .filter(|file| !file.filename.contains(':') && !file.filename.starts_with('/') && !file.filename.starts_with('\\'))
            .map(|file| state.upload_dir.join(&file.filename))
            .collect();
        if !to_delete.is_empty() {
            tokio::task::spawn_blocking(move || {
                for path in to_delete {
                    let _ = secure_delete_file(path);
                }
            });
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
        let mut rooms = state.rooms.lock().unwrap_or_else(|e| e.into_inner());
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
    match tokio::fs::read_to_string(&index_path).await {
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

            let to_delete: Vec<PathBuf> = {
                let mut store = rooms.lock().unwrap_or_else(|e| e.into_inner());
                let mut paths = Vec::new();
                if let Some(room) = store.get_mut("local") {
                    if now.saturating_sub(room.last_activity) > max_inactivity && !room.files.is_empty() {
                        println!("[CleanUp] Room local timed out due to inactivity. Clearing files...");
                        for file in &room.files {
                            if !file.filename.contains(':') && !file.filename.starts_with('/') && !file.filename.starts_with('\\') {
                                paths.push(upload_dir.join(&file.filename));
                            }
                        }
                        room.files.clear();
                        room.last_activity = now;
                    }
                }
                paths
            };
            if !to_delete.is_empty() {
                let _ = tokio::task::spawn_blocking(move || {
                    for path in to_delete {
                        let _ = secure_delete_file(path);
                    }
                })
                .await;
            }
        }
    });
}

pub async fn health_check() -> impl IntoResponse {
    let local_ip = get_local_ip();
    (
        StatusCode::OK,
        Json(serde_json::json!({
            "status": "ok",
            "service": "cosmo-symphony-wifi-share",
            "port": 48273,
            "localIp": local_ip,
            "timestamp": now_millis()
        }))
    )
}

pub async fn download_apk_direct(
    State(state): State<AppState>,
    req: axum::extract::Request,
) -> impl IntoResponse {
    let apk_path = state.frontend_path.join("CosmoShare.apk");
    let fallback_path = state.frontend_path.join("CosmoSymphonyCompanion.apk");
    let path_to_use = if apk_path.is_file() {
        apk_path
    } else if fallback_path.is_file() {
        fallback_path
    } else {
        return (StatusCode::NOT_FOUND, "Companion APK not found on server").into_response();
    };

    use tower::util::ServiceExt;
    let service = tower_http::services::ServeFile::new(&path_to_use);
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
        auth_token: get_or_init_wifi_token(),
    };

    // Spawn background room cleanup
    spawn_cleanup_task(state.rooms.clone(), upload_dir);

    // CORS — strictly allow Tauri desktop and private LAN origins only
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(|origin: &HeaderValue, _| {
            origin.to_str().map(is_allowed_cors_origin).unwrap_or(false)
        }))
        .allow_methods([Method::GET, Method::POST, Method::DELETE, Method::OPTIONS])
        .allow_headers([
            header::CONTENT_TYPE,
            header::RANGE,
            HeaderName::from_static("x-cosmo-token"),
        ]);

    // Authenticated Wi-Fi room routes
    let room_routes = Router::new()
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
        .layer(middleware::from_fn_with_state(state.clone(), require_room_auth));

    // Public LAN discovery / pairing UI routes
    let public_routes = Router::new()
        .route("/api/health", get(health_check))
        .route("/CosmoShare.apk", get(download_apk_direct))
        .route("/CosmoSymphonyCompanion.apk", get(download_apk_direct));

    // Static file serving + SPA fallback
    let serve_dir = tower_http::services::ServeDir::new(&frontend_path)
        .fallback(get(spa_fallback).with_state(state.clone()));

    let max_upload_bytes = usize::try_from(8u64 * 1024 * 1024 * 1024).unwrap_or(2 * 1024 * 1024 * 1024);

    let app = public_routes
        .merge(room_routes)
        .fallback_service(serve_dir)
        .layer(middleware::from_fn(require_lan_client))
        .layer(cors)
        .layer(DefaultBodyLimit::max(max_upload_bytes))
        .with_state(state);

    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], 48273));
    println!("[Wi-Fi Share Server] Attempting to bind http://0.0.0.0:48273...");

    let mut listener = None;
    for attempt in 1..=20 {
        match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => {
                println!("[Wi-Fi Share Server] Running on http://0.0.0.0:48273 (bound on attempt {})", attempt);
                listener = Some(l);
                break;
            }
            Err(e) => {
                if attempt == 20 {
                    eprintln!("[Wi-Fi Share Server] FATAL: Bind failed after 20 attempts: {}", e);
                    return;
                }
                tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
            }
        }
    }

    let listener = match listener {
        Some(l) => l,
        None => return,
    };

    if let Err(e) = axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    {
        eprintln!("[Wi-Fi Share Server] Server error: {}", e);
    }
}
