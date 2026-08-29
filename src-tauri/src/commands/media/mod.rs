pub mod utils;
pub mod convert;
pub mod transform;
pub mod upscale;

use tauri::AppHandle;
use serde_json::Value;

// --- UTILS COMMANDS ---

#[tauri::command]
pub fn get_drag_icon_path() -> Result<String, String> {
    utils::get_drag_icon_path()
}

// --- CONVERT COMMANDS ---

#[tauri::command]
pub async fn convert_media_to_standard(app: AppHandle, src_path: String, media_type: String) -> Result<String, String> {
    convert::convert_media_to_standard(app, src_path, media_type).await
}

#[tauri::command]
pub async fn convert_heic_to_jpg(app: AppHandle, src_path: String) -> Result<String, String> {
    convert::convert_heic_to_jpg(app, src_path).await
}

#[tauri::command]
pub async fn snapshot_video_frame(
    app: AppHandle,
    real_path: String,
    timestamp_secs: f64,
    file_name: String,
    custom_dir: Option<String>,
) -> Result<String, String> {
    convert::snapshot_video_frame(app, real_path, timestamp_secs, file_name, custom_dir).await
}

#[tauri::command]
pub fn save_snapshot(
    base64_data: String,
    file_name: String,
    custom_dir: Option<String>,
) -> Result<String, String> {
    convert::save_snapshot(base64_data, file_name, custom_dir)
}

#[tauri::command]
pub async fn get_video_metadata(app: AppHandle, path: String) -> Result<Value, String> {
    convert::get_video_metadata(app, path).await
}

#[tauri::command]
pub async fn get_media_dimensions(app: AppHandle, path: String) -> Result<(u32, u32), String> {
    convert::get_media_dimensions(app, path).await
}

// --- TRANSFORM COMMANDS ---

#[tauri::command]
pub async fn rotate_media_on_disk(app: AppHandle, path: String, rotation: i32, is_image: bool) -> Result<String, String> {
    transform::rotate_media_on_disk(app, path, rotation, is_image).await
}

#[tauri::command]
pub async fn mirror_media_on_disk(app: AppHandle, path: String, is_image: bool) -> Result<String, String> {
    transform::mirror_media_on_disk(app, path, is_image).await
}

#[tauri::command]
pub async fn apply_color_adjustments_on_disk(
    app: AppHandle,
    path: String,
    brightness: f32,
    contrast: f32,
    saturation: f32,
    hue: f32,
    gamma: f32,
    final_r: f32,
    final_g: f32,
    final_b: f32,
    alpha: f32,
    negative: bool,
    is_image: bool,
    save_as_copy: bool,
) -> Result<String, String> {
    transform::apply_color_adjustments_on_disk(
        app, path, brightness, contrast, saturation, hue, gamma, final_r, final_g, final_b, alpha, negative, is_image, save_as_copy
    ).await
}

#[tauri::command]
pub async fn save_adjusted_image_bytes(
    path: String,
    base64_data: String,
    save_as_copy: bool,
) -> Result<String, String> {
    transform::save_adjusted_image_bytes(path, base64_data, save_as_copy).await
}

#[tauri::command]
pub async fn crop_image_on_disk(
    app: AppHandle,
    path: String,
    crop_x: f64,
    crop_y: f64,
    crop_w: f64,
    crop_h: f64,
    img_w: f64,
    img_h: f64,
    overwrite: bool,
) -> Result<String, String> {
    transform::crop_image_on_disk(app, path, crop_x, crop_y, crop_w, crop_h, img_w, img_h, overwrite).await
}

#[tauri::command]
pub async fn resize_image_on_disk(
    app: AppHandle,
    path: String,
    width: u32,
    height: u32,
    overwrite: bool,
) -> Result<String, String> {
    transform::resize_image_on_disk(app, path, width, height, overwrite).await
}

#[tauri::command]
pub async fn generate_store_logos(app: AppHandle, path: String, bg_color: String) -> Result<String, String> {
    transform::generate_store_logos(app, path, bg_color).await
}

#[tauri::command]
pub async fn trim_crop_video(
    app: AppHandle,
    path: String,
    start_sec: Option<f64>,
    end_sec: Option<f64>,
    crop_x: Option<f64>,
    crop_y: Option<f64>,
    crop_w: Option<f64>,
    crop_h: Option<f64>,
    overwrite: Option<bool>,
    lossless: Option<bool>,
) -> Result<String, String> {
    transform::trim_crop_video(app, path, start_sec, end_sec, crop_x, crop_y, crop_w, crop_h, overwrite, lossless).await
}

// --- UPSCALE COMMANDS ---

#[tauri::command]
pub async fn save_persistence(app: AppHandle, key: String, data: String) {
    upscale::save_persistence(app, key, data).await
}

#[tauri::command]
pub async fn load_persistence(app: AppHandle, key: String) -> Option<String> {
    upscale::load_persistence(app, key).await
}

#[tauri::command]
pub async fn extract_subject_on_disk(app: AppHandle, path: String) -> Result<String, String> {
    upscale::extract_subject_on_disk(app, path).await
}

#[tauri::command]
pub async fn upscale_image(app: AppHandle, path: String, overwrite: bool) -> Result<String, String> {
    upscale::upscale_image(app, path, overwrite).await
}

#[tauri::command]
pub fn cancel_video_upscale() {
    upscale::cancel_video_upscale()
}

#[tauri::command]
pub async fn upscale_video(app: AppHandle, path: String, overwrite: bool) -> Result<String, String> {
    upscale::upscale_video(app, path, overwrite).await
}

#[tauri::command]
pub fn enhance_image_crop(app: AppHandle, base64_data: String) -> Result<String, String> {
    upscale::enhance_image_crop(app, base64_data)
}

#[tauri::command]
pub async fn detect_person_crop(app: AppHandle, path: String) -> Result<upscale::AutoCropBox, String> {
    upscale::detect_person_crop(app, path).await
}
