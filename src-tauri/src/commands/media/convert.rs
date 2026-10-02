use std::fs;
use std::path::{Path, PathBuf};
use std::io::Read;
use serde_json::Value;
use tauri::{AppHandle, Manager};

use base64::{engine::general_purpose, Engine as _};
use crate::commands::filesystem::clean_local_path;
use crate::commands::system::resolve_python_exe;
use super::utils::{
    debug_log, new_hidden_command, new_hidden_ffmpeg_command, new_hidden_ffprobe_command,
    safe_recycle_file,
};

const HEIC_CONVERT_SCRIPT: &str = r#"import sys, os
from PIL import Image, ImageOps
import pillow_heif

def main():
    if len(sys.argv) < 3:
        sys.exit(1)
    src_path = sys.argv[1]
    dest_path = sys.argv[2]
    
    pillow_heif.register_heif_opener()
    image = Image.open(src_path)
    try:
        image = ImageOps.exif_transpose(image)
    except Exception:
        pass

    ext = os.path.splitext(dest_path)[1].lower()
    exif_bytes = image.info.get("exif")

    if ext in [".jpg", ".jpeg"]:
        if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
            image = image.convert("RGB")
        if exif_bytes:
            image.save(dest_path, "JPEG", quality=95, exif=exif_bytes)
        else:
            image.save(dest_path, "JPEG", quality=95)
    else:
        if exif_bytes:
            image.save(dest_path, "PNG", exif=exif_bytes)
        else:
            image.save(dest_path, "PNG")
    print(f"SUCCESS: Converted {src_path} to {dest_path}")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
"#;

fn resolve_heic_script_path() -> PathBuf {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));
    
    let paths = vec![
        exe_dir.as_ref().map(|d| d.join("convert_heic.py")),
        std::env::current_dir().ok().map(|d| d.join("convert_heic.py")),
        std::env::current_dir().ok().map(|d| d.join("src-tauri").join("convert_heic.py")),
    ];

    for path in paths.into_iter().flatten() {
        if path.exists() {
            return path;
        }
    }

    // Always ensure an embedded copy exists in temp_dir if not found in parent dirs (crucial for MSIX packages)
    let temp_script = std::env::temp_dir().join("cosmo_convert_heic.py");
    let _ = fs::write(&temp_script, HEIC_CONVERT_SCRIPT);
    temp_script
}

fn convert_heic_pillow(src_path: &str, dest_path: &str) -> Result<(), String> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let script_path = resolve_heic_script_path();

    let mut candidates = Vec::new();
    candidates.push(resolve_python_exe());

    if let Ok(cur_dir) = std::env::current_dir() {
        candidates.push(cur_dir.join(".cosmo_cpu_venv").join("Scripts").join("python.exe"));
    }
    candidates.push(PathBuf::from(r"C:\Program Files\Python312\python.exe"));
    candidates.push(PathBuf::from(r"C:\Program Files\Python311\python.exe"));
    candidates.push(PathBuf::from("python"));

    let mut last_err = String::new();
    for py in candidates {
        let is_plain = py.to_string_lossy() == "python";
        if !is_plain && !py.exists() {
            continue;
        }

        debug_log(&format!("Running HEIC conversion via python candidate: {:?} {:?} {:?} {:?}", py, script_path, src_path, dest_path));

        let mut cmd = new_hidden_command(&py);
        cmd.args([&script_path.to_string_lossy().to_string(), src_path, dest_path]);
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        match cmd.output() {
            Ok(out) => {
                if out.status.success() {
                    return Ok(());
                } else {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    let stdout = String::from_utf8_lossy(&out.stdout);
                    last_err = format!("Candidate {:?} failed:\nStderr: {}\nStdout: {}", py, stderr, stdout);
                    debug_log(&last_err);
                }
            }
            Err(e) => {
                last_err = format!("Failed to spawn {:?}: {}", py, e);
                debug_log(&last_err);
            }
        }
    }

    Err(format!("Python HEIC conversion failed: {}", last_err))
}

pub async fn convert_media_to_standard(app: AppHandle, src_path: String, media_type: String) -> Result<String, String> {
    let src_path = clean_local_path(&src_path);
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let src = Path::new(&src_path);
        let is_video = media_type == "video";
        let target_ext = if is_video { "mp4" } else { "jpg" };
        let dest_path = src.with_extension(target_ext);
        let dest_str = dest_path.to_string_lossy().to_string();

        if is_video {
            let web_native_codecs = [
                "h264", "avc", "hevc", "h265", "vp8", "vp9", "av1", "av01",
                "aac", "mp3", "opus", "vorbis", "flac",
            ];

            let mut probe_cmd = new_hidden_ffprobe_command(Some(&app));
            probe_cmd.args([
                "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=codec_name",
                "-of", "default=noprint_wrappers=1:nokey=1",
                &src_path,
            ]);
            #[cfg(windows)]
            probe_cmd.creation_flags(CREATE_NO_WINDOW);

            let probe_out = probe_cmd.output();

            let source_codec = probe_out
                .ok()
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .map(|s| s.trim().to_lowercase())
                .unwrap_or_default();

            debug_log(&format!("convert_media: source video codec = '{}'", source_codec));

            let codec_is_web_native = web_native_codecs.iter().any(|c| source_codec.contains(c));

            if codec_is_web_native {
                let mut copy_cmd = new_hidden_ffmpeg_command(Some(&app));
                copy_cmd.args(["-y", "-i", &src_path, "-c", "copy", "-movflags", "+faststart", &dest_str]);
                #[cfg(windows)]
                copy_cmd.creation_flags(CREATE_NO_WINDOW);

                let copy_out = copy_cmd.output()
                    .map_err(|e| format!("Failed to spawn ffmpeg (copy): {}", e))?;

                if copy_out.status.success() {
                    debug_log(&format!("convert_media: stream-copy succeeded for {}", src_path));
                    if let Err(e) = safe_recycle_file(src, 5) {
                        debug_log(&format!("convert_media: failed to recycle original after stream-copy: {}", e));
                    }
                    return Ok(dest_str);
                }

                debug_log(&format!("convert_media: stream-copy failed, falling back to re-encode for {}", src_path));
            } else {
                debug_log(&format!("convert_media: codec '{}' not web-native, skipping stream-copy and re-encoding directly", source_codec));
            }

            let mut enc_cmd = new_hidden_ffmpeg_command(Some(&app));
            enc_cmd.args([
                "-y", "-i", &src_path,
                "-c:v", "libx264", "-crf", "18", "-preset", "fast",
                "-c:a", "aac", "-movflags", "+faststart",
                &dest_str,
            ]);
            #[cfg(windows)]
            enc_cmd.creation_flags(CREATE_NO_WINDOW);

            let enc_out = enc_cmd.output()
                .map_err(|e| format!("Failed to spawn ffmpeg (encode): {}", e))?;

            if !enc_out.status.success() {
                let stderr = String::from_utf8_lossy(&enc_out.stderr);
                return Err(format!("FFmpeg video conversion failed: {}", stderr));
            }
        } else {
            let is_heic = src_path.to_lowercase().ends_with(".heic") || src_path.to_lowercase().ends_with(".heif");
            if is_heic {
                // For HEIC/HEIF images, exclusively use pillow_heif.
                // FFmpeg does not support HEIC decoding on Windows.
                convert_heic_pillow(&src_path, &dest_str)
                    .map_err(|e| format!("{}. Original HEIC preserved.", e))?;
            } else {
                let mut img_cmd = new_hidden_ffmpeg_command(Some(&app));
                img_cmd.args(["-y", "-i", &src_path, "-q:v", "2", &dest_str]);
                #[cfg(windows)]
                img_cmd.creation_flags(CREATE_NO_WINDOW);

                let out = img_cmd.output()
                    .map_err(|e| format!("Failed to spawn ffmpeg (image): {}", e))?;

                if !out.status.success() {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    return Err(format!("FFmpeg image conversion failed: {}", stderr));
                }
            }

            let dest_meta = fs::metadata(&dest_str).map_err(|e| format!("Output file missing: {}", e))?;
            let min_bytes: u64 = if is_heic { 100 * 1024 } else { 1024 };
            if dest_meta.len() < min_bytes {
                let _ = fs::remove_file(&dest_str);
                return Err(format!(
                    "Conversion produced a suspiciously small file ({} bytes) — original preserved.",
                    dest_meta.len()
                ));
            }
            let mut header = [0u8; 2];
            fs::File::open(&dest_str)
                .and_then(|mut f| f.read_exact(&mut header))
                .map_err(|e| format!("Cannot read output header: {}", e))?;
            if header != [0xFF, 0xD8] {
                let _ = fs::remove_file(&dest_str);
                return Err("Output is not a valid JPEG — original preserved.".into());
            }
        }

        if let Err(e) = safe_recycle_file(src, 5) {
            debug_log(&format!("convert_media: failed to recycle original {}: {}", src_path, e));
        }

        Ok(dest_str)
    }).await.map_err(|e| e.to_string())?
}

pub async fn convert_heic_to_jpg(_app: AppHandle, src_path: String) -> Result<String, String> {
    let src_path = clean_local_path(&src_path);
    tauri::async_runtime::spawn_blocking(move || {
        let src = Path::new(&src_path);
        let dest_path = src.with_extension("jpg");
        let dest_str = dest_path.to_string_lossy().to_string();

        // Convert HEIC via Python/Pillow (pillow_heif).
        // FFmpeg on Windows does NOT support HEIC decoding and produces blank/corrupt frames.
        convert_heic_pillow(&src_path, &dest_str)
            .map_err(|e| format!("{}. Original HEIC preserved.", e))?;

        // Validate output — must be at least 100 KB and a valid JPEG
        let dest_meta = fs::metadata(&dest_str).map_err(|e| format!("Output file missing: {}", e))?;
        let min_bytes: u64 = 100 * 1024; // 100 KB
        if dest_meta.len() < min_bytes {
            let _ = fs::remove_file(&dest_str);
            return Err(format!(
                "Output is suspiciously small ({} bytes < {} KB minimum) — original HEIC preserved.",
                dest_meta.len(), min_bytes / 1024
            ));
        }
        let mut header = [0u8; 2];
        fs::File::open(&dest_str)
            .and_then(|mut f| f.read_exact(&mut header))
            .map_err(|e| format!("Cannot read output header: {}", e))?;
        if header != [0xFF, 0xD8] {
            let _ = fs::remove_file(&dest_str);
            return Err("Output is not a valid JPEG — original HEIC preserved.".into());
        }

        if let Err(e) = safe_recycle_file(src, 5) {
            debug_log(&format!("HEIC->JPG: could not recycle original {}: {}", src_path, e));
        }

        Ok(dest_str)
    }).await.map_err(|e| e.to_string())?
}

pub async fn snapshot_video_frame(
    app: AppHandle,
    real_path: String,
    timestamp_secs: f64,
    file_name: String,
    custom_dir: Option<String>,
) -> Result<String, String> {
    let real_path = clean_local_path(&real_path);
    let file_name = file_name.clone();
    let custom_dir = custom_dir.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let base_path = if let Some(ref d) = custom_dir {
            let custom = PathBuf::from(d);
            match fs::create_dir_all(&custom) {
                Ok(_) => custom,
                Err(e) => {
                    debug_log(&format!(
                        "snapshot_video_frame: custom dir '{}' unavailable ({}), falling back to Pictures/Cosmo_Snapshots",
                        d, e
                    ));
                    let fallback = dirs::picture_dir()
                        .ok_or_else(|| format!("Snapshot dir '{}' not accessible and no fallback Pictures dir: {}", d, e))?
                        .join("Cosmo_Snapshots");
                    fs::create_dir_all(&fallback)
                        .map_err(|e2| format!("Could not create snapshot directory '{}': {}", fallback.display(), e2))?;
                    fallback
                }
            }
        } else {
            let default_dir = dirs::picture_dir()
                .ok_or("No Pictures directory found")?
                .join("Cosmo_Snapshots");
            fs::create_dir_all(&default_dir)
                .map_err(|e| format!("Could not create snapshot directory '{}': {}", default_dir.display(), e))?;
            default_dir
        };
        let out_path = base_path.join(&file_name);

        let total_secs = timestamp_secs as u64;
        let millis = ((timestamp_secs - total_secs as f64) * 1000.0) as u64;
        let hh = total_secs / 3600;
        let mm = (total_secs % 3600) / 60;
        let ss = total_secs % 60;
        let ts_str = format!("{:02}:{:02}:{:02}.{:03}", hh, mm, ss, millis);

        let mut snap_cmd = new_hidden_ffmpeg_command(Some(&app));
        snap_cmd.args([
            "-y",
            "-ss", &ts_str,
            "-i", &real_path,
            "-frames:v", "1",
            "-update", "1",
            "-q:v", "1",
            "-vf", "scale=iw:ih",
            out_path.to_str().ok_or("Bad output path")?,
        ]);

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            snap_cmd.creation_flags(0x08000000);
        }

        let output = snap_cmd.output()
            .map_err(|e| format!("Failed to spawn ffmpeg: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("FFmpeg failed: {}", stderr));
        }

        if !out_path.exists() {
            return Err("FFmpeg ran but output frame was not created".to_string());
        }

        Ok(out_path.to_string_lossy().to_string())
    }).await.map_err(|e| e.to_string())?
}

pub fn save_snapshot(
    base64_data: String,
    file_name: String,
    custom_dir: Option<String>,
) -> Result<String, String> {
    let data = if base64_data.contains(',') {
        base64_data.split(',').nth(1).ok_or("Invalid base64")?
    } else {
        &base64_data
    };
    let bytes = general_purpose::STANDARD
        .decode(data)
        .map_err(|e| e.to_string())?;

    let base_path = if let Some(d) = custom_dir {
        PathBuf::from(d)
    } else {
        dirs::picture_dir()
            .ok_or("No picture dir")?
            .join("Cosmo_Snapshots")
    };

    let _ = fs::create_dir_all(&base_path);
    let full_path = base_path.join(file_name);
    fs::write(&full_path, bytes).map_err(|e| e.to_string())?;
    Ok(full_path.to_string_lossy().to_string())
}

pub async fn get_video_metadata(app: AppHandle, path: String) -> Result<Value, String> {
    let clean_path = clean_local_path(&path);

    let p = PathBuf::from(&clean_path);
    if !p.exists() {
        return Err("File not found".into());
    }

    let metadata = fs::metadata(&p).map_err(|e| e.to_string())?;
    let bytes = metadata.len() as f64;
    
    let size_formatted = if bytes < 1024.0 * 1024.0 {
        format!("{:.1} KB", bytes / 1024.0)
    } else {
        format!("{:.2} MB", bytes / 1024.0 / 1024.0)
    };

    let extension = p.extension()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_uppercase();

    let mut upscaled_by = None;
    if let Ok(app_data) = app.path().app_data_dir() {
        let history_file = app_data.join("upscale_history.json");
        if let Ok(s) = fs::read_to_string(&history_file) {
            if let Ok(history) = serde_json::from_str::<serde_json::Map<String, Value>>(&s) {
                let norm_clean = clean_path.replace("/", "\\");
                if let Some(desc) = history.get(&clean_path).or_else(|| history.get(&norm_clean)) {
                    upscaled_by = desc.as_str().map(|s| s.to_string());
                } else if let Ok(abs_path) = fs::canonicalize(&p) {
                    let abs_str = abs_path.to_string_lossy().to_string();
                    if let Some(desc) = history.get(&abs_str) {
                        upscaled_by = desc.as_str().map(|s| s.to_string());
                    }
                }
            }
        }
    }

    if upscaled_by.is_none() {
        let file_name = p.file_name().and_then(|s| s.to_str()).unwrap_or("");
        if file_name.contains("_upscaled") {
            upscaled_by = Some("Unknown Model (Pre-existing upscale)".to_string());
        }
    }

    let created_time = if let Ok(created) = metadata.created() {
        let datetime: chrono::DateTime<chrono::Local> = created.into();
        datetime.format("%Y-%m-%d %H:%M:%S").to_string()
    } else {
        "Unknown".to_string()
    };

    let mut probe_cmd = new_hidden_ffprobe_command(Some(&app));
    probe_cmd
        .args(["-v", "error", "-select_streams", "v:0",
               "-show_entries", "stream=width,height:format=duration",
               "-of", "json", &clean_path]);
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        probe_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    
    let mut w = 0;
    let mut h = 0;
    let mut duration_sec = None;

    if let Ok(out) = probe_cmd.output() {
        let s = String::from_utf8_lossy(&out.stdout);
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&s) {
            if let Some(streams) = parsed.get("streams").and_then(|v| v.as_array()) {
                if let Some(first_stream) = streams.first() {
                    w = first_stream.get("width").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                    h = first_stream.get("height").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                }
            }
            if let Some(format) = parsed.get("format") {
                if let Some(dur_str) = format.get("duration").and_then(|v| v.as_str()) {
                    duration_sec = dur_str.parse::<f64>().ok();
                } else if let Some(dur_num) = format.get("duration").and_then(|v| v.as_f64()) {
                    duration_sec = Some(dur_num);
                }
            }
        }
    }

    Ok(serde_json::json!({
        "size": size_formatted,
        "format": extension,
        "path": path,
        "name": p.file_name().and_then(|s| s.to_str()).unwrap_or("Unknown"),
        "upscaled_by": upscaled_by,
        "created": created_time,
        "width": w,
        "height": h,
        "duration": duration_sec
    }))
}

fn parse_tiff_orientation(data: &[u8]) -> Option<u32> {
    if data.len() < 8 {
        return None;
    }
    let is_le = if &data[0..2] == b"II" {
        true
    } else if &data[0..2] == b"MM" {
        false
    } else {
        return None;
    };

    let read_u16 = |d: &[u8], offset: usize| -> Option<u16> {
        if offset + 2 <= d.len() {
            if is_le {
                Some(u16::from_le_bytes([d[offset], d[offset + 1]]))
            } else {
                Some(u16::from_be_bytes([d[offset], d[offset + 1]]))
            }
        } else {
            None
        }
    };

    let read_u32 = |d: &[u8], offset: usize| -> Option<u32> {
        if offset + 4 <= d.len() {
            if is_le {
                Some(u32::from_le_bytes([d[offset], d[offset + 1], d[offset + 2], d[offset + 3]]))
            } else {
                Some(u32::from_be_bytes([d[offset], d[offset + 1], d[offset + 2], d[offset + 3]]))
            }
        } else {
            None
        }
    };

    let magic = read_u16(data, 2)?;
    if magic != 42 {
        return None;
    }

    let ifd0_offset = read_u32(data, 4)? as usize;
    if ifd0_offset + 2 > data.len() {
        return None;
    }

    let num_entries = read_u16(data, ifd0_offset)? as usize;
    let entries_start = ifd0_offset + 2;

    for i in 0..num_entries {
        let entry_offset = entries_start + i * 12;
        if entry_offset + 12 > data.len() {
            break;
        }
        let tag = read_u16(data, entry_offset)?;
        if tag == 0x0112 {
            // Orientation tag (format is usually SHORT = 3)
            let val = read_u16(data, entry_offset + 8)?;
            return Some(val as u32);
        }
    }
    None
}

pub fn read_image_exif_orientation(path: &Path) -> Option<u32> {
    use std::io::Read;
    let mut file = fs::File::open(path).ok()?;
    let mut buffer = vec![0u8; 65536];
    let bytes_read = file.read(&mut buffer).ok()?;
    let data = &buffer[..bytes_read];

    if data.len() < 4 {
        return None;
    }

    // 1. JPEG
    if data[0] == 0xFF && data[1] == 0xD8 {
        let mut pos = 2;
        while pos + 4 <= data.len() {
            if data[pos] != 0xFF {
                pos += 1;
                continue;
            }
            let marker = data[pos + 1];
            if marker == 0xDA || marker == 0xD9 {
                break;
            }
            let length = u16::from_be_bytes([data[pos + 2], data[pos + 3]]) as usize;
            if marker == 0xE1 && length >= 8 && pos + 4 + length <= data.len() {
                let payload = &data[pos + 4..pos + 2 + length];
                if payload.starts_with(b"Exif\0\0") {
                    return parse_tiff_orientation(&payload[6..]);
                }
            }
            pos += 2 + length;
        }
        return None;
    }

    // 2. WebP (RIFF....WEBP)
    if data.starts_with(b"RIFF") && data.len() >= 12 && &data[8..12] == b"WEBP" {
        let mut pos = 12;
        while pos + 8 <= data.len() {
            let fourcc = &data[pos..pos + 4];
            let chunk_len = u32::from_le_bytes([data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7]]) as usize;
            let chunk_start = pos + 8;
            let chunk_end = (chunk_start + chunk_len).min(data.len());
            if fourcc == b"EXIF" && chunk_start < chunk_end {
                let payload = &data[chunk_start..chunk_end];
                if payload.starts_with(b"Exif\0\0") {
                    return parse_tiff_orientation(&payload[6..]);
                } else {
                    return parse_tiff_orientation(payload);
                }
            }
            pos = chunk_start + ((chunk_len + 1) & !1);
        }
        return None;
    }

    // 3. PNG
    if data.starts_with(&[137, 80, 78, 71, 13, 10, 26, 10]) {
        let mut pos = 8;
        while pos + 8 <= data.len() {
            let chunk_len = u32::from_be_bytes([data[pos], data[pos + 1], data[pos + 2], data[pos + 3]]) as usize;
            let chunk_type = &data[pos + 4..pos + 8];
            let chunk_start = pos + 8;
            let chunk_end = (chunk_start + chunk_len).min(data.len());
            if chunk_type == b"eXIf" && chunk_start < chunk_end {
                return parse_tiff_orientation(&data[chunk_start..chunk_end]);
            }
            pos = chunk_start + chunk_len + 4; // length + type + data + crc
        }
        return None;
    }

    // 4. Raw TIFF
    if data.starts_with(b"II") || data.starts_with(b"MM") {
        return parse_tiff_orientation(data);
    }

    None
}

pub async fn get_media_dimensions(app: AppHandle, path: String) -> Result<(u32, u32), String> {
    let path = clean_local_path(&path);
    let path_obj = Path::new(&path);
    if !path_obj.exists() {
        return Err("File does not exist".to_string());
    }

    let ext = path_obj.extension().ok_or("No extension")?.to_string_lossy().to_lowercase();
    if ext == "mp4" || ext == "mkv" || ext == "avi" || ext == "mov" || ext == "webm" {
        #[cfg(windows)]
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let mut probe_cmd = new_hidden_ffprobe_command(Some(&app));
        probe_cmd
            .args(["-v", "error", "-select_streams", "v:0",
                   "-show_entries", "stream=width,height:stream_tags=rotate:stream_side_data=rotation",
                   "-of", "default=noprint_wrappers=1", &path]);
        #[cfg(windows)]
        probe_cmd.creation_flags(CREATE_NO_WINDOW);

        let probe_out = probe_cmd.output().map_err(|e| format!("ffprobe failed: {}", e))?;
        let probe_str = String::from_utf8_lossy(&probe_out.stdout);
        let mut w: Option<u32> = None;
        let mut h: Option<u32> = None;
        let mut rotation: i32 = 0;

        for line in probe_str.lines() {
            let line = line.trim();
            if let Some(val) = line.strip_prefix("width=") {
                w = val.parse().ok();
            } else if let Some(val) = line.strip_prefix("height=") {
                h = val.parse().ok();
            } else if let Some(val) = line.strip_prefix("TAG:rotate=") {
                if let Ok(rot) = val.parse::<i32>() {
                    rotation = rot;
                }
            } else if let Some(val) = line.strip_prefix("rotation=") {
                if let Ok(rot) = val.parse::<i32>() {
                    rotation = rot;
                }
            }
        }

        let (mut final_w, mut final_h) = match (w, h) {
            (Some(w), Some(h)) => (w, h),
            _ => return Err(format!("Could not parse video dimensions from: '{}'", probe_str)),
        };

        let norm_rot = ((rotation % 360) + 360) % 360;
        if norm_rot == 90 || norm_rot == 270 {
            std::mem::swap(&mut final_w, &mut final_h);
        }
        return Ok((final_w, final_h));
    }

    match image::image_dimensions(&path) {
        Ok((mut w, mut h)) => {
            // Check EXIF orientation so width & height match visual orientation in browser/UI
            if let Some(orient) = read_image_exif_orientation(path_obj) {
                if orient >= 5 && orient <= 8 {
                    std::mem::swap(&mut w, &mut h);
                }
            }
            Ok((w, h))
        }
        Err(e) => Err(format!("Failed to read image dimensions: {}", e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_exif_orientation_parsing() {
        let test_img_path = Path::new("scratch_exif_test.jpg");
        if test_img_path.exists() {
            let orient = read_image_exif_orientation(test_img_path);
            assert_eq!(orient, Some(6));
        }
    }
}

