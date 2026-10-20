use std::io::Read;
use flate2::read::ZlibDecoder;
use super::types::{is_comfyui_or_ai_entry, EditableExifFields, MetadataKeyValue, PNG_SIGNATURE};
use super::tiff::{build_clean_tiff_exif, parse_tiff_exif};

pub fn compute_png_crc(chunk_type: &[u8; 4], data: &[u8]) -> u32 {
    let mut hasher = crc32fast::Hasher::new();
    hasher.update(chunk_type);
    hasher.update(data);
    hasher.finalize()
}

pub fn build_png_chunk(chunk_type: &[u8; 4], data: &[u8]) -> Vec<u8> {
    let len = data.len() as u32;
    let crc = compute_png_crc(chunk_type, data);
    let mut out = Vec::with_capacity(12 + data.len());
    out.extend_from_slice(&len.to_be_bytes());
    out.extend_from_slice(chunk_type);
    out.extend_from_slice(data);
    out.extend_from_slice(&crc.to_be_bytes());
    out
}

pub fn build_png_text_or_itxt_chunk(key: &str, value: &str) -> Vec<u8> {
    let clean_key: String = key
        .chars()
        .filter(|&c| c != '\0' && (c as u32) >= 32 && (c as u32) <= 126)
        .take(79)
        .collect();
    let final_key = if clean_key.is_empty() { "Comment" } else { &clean_key };

    if value.is_ascii() {
        let mut payload = Vec::with_capacity(final_key.len() + 1 + value.len());
        payload.extend_from_slice(final_key.as_bytes());
        payload.push(0);
        payload.extend_from_slice(value.as_bytes());
        build_png_chunk(b"tEXt", &payload)
    } else {
        let mut payload = Vec::with_capacity(final_key.len() + 5 + value.len());
        payload.extend_from_slice(final_key.as_bytes());
        payload.push(0);
        payload.push(0); // uncompressed
        payload.push(0); // compression method 0
        payload.push(0); // empty language tag
        payload.push(0); // empty translated keyword
        payload.extend_from_slice(value.as_bytes());
        build_png_chunk(b"iTXt", &payload)
    }
}

pub fn parse_png_text_chunk(chunk_type: &[u8; 4], data: &[u8]) -> Option<(String, String, String)> {
    match chunk_type {
        b"tEXt" => {
            let nul_pos = data.iter().position(|&b| b == 0)?;
            let key = String::from_utf8_lossy(&data[..nul_pos]).to_string();
            let val = String::from_utf8_lossy(&data[nul_pos + 1..]).to_string();
            Some((key, val, "PNG tEXt".to_string()))
        }
        b"zTXt" => {
            let nul_pos = data.iter().position(|&b| b == 0)?;
            if nul_pos + 2 > data.len() {
                return None;
            }
            let key = String::from_utf8_lossy(&data[..nul_pos]).to_string();
            let comp_data = &data[nul_pos + 2..];
            let mut decoder = ZlibDecoder::new(comp_data);
            let mut decompressed = Vec::new();
            decoder.read_to_end(&mut decompressed).ok()?;
            let val = String::from_utf8_lossy(&decompressed).to_string();
            Some((key, val, "PNG zTXt".to_string()))
        }
        b"iTXt" => {
            let nul_pos = data.iter().position(|&b| b == 0)?;
            if nul_pos + 3 > data.len() {
                return None;
            }
            let key = String::from_utf8_lossy(&data[..nul_pos]).to_string();
            let comp_flag = data[nul_pos + 1];
            let _comp_method = data[nul_pos + 2];
            let rest = &data[nul_pos + 3..];
            let lang_nul = rest.iter().position(|&b| b == 0)?;
            let after_lang = &rest[lang_nul + 1..];
            let trans_nul = after_lang.iter().position(|&b| b == 0)?;
            let text_bytes = &after_lang[trans_nul + 1..];
            let val = if comp_flag == 1 {
                let mut decoder = ZlibDecoder::new(text_bytes);
                let mut decompressed = Vec::new();
                decoder.read_to_end(&mut decompressed).ok()?;
                String::from_utf8_lossy(&decompressed).to_string()
            } else {
                String::from_utf8_lossy(text_bytes).to_string()
            };
            Some((key, val, "PNG iTXt".to_string()))
        }
        _ => None,
    }
}

pub fn process_png_metadata(
    src_bytes: &[u8],
    action: &str,
    editable_exif: Option<&EditableExifFields>,
    custom_comfyui: Option<&[MetadataKeyValue]>,
) -> Result<Vec<u8>, String> {
    if !src_bytes.starts_with(&PNG_SIGNATURE) {
        return Err("Invalid PNG file signature".to_string());
    }

    let strip_comfy = action == "strip_comfyui" || action == "strip_all";
    let strip_exif = action == "strip_exif" || action == "strip_all";
    let is_update = action == "update_metadata";

    let mut out = Vec::with_capacity(src_bytes.len());
    out.extend_from_slice(&PNG_SIGNATURE);

    let mut pos = 8;
    let mut inserted_custom_chunks = false;
    let mut preserved_orientation: Option<u16> = None;

    while pos + 12 <= src_bytes.len() {
        let len = u32::from_be_bytes([
            src_bytes[pos],
            src_bytes[pos + 1],
            src_bytes[pos + 2],
            src_bytes[pos + 3],
        ]) as usize;
        let chunk_type = &src_bytes[pos + 4..pos + 8];
        let chunk_start = pos + 8;
        let chunk_end = chunk_start.saturating_add(len);
        if chunk_end + 4 > src_bytes.len() {
            break;
        }
        if chunk_type == b"eXIf" {
            let chunk_data = &src_bytes[chunk_start..chunk_end];
            let tiff_slice = if chunk_data.starts_with(b"Exif\0\0") {
                &chunk_data[6..]
            } else {
                chunk_data
            };
            let (_, _, orient) = parse_tiff_exif(tiff_slice);
            if let Some(o) = orient {
                if o > 1 {
                    preserved_orientation = Some(o);
                }
            }
        }
        pos = chunk_end + 4;
    }

    pos = 8;
    while pos + 12 <= src_bytes.len() {
        let len = u32::from_be_bytes([
            src_bytes[pos],
            src_bytes[pos + 1],
            src_bytes[pos + 2],
            src_bytes[pos + 3],
        ]) as usize;
        let chunk_type: [u8; 4] = [
            src_bytes[pos + 4],
            src_bytes[pos + 5],
            src_bytes[pos + 6],
            src_bytes[pos + 7],
        ];
        let chunk_start = pos + 8;
        let chunk_end = chunk_start.saturating_add(len);
        if chunk_end + 4 > src_bytes.len() {
            break;
        }
        let full_chunk = &src_bytes[pos..chunk_end + 4];
        let chunk_data = &src_bytes[chunk_start..chunk_end];

        if &chunk_type == b"IDAT" && !inserted_custom_chunks {
            inserted_custom_chunks = true;
            if is_update {
                if let Some(comfy_list) = custom_comfyui {
                    for item in comfy_list {
                        if !item.key.trim().is_empty() && !item.value.trim().is_empty() {
                            out.extend_from_slice(&build_png_text_or_itxt_chunk(
                                item.key.trim(),
                                &item.value,
                            ));
                        }
                    }
                }
                if let Some(ed) = editable_exif {
                    let pairs = [
                        ("Title", ed.title.trim()),
                        ("Author", ed.artist.trim()),
                        ("Copyright", ed.copyright.trim()),
                        ("Description", ed.description.trim()),
                        ("Comment", ed.comment.trim()),
                        ("Software", ed.software.trim()),
                        ("Creation Time", ed.date_time.trim()),
                    ];
                    for (k, v) in pairs {
                        if !v.is_empty() {
                            out.extend_from_slice(&build_png_text_or_itxt_chunk(k, v));
                        }
                    }
                    let clean_tiff = build_clean_tiff_exif(preserved_orientation, Some(ed));
                    if !clean_tiff.is_empty() {
                        out.extend_from_slice(&build_png_chunk(b"eXIf", &clean_tiff));
                    }
                }
            } else if strip_exif && preserved_orientation.is_some() {
                let clean_tiff = build_clean_tiff_exif(preserved_orientation, None);
                if !clean_tiff.is_empty() {
                    out.extend_from_slice(&build_png_chunk(b"eXIf", &clean_tiff));
                }
            }
        }

        let should_keep = match &chunk_type {
            b"tEXt" | b"zTXt" | b"iTXt" => {
                if action == "strip_all" {
                    false
                } else if let Some((key, val, _)) = parse_png_text_chunk(&chunk_type, chunk_data) {
                    let is_comfy = is_comfyui_or_ai_entry(&key, &val);
                    if is_comfy {
                        if strip_comfy {
                            false
                        } else if is_update && custom_comfyui.is_some() {
                            false
                        } else {
                            true
                        }
                    } else {
                        if strip_exif {
                            false
                        } else if is_update && editable_exif.is_some() {
                            false
                        } else {
                            true
                        }
                    }
                } else {
                    !strip_exif && !strip_comfy
                }
            }
            b"eXIf" | b"tIME" => !strip_exif && !(is_update && editable_exif.is_some()),
            _ => true,
        };

        if should_keep {
            out.extend_from_slice(full_chunk);
        }

        if &chunk_type == b"IEND" {
            break;
        }
        pos = chunk_end + 4;
    }

    Ok(out)
}

pub fn process_jpeg_metadata(
    src_bytes: &[u8],
    action: &str,
    editable_exif: Option<&EditableExifFields>,
    custom_comfyui: Option<&[MetadataKeyValue]>,
) -> Result<Vec<u8>, String> {
    if src_bytes.len() < 4 || src_bytes[0] != 0xFF || src_bytes[1] != 0xD8 {
        return Err("Invalid JPEG file header".to_string());
    }

    let strip_comfy = action == "strip_comfyui" || action == "strip_all";
    let strip_exif = action == "strip_exif" || action == "strip_all";
    let is_update = action == "update_metadata";

    let mut out = Vec::with_capacity(src_bytes.len());
    out.extend_from_slice(&[0xFF, 0xD8]);

    let mut preserved_orientation: Option<u16> = None;
    let mut existing_editable = EditableExifFields::default();
    let mut existing_comfy: Vec<MetadataKeyValue> = Vec::new();

    let mut pos = 2;
    while pos + 4 <= src_bytes.len() {
        if src_bytes[pos] != 0xFF {
            pos += 1;
            continue;
        }
        let marker = src_bytes[pos + 1];
        if marker == 0xDA || marker == 0xD9 {
            break;
        }
        if marker == 0x00 || marker == 0xFF || (marker >= 0xD0 && marker <= 0xD7) {
            pos += 2;
            continue;
        }
        let seg_len = u16::from_be_bytes([src_bytes[pos + 2], src_bytes[pos + 3]]) as usize;
        if seg_len < 2 || pos + 2 + seg_len > src_bytes.len() {
            break;
        }
        let payload = &src_bytes[pos + 4..pos + 2 + seg_len];
        if marker == 0xE1 && payload.starts_with(b"Exif\0\0") {
            let (parsed, _, orient) = parse_tiff_exif(&payload[6..]);
            if orient.is_some() {
                preserved_orientation = orient;
            }
            let mut normal_entries = Vec::new();
            for entry in parsed {
                if is_comfyui_or_ai_entry(&entry.key, &entry.value) {
                    existing_comfy.push(entry);
                } else {
                    normal_entries.push(entry);
                }
            }
            super::inspect::populate_editable_fields(&normal_entries, &mut existing_editable);
        }
        pos += 2 + seg_len;
    }

    let mut injected_headers = false;
    pos = 2;
    while pos + 4 <= src_bytes.len() {
        if src_bytes[pos] != 0xFF {
            pos += 1;
            continue;
        }
        let marker = src_bytes[pos + 1];
        if marker == 0xDA || marker == 0xD9 {
            if !injected_headers {
                injected_headers = true;
                inject_jpeg_metadata_segments(
                    &mut out,
                    action,
                    preserved_orientation,
                    &existing_editable,
                    editable_exif,
                    &existing_comfy,
                    custom_comfyui,
                );
            }
            out.extend_from_slice(&src_bytes[pos..]);
            break;
        }
        if marker == 0x00 || marker == 0xFF || (marker >= 0xD0 && marker <= 0xD7) {
            out.extend_from_slice(&src_bytes[pos..pos + 2]);
            pos += 2;
            continue;
        }
        let seg_len = u16::from_be_bytes([src_bytes[pos + 2], src_bytes[pos + 3]]) as usize;
        if seg_len < 2 || pos + 2 + seg_len > src_bytes.len() {
            out.extend_from_slice(&src_bytes[pos..]);
            break;
        }
        let full_seg = &src_bytes[pos..pos + 2 + seg_len];
        let payload = &src_bytes[pos + 4..pos + 2 + seg_len];

        let should_keep = match marker {
            0xE1 => {
                if payload.starts_with(b"Exif\0\0") {
                    false
                } else if payload.starts_with(b"http://ns.adobe.com/xap/1.0/\0") {
                    let xmp_str = String::from_utf8_lossy(&payload[29..]);
                    let is_comfy = is_comfyui_or_ai_entry("xmp", &xmp_str);
                    if is_comfy {
                        !strip_comfy && !is_update
                    } else {
                        !strip_exif && !is_update
                    }
                } else {
                    !strip_exif
                }
            }
            0xED => !strip_exif && !is_update,
            0xFE => {
                let comment = String::from_utf8_lossy(payload);
                let is_comfy = is_comfyui_or_ai_entry("Comment", &comment);
                if is_comfy {
                    !strip_comfy && !(is_update && custom_comfyui.is_some())
                } else {
                    !strip_exif && !(is_update && editable_exif.is_some())
                }
            }
            _ => true,
        };

        if should_keep {
            out.extend_from_slice(full_seg);
        }

        if marker == 0xE0 && !injected_headers {
            injected_headers = true;
            inject_jpeg_metadata_segments(
                &mut out,
                action,
                preserved_orientation,
                &existing_editable,
                editable_exif,
                &existing_comfy,
                custom_comfyui,
            );
        }

        pos += 2 + seg_len;
    }

    Ok(out)
}

pub fn inject_jpeg_metadata_segments(
    out: &mut Vec<u8>,
    action: &str,
    preserved_orientation: Option<u16>,
    existing_editable: &EditableExifFields,
    new_editable: Option<&EditableExifFields>,
    existing_comfy: &[MetadataKeyValue],
    new_comfy: Option<&[MetadataKeyValue]>,
) {
    let orient_to_keep = preserved_orientation.filter(|&o| o > 1);

    let tiff_bytes = match action {
        "strip_all" | "strip_exif" => build_clean_tiff_exif(orient_to_keep, None),
        "strip_comfyui" => build_clean_tiff_exif(preserved_orientation, Some(existing_editable)),
        "update_metadata" => {
            let target_ed = new_editable.unwrap_or(existing_editable);
            build_clean_tiff_exif(preserved_orientation, Some(target_ed))
        }
        _ => Vec::new(),
    };

    if !tiff_bytes.is_empty() && tiff_bytes.len() + 8 <= 65535 {
        let seg_len = (tiff_bytes.len() + 6 + 2) as u16;
        out.extend_from_slice(&[0xFF, 0xE1]);
        out.extend_from_slice(&seg_len.to_be_bytes());
        out.extend_from_slice(b"Exif\0\0");
        out.extend_from_slice(&tiff_bytes);
    }

    let comfy_to_write: Option<&[MetadataKeyValue]> = if action == "strip_exif" {
        Some(existing_comfy)
    } else if action == "update_metadata" {
        new_comfy.or(Some(existing_comfy))
    } else {
        None
    };

    if let Some(entries) = comfy_to_write {
        for item in entries {
            let val_bytes = item.value.trim().as_bytes();
            if !val_bytes.is_empty() && val_bytes.len() + 2 <= 65530 {
                let seg_len = (val_bytes.len() + 2) as u16;
                out.extend_from_slice(&[0xFF, 0xFE]);
                out.extend_from_slice(&seg_len.to_be_bytes());
                out.extend_from_slice(val_bytes);
            }
        }
    }
}

pub fn process_webp_metadata(
    src_bytes: &[u8],
    action: &str,
    editable_exif: Option<&EditableExifFields>,
) -> Result<Vec<u8>, String> {
    if src_bytes.len() < 12 || &src_bytes[0..4] != b"RIFF" || &src_bytes[8..12] != b"WEBP" {
        return Err("Invalid WebP file header".to_string());
    }

    let strip_comfy = action == "strip_comfyui" || action == "strip_all";
    let strip_exif = action == "strip_exif" || action == "strip_all";
    let is_update = action == "update_metadata";

    let mut body_chunks: Vec<u8> = Vec::with_capacity(src_bytes.len());
    let mut vp8x_flags_pos: Option<usize> = None;
    let mut has_final_exif = false;
    let mut has_final_xmp = false;
    let mut preserved_orientation: Option<u16> = None;

    let mut pos = 12;
    while pos + 8 <= src_bytes.len() {
        let fourcc: [u8; 4] = [
            src_bytes[pos],
            src_bytes[pos + 1],
            src_bytes[pos + 2],
            src_bytes[pos + 3],
        ];
        let chunk_len = u32::from_le_bytes([
            src_bytes[pos + 4],
            src_bytes[pos + 5],
            src_bytes[pos + 6],
            src_bytes[pos + 7],
        ]) as usize;
        let chunk_start = pos + 8;
        let chunk_end = (chunk_start + chunk_len).min(src_bytes.len());
        let padded_len = (chunk_len + 1) & !1;
        let full_chunk_end = (chunk_start + padded_len).min(src_bytes.len());
        let payload = &src_bytes[chunk_start..chunk_end];

        if &fourcc == b"VP8X" && payload.len() >= 10 {
            vp8x_flags_pos = Some(body_chunks.len() + 8);
            body_chunks.extend_from_slice(&src_bytes[pos..full_chunk_end]);
        } else if &fourcc == b"EXIF" {
            let tiff_slice = if payload.starts_with(b"Exif\0\0") {
                &payload[6..]
            } else {
                payload
            };
            let (parsed, _, orient) = parse_tiff_exif(tiff_slice);
            if orient.is_some() {
                preserved_orientation = orient;
            }
            let has_comfy_in_exif = parsed.iter().any(|e| is_comfyui_or_ai_entry(&e.key, &e.value));
            let keep = if action == "strip_all" || is_update {
                false
            } else if strip_comfy && has_comfy_in_exif {
                false
            } else if strip_exif {
                false
            } else {
                true
            };
            if keep {
                has_final_exif = true;
                body_chunks.extend_from_slice(&src_bytes[pos..full_chunk_end]);
            }
        } else if &fourcc == b"XMP " {
            let xmp_str = String::from_utf8_lossy(payload);
            let is_comfy = is_comfyui_or_ai_entry("xmp", &xmp_str);
            let keep = if action == "strip_all" {
                false
            } else if is_comfy && strip_comfy {
                false
            } else if !is_comfy && strip_exif {
                false
            } else {
                true
            };
            if keep {
                has_final_xmp = true;
                body_chunks.extend_from_slice(&src_bytes[pos..full_chunk_end]);
            }
        } else {
            body_chunks.extend_from_slice(&src_bytes[pos..full_chunk_end]);
        }

        pos = full_chunk_end;
    }

    if is_update {
        let tiff = build_clean_tiff_exif(preserved_orientation, editable_exif);
        if !tiff.is_empty() {
            has_final_exif = true;
            body_chunks.extend_from_slice(b"EXIF");
            body_chunks.extend_from_slice(&(tiff.len() as u32).to_le_bytes());
            body_chunks.extend_from_slice(&tiff);
            if tiff.len() % 2 != 0 {
                body_chunks.push(0);
            }
        }
    }

    if let Some(flags_idx) = vp8x_flags_pos {
        if flags_idx < body_chunks.len() {
            if has_final_exif {
                body_chunks[flags_idx] |= 0x08;
            } else {
                body_chunks[flags_idx] &= !0x08;
            }
            if has_final_xmp {
                body_chunks[flags_idx] |= 0x04;
            } else {
                body_chunks[flags_idx] &= !0x04;
            }
        }
    }

    let riff_size = (4 + body_chunks.len()) as u32;
    let mut out = Vec::with_capacity(12 + body_chunks.len());
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&riff_size.to_le_bytes());
    out.extend_from_slice(b"WEBP");
    out.extend_from_slice(&body_chunks);
    Ok(out)
}
