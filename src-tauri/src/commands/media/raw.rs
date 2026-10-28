use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// Check if a file extension represents a camera RAW format.
pub fn is_raw_image_extension(ext: &str) -> bool {
    matches!(
        ext.to_lowercase().as_str(),
        "dng" | "nef" | "cr2" | "cr3" | "arw" | "raw" | "orf" | "rw2" | "pef"
    )
}

/// Ultra-fast embedded thumbnail extractor from an in-memory header slice (up to 128KB - 256KB).
/// Supports:
/// 1. Standard JPEG APP1 EXIF thumbnails (starting with 0xFF 0xD8).
/// 2. Standalone embedded JPEG/JFIF streams inside DNG, TIFF, and RAW files (e.g. starting with 0xFF 0xD8 0xFF 0xE0 or 0xFF 0xD8 0xFF 0xDB).
pub fn extract_embedded_jpeg_thumbnail(bytes: &[u8]) -> Option<Vec<u8>> {
    if bytes.len() < 100 {
        return None;
    }

    // 1. Standard JPEG EXIF APP1 Thumbnail extraction
    if &bytes[0..2] == b"\xFF\xD8" {
        let search_limit = bytes.len().min(131072);
        let mut offset = 2;
        while offset + 4 < search_limit {
            if bytes[offset] != 0xFF {
                offset += 1;
                continue;
            }
            let marker = bytes[offset + 1];
            if marker == 0xE1 { // APP1 EXIF segment
                let len = ((bytes[offset + 2] as usize) << 8) | (bytes[offset + 3] as usize);
                let app1_end = (offset + 2 + len).min(bytes.len());
                let app1_slice = &bytes[offset + 4..app1_end];
                if let Some(thumb_start) = app1_slice.windows(2).position(|w| w == b"\xFF\xD8") {
                    let thumb_data = &app1_slice[thumb_start..];
                    if let Some(thumb_end_rel) = thumb_data.windows(2).rposition(|w| w == b"\xFF\xD9") {
                        let full_thumb = &thumb_data[..thumb_end_rel + 2];
                        if full_thumb.len() > 1024 {
                            return Some(full_thumb.to_vec());
                        }
                    }
                }
                break;
            } else if marker == 0xDA || marker == 0xD9 {
                break;
            } else {
                let len = ((bytes[offset + 2] as usize) << 8) | (bytes[offset + 3] as usize);
                offset += 2 + len;
            }
        }
    }

    // 2. RAW / TIFF / DNG embedded thumbnail scanner
    // Scan for self-contained JFIF/JPEG streams: SOI (0xFF 0xD8) -> SOF -> SOS -> EOI (0xFF 0xD9)
    let limit = bytes.len();
    let mut search_pos = 0;
    while search_pos + 4 < limit {
        if let Some(rel_soi) = bytes[search_pos..].windows(2).position(|w| w == b"\xFF\xD8") {
            let soi = search_pos + rel_soi;
            // Verify valid marker following SOI
            if soi + 3 < limit && bytes[soi + 2] == 0xFF {
                let marker_byte = bytes[soi + 3];
                // Thumbnails typically start with APP0 (JFIF: 0xE0), APP1 (EXIF: 0xE1), DQT (0xDB), or SOF (0xC0/0xC2)
                if (0xE0..=0xEF).contains(&marker_byte) || marker_byte == 0xDB || marker_byte == 0xC0 || marker_byte == 0xC2 {
                    // Look for matching EOI (0xFF 0xD9) within a thumbnail size limit (e.g. 512KB)
                    let max_eoi_scan = (soi + 524288).min(limit);
                    let mut eoi_pos = soi + 4;
                    while eoi_pos + 1 < max_eoi_scan {
                        if let Some(rel_eoi) = bytes[eoi_pos..max_eoi_scan].windows(2).position(|w| w == b"\xFF\xD9") {
                            let eoi = eoi_pos + rel_eoi + 2;
                            let candidate = &bytes[soi..eoi];
                            // Must be valid size and contain SOS marker (0xFF 0xDA)
                            if candidate.len() >= 1024 && candidate.windows(2).any(|w| w == b"\xFF\xDA") {
                                return Some(candidate.to_vec());
                            }
                            eoi_pos = eoi;
                        } else {
                            break;
                        }
                    }
                }
            }
            search_pos = soi + 2;
        } else {
            break;
        }
    }

    None
}

/// Traverses TIFF IFDs and SubIFDs to locate and extract the full-resolution or highest-resolution
/// embedded JPEG preview stored inside camera RAW files (DNG, NEF, CR2, ARW).
pub fn extract_raw_full_preview(file_path: &Path) -> Option<Vec<u8>> {
    let mut file = File::open(file_path).ok()?;
    let mut header = [0u8; 8];
    file.read_exact(&mut header).ok()?;

    let is_le = if &header[0..2] == b"II" {
        true
    } else if &header[0..2] == b"MM" {
        false
    } else {
        return None;
    };

    let read_u16 = |buf: &[u8]| -> u16 {
        if is_le {
            u16::from_le_bytes([buf[0], buf[1]])
        } else {
            u16::from_be_bytes([buf[0], buf[1]])
        }
    };

    let read_u32 = |buf: &[u8]| -> u32 {
        if is_le {
            u32::from_le_bytes([buf[0], buf[1], buf[2], buf[3]])
        } else {
            u32::from_be_bytes([buf[0], buf[1], buf[2], buf[3]])
        }
    };

    if read_u16(&header[2..4]) != 42 {
        return None;
    }
    let ifd0_offset = read_u32(&header[4..8]) as usize;

    let mut ifds_to_check = vec![ifd0_offset];
    let mut best_jpeg: Option<(u64, u64)> = None; // (offset, length)
    let mut visited = 0;

    while let Some(ifd_off) = ifds_to_check.pop() {
        visited += 1;
        if visited > 20 {
            break;
        }
        if file.seek(SeekFrom::Start(ifd_off as u64)).is_err() {
            continue;
        }
        let mut count_buf = [0u8; 2];
        if file.read_exact(&mut count_buf).is_err() {
            continue;
        }
        let count = (read_u16(&count_buf) as usize).min(256);
        let mut ifd_entries = vec![0u8; count * 12];
        if file.read_exact(&mut ifd_entries).is_err() {
            continue;
        }

        let mut compression = 0u16;
        let mut strip_offsets: Vec<u64> = Vec::new();
        let mut strip_byte_counts: Vec<u64> = Vec::new();
        let mut jpeg_off: Option<u64> = None;
        let mut jpeg_len: Option<u64> = None;

        for i in 0..count {
            let entry = &ifd_entries[i * 12..(i + 1) * 12];
            let tag = read_u16(&entry[0..2]);
            let num = read_u32(&entry[4..8]);
            let val = read_u32(&entry[8..12]);

            match tag {
                0x0103 => compression = val as u16,
                0x0144 | 0x014a => {
                    // SubIFDs tag: can contain single offset or pointer to array of offsets
                    if num == 1 {
                        ifds_to_check.push(val as usize);
                    } else if num > 1 && num <= 16 {
                        let mut sub_buf = vec![0u8; (num * 4) as usize];
                        let cur_pos = file.stream_position().unwrap_or(0);
                        if file.seek(SeekFrom::Start(val as u64)).is_ok() {
                            if file.read_exact(&mut sub_buf).is_ok() {
                                for chunk in sub_buf.chunks_exact(4) {
                                    ifds_to_check.push(read_u32(chunk) as usize);
                                }
                            }
                        }
                        let _ = file.seek(SeekFrom::Start(cur_pos));
                    }
                }
                0x0111 => {
                    // StripOffsets
                    if num == 1 {
                        strip_offsets.push(val as u64);
                    }
                }
                0x0117 => {
                    // StripByteCounts
                    if num == 1 {
                        strip_byte_counts.push(val as u64);
                    }
                }
                0x0201 => jpeg_off = Some(val as u64),
                0x0202 => jpeg_len = Some(val as u64),
                _ => {}
            }
        }

        let cur_best_len = best_jpeg.map(|(_, l)| l).unwrap_or(0);
        if let (Some(off), Some(len)) = (jpeg_off, jpeg_len) {
            if len > cur_best_len {
                best_jpeg = Some((off, len));
            }
        } else if (compression == 7 || compression == 6)
            && !strip_offsets.is_empty()
            && !strip_byte_counts.is_empty()
        {
            let off = strip_offsets[0];
            let len = strip_byte_counts[0];
            if len > cur_best_len {
                best_jpeg = Some((off, len));
            }
        }
    }

    if let Some((off, len)) = best_jpeg {
        // Cap max preview size at 120MB to prevent memory exhaustion
        if len > 1024 && len < 120 * 1024 * 1024 {
            if file.seek(SeekFrom::Start(off)).is_ok() {
                let mut buf = vec![0u8; len as usize];
                if file.read_exact(&mut buf).is_ok() {
                    if buf.starts_with(b"\xFF\xD8") {
                        return Some(buf);
                    }
                }
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dng_thumbnail_extraction() {
        let path = std::path::Path::new(r"G:\temp\Bday\20261018_163712.dng");
        if path.exists() {
            let mut file = std::fs::File::open(path).unwrap();
            let mut buf = vec![0u8; 131072];
            let n = std::io::Read::read(&mut file, &mut buf).unwrap();
            buf.truncate(n);
            let thumb = extract_embedded_jpeg_thumbnail(&buf);
            assert!(thumb.is_some(), "Failed to extract embedded thumbnail");
            let t = thumb.unwrap();
            println!("Extracted thumbnail size: {} bytes", t.len());
            assert!(t.len() > 1024);
        }
    }

    #[test]
    fn test_dng_full_preview_extraction() {
        let path = std::path::Path::new(r"G:\temp\Bday\20261018_163712.dng");
        if path.exists() {
            let prev = extract_raw_full_preview(path);
            assert!(prev.is_some(), "Failed to extract full preview");
            let p = prev.unwrap();
            println!("Extracted full preview size: {} bytes", p.len());
            assert!(p.len() > 1024);
        }
    }
}
