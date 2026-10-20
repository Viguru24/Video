use super::types::{EditableExifFields, MetadataKeyValue};

/// Parses TIFF/EXIF header (starting at "II" or "MM") and extracts readable EXIF entries + GPS flag + Orientation.
pub fn parse_tiff_exif(data: &[u8]) -> (Vec<MetadataKeyValue>, bool, Option<u16>) {
    let mut entries = Vec::new();
    let mut has_gps = false;
    let mut orientation = None;

    if data.len() < 8 {
        return (entries, has_gps, orientation);
    }

    let is_le = if &data[0..2] == b"II" {
        true
    } else if &data[0..2] == b"MM" {
        false
    } else {
        return (entries, has_gps, orientation);
    };

    let read_u16 = |offset: usize| -> Option<u16> {
        if offset + 2 <= data.len() {
            Some(if is_le {
                u16::from_le_bytes([data[offset], data[offset + 1]])
            } else {
                u16::from_be_bytes([data[offset], data[offset + 1]])
            })
        } else {
            None
        }
    };

    let read_u32 = |offset: usize| -> Option<u32> {
        if offset + 4 <= data.len() {
            Some(if is_le {
                u32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]])
            } else {
                u32::from_be_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]])
            })
        } else {
            None
        }
    };

    if read_u16(2) != Some(42) {
        return (entries, has_gps, orientation);
    }

    let ifd0_offset = match read_u32(4) {
        Some(v) => v as usize,
        None => return (entries, has_gps, orientation),
    };

    let mut sub_ifds_to_visit = Vec::new();

    let mut parse_ifd = |ifd_offset: usize, is_sub_ifd: bool, sub_ifds: &mut Vec<usize>| {
        let count = match read_u16(ifd_offset) {
            Some(c) => (c as usize).min(256),
            None => return,
        };
        let base = ifd_offset + 2;
        for i in 0..count {
            let entry_off = base + i * 12;
            if entry_off + 12 > data.len() {
                break;
            }
            let tag = match read_u16(entry_off) {
                Some(t) => t,
                None => continue,
            };
            let fmt = read_u16(entry_off + 2).unwrap_or(0);
            let num_comp = read_u32(entry_off + 4).unwrap_or(0) as usize;
            let val_or_off = read_u32(entry_off + 8).unwrap_or(0) as usize;

            if !is_sub_ifd && tag == 0x8769 {
                sub_ifds.push(val_or_off);
                continue;
            }
            if !is_sub_ifd && tag == 0x8825 {
                has_gps = true;
                entries.push(MetadataKeyValue {
                    key: "GPSInfo".to_string(),
                    value: "GPS Location Data Present".to_string(),
                    source: "EXIF GPS".to_string(),
                });
                continue;
            }

            let tag_name = match tag {
                0x010E => "ImageDescription",
                0x010F => "Make",
                0x0110 => "Model",
                0x0112 => "Orientation",
                0x0131 => "Software",
                0x0132 => "DateTime",
                0x013B => "Artist",
                0x8298 => "Copyright",
                0x829A => "ExposureTime",
                0x829D => "FNumber",
                0x8827 => "ISO",
                0x9003 => "DateTimeOriginal",
                0x9004 => "DateTimeDigitized",
                0x920A => "FocalLength",
                0x9286 => "UserComment",
                0xA433 => "LensMake",
                0xA434 => "LensModel",
                0x9C9B => "XPTitle",
                0x9C9C => "XPComment",
                0x9C9D => "XPAuthor",
                0x9C9F => "XPSubject",
                _ => continue,
            };

            if tag == 0x0112 {
                let orient_val = read_u16(entry_off + 8).unwrap_or(1);
                orientation = Some(orient_val);
                entries.push(MetadataKeyValue {
                    key: "Orientation".to_string(),
                    value: orient_val.to_string(),
                    source: "EXIF".to_string(),
                });
                continue;
            }

            if fmt == 2 && num_comp > 0 {
                let str_bytes = if num_comp <= 4 {
                    &data[entry_off + 8..entry_off + 8 + num_comp]
                } else if val_or_off + num_comp <= data.len() {
                    &data[val_or_off..val_or_off + num_comp]
                } else {
                    continue;
                };
                let s = String::from_utf8_lossy(str_bytes)
                    .trim_matches('\0')
                    .trim()
                    .to_string();
                if !s.is_empty() {
                    entries.push(MetadataKeyValue {
                        key: tag_name.to_string(),
                        value: s,
                        source: "EXIF".to_string(),
                    });
                }
            } else if tag == 0x9286 && num_comp > 8 {
                if val_or_off + num_comp <= data.len() {
                    let raw = &data[val_or_off..val_or_off + num_comp];
                    let prefix = &raw[..8];
                    let body = &raw[8..];
                    let decoded = if prefix.starts_with(b"UNICODE") {
                        let u16s_be: Vec<u16> = body
                            .chunks_exact(2)
                            .map(|c| u16::from_be_bytes([c[0], c[1]]))
                            .collect();
                        let s_be = String::from_utf16_lossy(&u16s_be).trim_matches('\0').trim().to_string();
                        if s_be.chars().any(|c| c.is_ascii_alphanumeric()) {
                            s_be
                        } else {
                            let u16s_le: Vec<u16> = body
                                .chunks_exact(2)
                                .map(|c| u16::from_le_bytes([c[0], c[1]]))
                                .collect();
                            String::from_utf16_lossy(&u16s_le).trim_matches('\0').trim().to_string()
                        }
                    } else {
                        String::from_utf8_lossy(body).trim_matches('\0').trim().to_string()
                    };
                    if !decoded.is_empty() {
                        entries.push(MetadataKeyValue {
                            key: "UserComment".to_string(),
                            value: decoded,
                            source: "EXIF".to_string(),
                        });
                    }
                }
            } else if fmt == 3 && num_comp >= 1 {
                if let Some(v) = read_u16(entry_off + 8) {
                    entries.push(MetadataKeyValue {
                        key: tag_name.to_string(),
                        value: v.to_string(),
                        source: "EXIF".to_string(),
                    });
                }
            } else if fmt == 5 && num_comp >= 1 && val_or_off + 8 <= data.len() {
                if let (Some(num), Some(den)) = (read_u32(val_or_off), read_u32(val_or_off + 4)) {
                    if den > 0 {
                        let val_str = if tag == 0x829A && num < den {
                            format!("1/{} sec", den / num.max(1))
                        } else {
                            format!("{:.2}", (num as f64) / (den as f64))
                        };
                        entries.push(MetadataKeyValue {
                            key: tag_name.to_string(),
                            value: val_str,
                            source: "EXIF".to_string(),
                        });
                    }
                }
            }
        }
    };

    parse_ifd(ifd0_offset, false, &mut sub_ifds_to_visit);
    let to_visit = std::mem::take(&mut sub_ifds_to_visit);
    for sub_off in to_visit {
        parse_ifd(sub_off, true, &mut sub_ifds_to_visit);
    }

    (entries, has_gps, orientation)
}

/// Builds a clean little-endian TIFF EXIF block containing optional Orientation and EditableExifFields.
pub fn build_clean_tiff_exif(orientation: Option<u16>, editable: Option<&EditableExifFields>) -> Vec<u8> {
    enum IfdVal {
        Short(u16),
        Ascii(Vec<u8>),
    }

    let mut ifd0_tags: Vec<(u16, IfdVal)> = Vec::new();
    let mut user_comment_bytes: Option<Vec<u8>> = None;

    if let Some(ed) = editable {
        let desc = if !ed.description.trim().is_empty() {
            ed.description.trim().to_string()
        } else if !ed.title.trim().is_empty() {
            ed.title.trim().to_string()
        } else {
            String::new()
        };
        if !desc.is_empty() {
            let mut b = desc.into_bytes();
            b.push(0);
            ifd0_tags.push((0x010E, IfdVal::Ascii(b)));
        }
    }

    if let Some(orient) = orientation {
        if orient >= 1 && orient <= 8 {
            ifd0_tags.push((0x0112, IfdVal::Short(orient)));
        }
    }

    if let Some(ed) = editable {
        if !ed.software.trim().is_empty() {
            let mut b = ed.software.trim().as_bytes().to_vec();
            b.push(0);
            ifd0_tags.push((0x0131, IfdVal::Ascii(b)));
        }
        if !ed.date_time.trim().is_empty() {
            let mut b = ed.date_time.trim().as_bytes().to_vec();
            b.push(0);
            ifd0_tags.push((0x0132, IfdVal::Ascii(b)));
        }
        if !ed.artist.trim().is_empty() {
            let mut b = ed.artist.trim().as_bytes().to_vec();
            b.push(0);
            ifd0_tags.push((0x013B, IfdVal::Ascii(b)));
        }
        if !ed.copyright.trim().is_empty() {
            let mut b = ed.copyright.trim().as_bytes().to_vec();
            b.push(0);
            ifd0_tags.push((0x8298, IfdVal::Ascii(b)));
        }
        if !ed.comment.trim().is_empty() {
            let mut uc = b"ASCII\0\0\0".to_vec();
            uc.extend_from_slice(ed.comment.trim().as_bytes());
            user_comment_bytes = Some(uc);
        }
    }

    let has_sub_ifd = user_comment_bytes.is_some();
    let total_ifd0_entries = ifd0_tags.len() + if has_sub_ifd { 1 } else { 0 };
    if total_ifd0_entries == 0 {
        return Vec::new();
    }

    let mut tiff = Vec::new();
    tiff.extend_from_slice(b"II");
    tiff.extend_from_slice(&42u16.to_le_bytes());
    tiff.extend_from_slice(&8u32.to_le_bytes());
    tiff.extend_from_slice(&(total_ifd0_entries as u16).to_le_bytes());

    let ifd0_entries_pos = tiff.len();
    let data_pool_start = ifd0_entries_pos + total_ifd0_entries * 12 + 4;
    let mut data_pool: Vec<u8> = Vec::new();

    for (tag, val) in &ifd0_tags {
        tiff.extend_from_slice(&tag.to_le_bytes());
        match val {
            IfdVal::Short(v) => {
                tiff.extend_from_slice(&3u16.to_le_bytes()); // SHORT
                tiff.extend_from_slice(&1u32.to_le_bytes()); // 1 component
                tiff.extend_from_slice(&v.to_le_bytes());
                tiff.extend_from_slice(&0u16.to_le_bytes());
            }
            IfdVal::Ascii(bytes) => {
                tiff.extend_from_slice(&2u16.to_le_bytes()); // ASCII
                tiff.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
                if bytes.len() <= 4 {
                    let mut inline = [0u8; 4];
                    inline[..bytes.len()].copy_from_slice(bytes);
                    tiff.extend_from_slice(&inline);
                } else {
                    let off = (data_pool_start + data_pool.len()) as u32;
                    tiff.extend_from_slice(&off.to_le_bytes());
                    data_pool.extend_from_slice(bytes);
                    if data_pool.len() % 2 != 0 {
                        data_pool.push(0);
                    }
                }
            }
        }
    }

    let sub_ifd_entry_pos = if has_sub_ifd {
        let pos = tiff.len();
        tiff.extend_from_slice(&0x8769u16.to_le_bytes());
        tiff.extend_from_slice(&4u16.to_le_bytes()); // LONG
        tiff.extend_from_slice(&1u32.to_le_bytes());
        tiff.extend_from_slice(&0u32.to_le_bytes());
        Some(pos)
    } else {
        None
    };

    tiff.extend_from_slice(&0u32.to_le_bytes());
    tiff.extend_from_slice(&data_pool);

    if let (Some(entry_pos), Some(uc_bytes)) = (sub_ifd_entry_pos, user_comment_bytes) {
        let sub_ifd_offset = tiff.len() as u32;
        tiff[entry_pos + 8..entry_pos + 12].copy_from_slice(&sub_ifd_offset.to_le_bytes());

        tiff.extend_from_slice(&1u16.to_le_bytes());
        tiff.extend_from_slice(&0x9286u16.to_le_bytes());
        tiff.extend_from_slice(&7u16.to_le_bytes()); // UNDEFINED
        tiff.extend_from_slice(&(uc_bytes.len() as u32).to_le_bytes());
        let uc_data_off = (tiff.len() + 4 + 4) as u32;
        tiff.extend_from_slice(&uc_data_off.to_le_bytes());
        tiff.extend_from_slice(&0u32.to_le_bytes());
        tiff.extend_from_slice(&uc_bytes);
    }

    tiff
}
