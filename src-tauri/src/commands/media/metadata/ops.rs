use std::fs;
use std::path::{Path, PathBuf};
use rayon::prelude::*;
use tauri::AppHandle;

use crate::commands::filesystem::clean_local_path;
use super::super::utils::new_hidden_ffmpeg_command;
use super::formats::{process_jpeg_metadata, process_png_metadata, process_webp_metadata};
use super::types::{
    BatchMetadataResult, MetadataActionRequest, SingleFileMetadataResult,
};

pub fn resolve_output_path(src: &Path, overwrite: bool) -> PathBuf {
    if overwrite {
        return src.to_path_buf();
    }
    let parent = src.parent().unwrap_or_else(|| Path::new("."));
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    let ext = src
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");

    let mut counter = 1;
    loop {
        let name = if ext.is_empty() {
            format!("{}_cleaned_{}", stem, counter)
        } else {
            format!("{}_cleaned_{}.{}", stem, counter, ext)
        };
        let p = parent.join(name);
        if !p.exists() {
            return p;
        }
        counter += 1;
    }
}

pub fn write_bytes_atomically(dest: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = dest.parent().unwrap_or_else(|| Path::new("."));
    let temp_name = format!(".cosmo_meta_tmp_{}.tmp", uuid::Uuid::new_v4());
    let temp_path = parent.join(temp_name);

    fs::write(&temp_path, bytes).map_err(|e| format!("Failed to write temp metadata file: {}", e))?;
    fs::rename(&temp_path, dest).map_err(|e| {
        let _ = fs::remove_file(&temp_path);
        format!("Failed to commit metadata update: {}", e)
    })
}

pub fn process_single_file_action(
    app: Option<&AppHandle>,
    raw_path: &str,
    request: &MetadataActionRequest,
) -> SingleFileMetadataResult {
    let clean_path = clean_local_path(raw_path);
    let src = Path::new(&clean_path);
    if !src.exists() {
        return SingleFileMetadataResult {
            original_path: clean_path,
            output_path: String::new(),
            success: false,
            error: Some("File does not exist".to_string()),
            bytes_before: 0,
            bytes_after: 0,
        };
    }

    let bytes_before = fs::metadata(src).map(|m| m.len()).unwrap_or(0);
    let dest = resolve_output_path(src, request.overwrite);
    let dest_str = dest.to_string_lossy().to_string();
    let ext = src
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    let result: Result<(), String> = if ext == "png" {
        fs::read(src)
            .map_err(|e| e.to_string())
            .and_then(|bytes| {
                process_png_metadata(
                    &bytes,
                    &request.action,
                    request.editable_exif.as_ref(),
                    request.comfyui_entries.as_deref(),
                )
            })
            .and_then(|new_bytes| write_bytes_atomically(&dest, &new_bytes))
    } else if ext == "jpg" || ext == "jpeg" {
        fs::read(src)
            .map_err(|e| e.to_string())
            .and_then(|bytes| {
                process_jpeg_metadata(
                    &bytes,
                    &request.action,
                    request.editable_exif.as_ref(),
                    request.comfyui_entries.as_deref(),
                )
            })
            .and_then(|new_bytes| write_bytes_atomically(&dest, &new_bytes))
    } else if ext == "webp" {
        fs::read(src)
            .map_err(|e| e.to_string())
            .and_then(|bytes| {
                process_webp_metadata(&bytes, &request.action, request.editable_exif.as_ref())
            })
            .and_then(|new_bytes| write_bytes_atomically(&dest, &new_bytes))
    } else {
        let parent = dest.parent().unwrap_or_else(|| Path::new("."));
        let temp_out = parent.join(format!(
            ".cosmo_ffmeta_{}.{}",
            uuid::Uuid::new_v4(),
            if ext.is_empty() { "mp4" } else { &ext }
        ));
        let mut cmd = new_hidden_ffmpeg_command(app);
        cmd.args([
            "-y",
            "-i",
            &clean_path,
            "-map",
            "0",
            "-map_metadata",
            "-1",
            "-c",
            "copy",
        ]);
        if request.action == "update_metadata" {
            if let Some(ed) = &request.editable_exif {
                if !ed.title.trim().is_empty() {
                    cmd.args(["-metadata", &format!("title={}", ed.title.trim())]);
                }
                if !ed.artist.trim().is_empty() {
                    cmd.args(["-metadata", &format!("artist={}", ed.artist.trim())]);
                }
                if !ed.copyright.trim().is_empty() {
                    cmd.args(["-metadata", &format!("copyright={}", ed.copyright.trim())]);
                }
                if !ed.description.trim().is_empty() {
                    cmd.args(["-metadata", &format!("description={}", ed.description.trim())]);
                }
                if !ed.comment.trim().is_empty() {
                    cmd.args(["-metadata", &format!("comment={}", ed.comment.trim())]);
                }
                if !ed.date_time.trim().is_empty() {
                    cmd.args(["-metadata", &format!("creation_time={}", ed.date_time.trim())]);
                }
            }
        }
        cmd.arg(temp_out.to_string_lossy().to_string());
        match cmd.output() {
            Ok(out) if out.status.success() && temp_out.exists() => {
                fs::rename(&temp_out, &dest).map_err(|e| {
                    let _ = fs::remove_file(&temp_out);
                    format!("Failed to move cleaned file into place: {}", e)
                })
            }
            Ok(out) => {
                let _ = fs::remove_file(&temp_out);
                Err(format!(
                    "FFmpeg metadata operation failed: {}",
                    String::from_utf8_lossy(&out.stderr)
                ))
            }
            Err(e) => {
                let _ = fs::remove_file(&temp_out);
                Err(format!("Failed to launch FFmpeg: {}", e))
            }
        }
    };

    let bytes_after = fs::metadata(&dest).map(|m| m.len()).unwrap_or(bytes_before);

    match result {
        Ok(()) => SingleFileMetadataResult {
            original_path: clean_path,
            output_path: dest_str,
            success: true,
            error: None,
            bytes_before,
            bytes_after,
        },
        Err(e) => SingleFileMetadataResult {
            original_path: clean_path,
            output_path: dest_str,
            success: false,
            error: Some(e),
            bytes_before,
            bytes_after,
        },
    }
}

pub async fn strip_or_update_metadata_batch(
    app: AppHandle,
    request: MetadataActionRequest,
) -> Result<BatchMetadataResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let results: Vec<SingleFileMetadataResult> = request
            .paths
            .par_iter()
            .map(|p| process_single_file_action(Some(&app), p, &request))
            .collect();

        let mut success_count = 0usize;
        let mut fail_count = 0usize;
        let mut total_bytes_saved = 0i64;

        for r in &results {
            if r.success {
                success_count += 1;
                total_bytes_saved += (r.bytes_before as i64) - (r.bytes_after as i64);
            } else {
                fail_count += 1;
            }
        }

        Ok(BatchMetadataResult {
            results,
            success_count,
            fail_count,
            total_bytes_saved,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::formats::{build_png_chunk, build_png_text_or_itxt_chunk};
    use super::super::types::PNG_SIGNATURE;

    #[test]
    fn test_png_comfyui_and_exif_strip_and_edit() {
        let mut png = Vec::new();
        png.extend_from_slice(&PNG_SIGNATURE);
        png.extend_from_slice(&build_png_chunk(
            b"IHDR",
            &[0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0],
        ));
        png.extend_from_slice(&build_png_text_or_itxt_chunk(
            "prompt",
            r#"{"3": {"class_type": "KSampler", "inputs": {"seed": 12345}}}"#,
        ));
        png.extend_from_slice(&build_png_text_or_itxt_chunk(
            "workflow",
            r#"{"nodes": [{"id": 1}], "links": []}"#,
        ));
        png.extend_from_slice(&build_png_text_or_itxt_chunk("Author", "Louis"));
        png.extend_from_slice(&build_png_chunk(b"IDAT", &[120, 156, 3, 0, 0, 0, 0, 1]));
        png.extend_from_slice(&build_png_chunk(b"IEND", &[]));

        let no_comfy = process_png_metadata(&png, "strip_comfyui", None, None).unwrap();
        let no_comfy_str = String::from_utf8_lossy(&no_comfy);
        assert!(!no_comfy_str.contains("KSampler"));
        assert!(no_comfy_str.contains("Louis"));

        let no_exif = process_png_metadata(&png, "strip_exif", None, None).unwrap();
        let no_exif_str = String::from_utf8_lossy(&no_exif);
        assert!(no_exif_str.contains("KSampler"));
        assert!(!no_exif_str.contains("Louis"));

        let clean = process_png_metadata(&png, "strip_all", None, None).unwrap();
        let clean_str = String::from_utf8_lossy(&clean);
        assert!(!clean_str.contains("KSampler"));
        assert!(!clean_str.contains("Louis"));
    }
}
