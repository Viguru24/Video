use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, Window};

static POPOUT_URLS: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<String, String>>> = std::sync::OnceLock::new();

pub fn get_popout_urls_map() -> &'static std::sync::Mutex<std::collections::HashMap<String, String>> {
    POPOUT_URLS.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
}

#[tauri::command]
pub async fn set_always_on_top(app: AppHandle, flag: bool) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(flag);
    }
}

#[tauri::command]
pub async fn pop_out(app: AppHandle, url: String, title: String) -> Result<(), String> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let label = format!("pop-{}", timestamp);

    if let Ok(mut map) = get_popout_urls_map().lock() {
        map.insert(label.clone(), url.clone());
    }

    println!("Creating dynamic pop-out window with label: {} for URL: {}", label, url);
    let query = format!("index.html?popout=true&url={}&title={}", 
        urlencoding::encode(&url),
        urlencoding::encode(&title)
    );
    let mut parsed_url = WebviewUrl::App(query.clone().into());
    
    if let Some(main_win) = app.get_webview_window("main") {
        if let Ok(main_url) = main_win.url() {
            let scheme = main_url.scheme();
            let host = main_url.host_str().unwrap_or("");
            let port = main_url.port();
            
            if (scheme == "http" || scheme == "https") 
               && (host == "localhost" || host == "127.0.0.1") 
               && port.is_some() 
            {
                if let Ok(popout_url) = main_url.join(&query) {
                    println!("Development server detected, loading popout from: {}", popout_url);
                    parsed_url = WebviewUrl::External(popout_url);
                }
            }
        }
    }
    
    let win_builder = WebviewWindowBuilder::new(&app, &label, parsed_url)
        .title(&title)
        .inner_size(1280.0, 720.0)
        .resizable(true)
        .decorations(false)
        .maximized(false)
        .fullscreen(false);

    match win_builder.build() {
        Ok(window) => {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
            println!("Successfully created same-process pop-out window: {}", label);
            Ok(())
        }
        Err(e) => {
            eprintln!("Failed to create popout window: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn close_popout(window: tauri::Window) {
    let label = window.label().to_string();
    if let Ok(mut map) = get_popout_urls_map().lock() {
        map.remove(&label);
    }
    let _ = window.destroy();
}

#[tauri::command]
pub fn get_popout_url(window: tauri::Window) -> Option<String> {
    let label = window.label();
    if let Ok(map) = get_popout_urls_map().lock() {
        if let Some(url) = map.get(label) {
            return Some(url.clone());
        }
    }
    crate::POPOUT_MEDIA_URL.get().cloned()
}

#[tauri::command]
pub async fn span_all_monitors(window: Window) -> Result<(), String> {
    println!("--- span_all_monitors triggered ---");
    let monitors = window.available_monitors().map_err(|e| {
        println!("Error getting available monitors: {}", e);
        e.to_string()
    })?;
    println!("Found {} monitors", monitors.len());
    for (i, m) in monitors.iter().enumerate() {
        println!("  Monitor [{}]: Name={:?}, Position={:?}, Size={:?}, ScaleFactor={}", i, m.name(), m.position(), m.size(), m.scale_factor());
    }

    if monitors.is_empty() {
        return Err("No monitors found".into());
    }

    let mut min_x = i32::MAX;
    let mut min_y = i32::MAX;
    let mut max_x = i32::MIN;
    let mut max_y = i32::MIN;

    for m in &monitors {
        let pos = m.position();
        let size = m.size();
        let x1 = pos.x;
        let y1 = pos.y;
        let x2 = pos.x + size.width as i32;
        let y2 = pos.y + size.height as i32;

        if x1 < min_x { min_x = x1; }
        if y1 < min_y { min_y = y1; }
        if x2 > max_x { max_x = x2; }
        if y2 > max_y { max_y = y2; }
    }

    let width = (max_x - min_x) as u32;
    let height = (max_y - min_y) as u32;
    println!("Calculated Spanning Area: x={}, y={}, width={}, height={}", min_x, min_y, width, height);

    let _ = window.unmaximize();
    std::thread::sleep(std::time::Duration::from_millis(150));

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::{SetWindowPos, SWP_NOZORDER, SWP_NOACTIVATE, SWP_FRAMECHANGED};
        use windows::Win32::Foundation::HWND;

        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        let hwnd = HWND(hwnd.0 as *mut std::ffi::c_void);
        unsafe {
            SetWindowPos(
                hwnd,
                None,
                min_x,
                min_y,
                width as i32,
                height as i32,
                SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
            ).map_err(|e| e.to_string())?;
        }
        println!("--- span_all_monitors complete (Win32 SetWindowPos) ---");
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = window.set_decorations(false);
        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x: min_x, y: min_y }));
        let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize { width, height }));
        println!("--- span_all_monitors complete (fallback) ---");
    }

    Ok(())
}

#[tauri::command]
pub async fn unspan_monitors(window: Window) -> Result<(), String> {
    println!("--- unspan_monitors triggered ---");
    if let Err(e) = window.set_decorations(false) {
        println!("  set_decorations error: {}", e);
    }
    if let Err(e) = window.set_size(tauri::Size::Physical(tauri::PhysicalSize { width: 1280, height: 720 })) {
        println!("  set_size error: {}", e);
    }
    if let Err(e) = window.center() {
        println!("  center error: {}", e);
    }
    println!("--- unspan_monitors complete ---");
    Ok(())
}
