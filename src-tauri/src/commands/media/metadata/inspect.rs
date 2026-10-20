use std::fs;
use std::io::Read;
use std::path::Path;
use rayon::prelude::*;
use serde_json::Value;
use tauri::AppHandle;

use crate::commands::filesystem::clean_local_path;
use super::super::utils::new_hidden_ffprobe_command;
use super::formats::parse_png_text_chunk;
use super::tiff::parse_tiff_exif;
use super::types::{
    is_comfyui_or_ai_entry, EditableExifFields, FileMetadataReport, MetadataKeyValue,
    PNG_SIGNATURE,
};

pub fn populate_editable_fields(
    exif_entries: &[MetadataKeyValue],
    editable: &mut EditableExifFields,
) {
    for entry in exif_entries {
        let k = entry.key.to_lowercase();
        if (k == "imagedescription" || k == "xptitle" || k == "title") && editable.title.is_empty() {
            editable.title = entry.value.clone();
        } else if (k == "artist" || k == "author" || k == "xpauthor") && editable.artist.is_empty() {
            editable.artist = entry.value.clone();
        } else if k == "copyright" && editable.copyright.is_empty() {
            editable.copyright = entry.value.clone();
        } else if (k == "description" || k == "xpsubject") && editable.description.is_empty() {
            editable.description = entry.value.clone();
        } else if (k == "usercomment" || k == "comment" || k == "xpcomment") && editable.comment.is_empty() {
            editable.comment = entry.value.clone();
        } else if k == "software" && editable.software.is_empty() {
            editable.software = entry.value.clone();
        } else if (k == "datetime" || k == "datetimeoriginal" || k == "creation time") && editable.date_time.is_empty() {
            editable.date_time = entry.value.clone();
        }
    }
}

pub fn inspect_single_file_sync(app: Option<&AppHandle>, raw_path: &str) -> Result<FileMetadataReport, String> {
    let clean_path = clean_local_path(raw_path);
    let p = Path::new(&clean_path);
    if !p.exists() {
        return Err(format!("File not found: {}", clean_path));
    }

    let file_meta = fs::metadata(p).map_err(|e| e.to_string())?;
    let file_size_bytes = file_meta.len();
    let file_name = p
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string();
    let ext = p
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    let mut comfyui_entries: Vec<MetadataKeyValue> = Vec::new();
    let mut exif_entries: Vec<MetadataKeyValue> = Vec::new();
    let mut has_gps = false;

    if ext == "png" {
        let data = fs::read(p).map_err(|e| format!("Failed to read PNG: {}", e))?;
        if data.starts_with(&PNG_SIGNATURE) {
            let mut pos = 8;
            while pos + 12 <= data.len() {
                let len = u32::from_be_bytes([data[pos], data[pos + 1], data[pos + 2], data[pos + 3]]) as usize;
                let chunk_type: [u8; 4] = [data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7]];
                let chunk_start = pos + 8;
                let chunk_end = chunk_start.saturating_add(len);
                if chunk_end + 4 > data.len() {
                    break;
                }
                let chunk_data = &data[chunk_start..chunk_end];

                match &chunk_type {
                    b"tEXt" | b"zTXt" | b"iTXt" => {
                        if let Some((key, val, src)) = parse_png_text_chunk(&chunk_type, chunk_data) {
                            if is_comfyui_or_ai_entry(&key, &val) {
                                comfyui_entries.push(MetadataKeyValue {
                                    key,
                                    value: val,
                                    source: src,
                                });
                            } else {
                                exif_entries.push(MetadataKeyValue {
                                    key,
                                    value: val,
                                    source: src,
                                });
                            }
                        }
                    }
                    b"eXIf" => {
                        let tiff_slice = if chunk_data.starts_with(b"Exif\0\0") {
                            &chunk_data[6..]
                        } else {
                            chunk_data
                        };
                        let (parsed, gps, _) = parse_tiff_exif(tiff_slice);
                        if gps {
                            has_gps = true;
                        }
                        if parsed.is_empty() {
                            exif_entries.push(MetadataKeyValue {
                                key: "eXIf Chunk".to_string(),
                                value: format!("{} bytes raw EXIF data", chunk_data.len()),
                                source: "PNG eXIf".to_string(),
                            });
                        } else {
                            for entry in parsed {
                                if is_comfyui_or_ai_entry(&entry.key, &entry.value) {
                                    comfyui_entries.push(entry);
                                } else {
                                    exif_entries.push(entry);
                                }
                            }
                        }
                    }
                    b"tIME" => {
                        if chunk_data.len() == 7 {
                            let year = u16::from_be_bytes([chunk_data[0], chunk_data[1]]);
                            let month = chunk_data[2];
                            let day = chunk_data[3];
                            let hour = chunk_data[4];
                            let min = chunk_data[5];
                            let sec = chunk_data[6];
                            exif_entries.push(MetadataKeyValue {
                                key: "LastModified (tIME)".to_string(),
                                value: format!("{:04}-{:02}-{:02} {:02}:{:02}:{:02}", year, month, day, hour, min, sec),
                                source: "PNG tIME".to_string(),
                            });
                        }
                    }
                    b"IEND" => break,
                    _ => {}
                }

                pos = chunk_end + 4;
            }
        }
    } else if ext == "jpg" || ext == "jpeg" {
        let mut f = fs::File::open(p).map_err(|e| format!("Failed to open JPEG: {}", e))?;
        let mut data = vec![0u8; (file_size_bytes as usize).min(2 * 1024 * 1024)];
        let n = f.read(&mut data).map_err(|e| e.to_string())?;
        let data = &data[..n];

        if data.len() >= 4 && data[0] == 0xFF && data[1] == 0xD8 {
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
                if marker == 0x00 || marker == 0xFF || (marker >= 0xD0 && marker <= 0xD7) {
                    pos += 2;
                    continue;
                }
                let seg_len = u16::from_be_bytes([data[pos + 2], data[pos + 3]]) as usize;
                if seg_len < 2 || pos + 2 + seg_len > data.len() {
                    break;
                }
                let payload = &data[pos + 4..pos + 2 + seg_len];

                if marker == 0xE1 {
                    if payload.starts_with(b"Exif\0\0") {
                        let (parsed, gps, _) = parse_tiff_exif(&payload[6..]);
                        if gps {
                            has_gps = true;
                        }
                        if parsed.is_empty() {
                            exif_entries.push(MetadataKeyValue {
                                key: "EXIF APP1".to_string(),
                                value: format!("{} bytes binary EXIF header", payload.len()),
                                source: "JPEG EXIF".to_string(),
                            });
                        } else {
                            for entry in parsed {
                                if is_comfyui_or_ai_entry(&entry.key, &entry.value) {
                                    comfyui_entries.push(entry);
                                } else {
                                    exif_entries.push(entry);
                                }
                            }
                        }
                    } else if payload.starts_with(b"http://ns.adobe.com/xap/1.0/\0") {
                        let xmp_str = String::from_utf8_lossy(&payload[29..]).trim().to_string();
                        if is_comfyui_or_ai_entry("xmp", &xmp_str) {
                            comfyui_entries.push(MetadataKeyValue {
                                key: "XMP Workflow".to_string(),
                                value: xmp_str,
                                source: "JPEG XMP".to_string(),
                            });
                        } else {
                            exif_entries.push(MetadataKeyValue {
                                key: "XMP Packet".to_string(),
                                value: if xmp_str.len() > 300 {
                                    format!("{}... ({} bytes)", &xmp_str[..300], xmp_str.len())
                                } else {
                                    xmp_str
                                },
                                source: "JPEG XMP".to_string(),
                            });
                        }
                    }
                } else if marker == 0xED {
                    exif_entries.push(MetadataKeyValue {
                        key: "IPTC / Photoshop".to_string(),
                        value: format!("{} bytes IPTC APP13 block", payload.len()),
                        source: "JPEG IPTC".to_string(),
                    });
                } else if marker == 0xFE {
                    let comment = String::from_utf8_lossy(payload).trim().to_string();
                    if !comment.is_empty() {
                        if is_comfyui_or_ai_entry("Comment", &comment) {
                            comfyui_entries.push(MetadataKeyValue {
                                key: "Comment".to_string(),
                                value: comment,
                                source: "JPEG COM".to_string(),
                            });
                        } else {
                            exif_entries.push(MetadataKeyValue {
                                key: "Comment".to_string(),
                                value: comment,
                                source: "JPEG COM".to_string(),
                            });
                        }
                    }
                }

                pos += 2 + seg_len;
            }
        }
    } else if ext == "webp" {
        let data = fs::read(p).map_err(|e| format!("Failed to read WebP: {}", e))?;
        if data.len() >= 12 && &data[0..4] == b"RIFF" && &data[8..12] == b"WEBP" {
            let mut pos = 12;
            while pos + 8 <= data.len() {
                let fourcc = &data[pos..pos + 4];
                let chunk_len = u32::from_le_bytes([data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7]]) as usize;
                let chunk_start = pos + 8;
                let chunk_end = (chunk_start + chunk_len).min(data.len());
                let payload = &data[chunk_start..chunk_end];

                if fourcc == b"EXIF" {
                    let tiff_slice = if payload.starts_with(b"Exif\0\0") {
                        &payload[6..]
                    } else {
                        payload
                    };
                    let (parsed, gps, _) = parse_tiff_exif(tiff_slice);
                    if gps {
                        has_gps = true;
                    }
                    if parsed.is_empty() {
                        exif_entries.push(MetadataKeyValue {
                            key: "WebP EXIF".to_string(),
                            value: format!("{} bytes binary EXIF chunk", payload.len()),
                            source: "WebP EXIF".to_string(),
                        });
                    } else {
                        for entry in parsed {
                            if is_comfyui_or_ai_entry(&entry.key, &entry.value) {
                                comfyui_entries.push(entry);
                            } else {
                                exif_entries.push(entry);
                            }
                        }
                    }
                } else if fourcc == b"XMP " {
                    let xmp_str = String::from_utf8_lossy(payload).trim().to_string();
                    if is_comfyui_or_ai_entry("xmp", &xmp_str) {
                        comfyui_entries.push(MetadataKeyValue {
                            key: "XMP Workflow".to_string(),
                            value: xmp_str,
                            source: "WebP XMP".to_string(),
                        });
                    } else {
                        exif_entries.push(MetadataKeyValue {
                            key: "XMP Packet".to_string(),
                            value: if xmp_str.len() > 300 {
                                format!("{}... ({} bytes)", &xmp_str[..300], xmp_str.len())
                            } else {
                                xmp_str
                            },
                            source: "WebP XMP".to_string(),
                        });
                    }
                }

                pos = chunk_start + ((chunk_len + 1) & !1);
            }
        }
    } else {
        let mut probe_cmd = new_hidden_ffprobe_command(app);
        probe_cmd.args([
            "-v",
            "quiet",
            "-show_entries",
            "format_tags",
            "-of",
            "json",
            &clean_path,
        ]);
        if let Ok(out) = probe_cmd.output() {
            let s = String::from_utf8_lossy(&out.stdout);
            if let Ok(parsed) = serde_json::from_str::<Value>(&s) {
                if let Some(tags) = parsed
                    .get("format")
                    .and_then(|f| f.get("tags"))
                    .and_then(|t| t.as_object())
                {
                    for (k, v) in tags {
                        let val_str = v.as_str().unwrap_or("").to_string();
                        if val_str.is_empty() {
                            continue;
                        }
                        let k_lower = k.to_lowercase();
                        if matches!(
                            k_lower.as_str(),
                            "major_brand" | "minor_version" | "compatible_brands"
                        ) {
                            continue;
                        }
                        if is_comfyui_or_ai_entry(k, &val_str) {
                            comfyui_entries.push(MetadataKeyValue {
                                key: k.clone(),
                                value: val_str,
                                source: "Container Tag".to_string(),
                            });
                        } else {
                            exif_entries.push(MetadataKeyValue {
                                key: k.clone(),
                                value: val_str,
                                source: "Container Tag".to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    let has_comfyui = !comfyui_entries.is_empty();
    let has_exif = !exif_entries.is_empty() || has_gps;

    let mut editable_exif = EditableExifFields::default();
    populate_editable_fields(&exif_entries, &mut editable_exif);

    let summary_badge = match (has_comfyui, has_exif) {
        (true, true) => "ComfyUI + EXIF".to_string(),
        (true, false) => "ComfyUI Workflow".to_string(),
        (false, true) => "EXIF Metadata".to_string(),
        (false, false) => "Clean (No Metadata)".to_string(),
    };

    Ok(FileMetadataReport {
        path: clean_path,
        file_name,
        format: ext.to_uppercase(),
        file_size_bytes,
        has_comfyui,
        has_exif,
        has_gps,
        comfyui_entries,
        exif_entries,
        editable_exif,
        summary_badge,
    })
}

pub async fn inspect_file_metadata(app: AppHandle, path: String) -> Result<FileMetadataReport, String> {
    tauri::async_runtime::spawn_blocking(move || inspect_single_file_sync(Some(&app), &path))
        .await
        .map_err(|e| e.to_string())?
}

pub async fn inspect_files_metadata_batch(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<Vec<FileMetadataReport>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let reports: Vec<FileMetadataReport> = paths
            .par_iter()
            .filter_map(|p| inspect_single_file_sync(Some(&app), p).ok())
            .collect();
        Ok(reports)
    })
    .await
    .map_err(|e| e.to_string())?
}
