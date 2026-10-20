use serde::{Deserialize, Serialize};

pub const PNG_SIGNATURE: [u8; 8] = [137, 80, 78, 71, 13, 10, 26, 10];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataKeyValue {
    pub key: String,
    pub value: String,
    pub source: String, // e.g. "PNG tEXt", "PNG iTXt", "PNG zTXt", "EXIF", "XMP", "Container"
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EditableExifFields {
    pub title: String,
    pub artist: String,
    pub copyright: String,
    pub description: String,
    pub comment: String,
    pub software: String,
    pub date_time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMetadataReport {
    pub path: String,
    pub file_name: String,
    pub format: String,
    pub file_size_bytes: u64,
    pub has_comfyui: bool,
    pub has_exif: bool,
    pub has_gps: bool,
    pub comfyui_entries: Vec<MetadataKeyValue>,
    pub exif_entries: Vec<MetadataKeyValue>,
    pub editable_exif: EditableExifFields,
    pub summary_badge: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataActionRequest {
    pub paths: Vec<String>,
    /// "strip_comfyui" | "strip_exif" | "strip_all" | "update_metadata"
    pub action: String,
    pub overwrite: bool,
    pub editable_exif: Option<EditableExifFields>,
    pub comfyui_entries: Option<Vec<MetadataKeyValue>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SingleFileMetadataResult {
    pub original_path: String,
    pub output_path: String,
    pub success: bool,
    pub error: Option<String>,
    pub bytes_before: u64,
    pub bytes_after: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchMetadataResult {
    pub results: Vec<SingleFileMetadataResult>,
    pub success_count: usize,
    pub fail_count: usize,
    pub total_bytes_saved: i64,
}

/// Checks if a key/value pair belongs to ComfyUI or AI generation workflows.
pub fn is_comfyui_or_ai_entry(key: &str, value: &str) -> bool {
    let k = key.trim().to_lowercase();
    if matches!(
        k.as_str(),
        "prompt"
            | "workflow"
            | "parameters"
            | "dream"
            | "invokeai_metadata"
            | "sd-metadata"
            | "generation_data"
            | "sui_image_params"
            | "comfyui"
    ) {
        return true;
    }

    let v_trim = value.trim();
    if (v_trim.starts_with('{') && v_trim.ends_with('}'))
        && ((v_trim.contains("\"class_type\"") && v_trim.contains("\"inputs\""))
            || (v_trim.contains("\"nodes\"") && v_trim.contains("\"links\""))
            || v_trim.contains("\"ComfyUI\""))
    {
        return true;
    }

    false
}
