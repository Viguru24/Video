use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Manager};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Creates a Command that never spawns a visible console window on Windows.
pub fn new_hidden_command<S: AsRef<std::ffi::OsStr>>(program: S) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    cmd
}

pub fn resolve_ffmpeg_path(app: Option<&AppHandle>) -> PathBuf {
    if let Some(app) = app {
        if let Ok(res_dir) = app.path().resource_dir() {
            let res_ffmpeg = res_dir.join("resources").join("ffmpeg.exe");
            if res_ffmpeg.exists() {
                return res_ffmpeg;
            }
            let root_ffmpeg = res_dir.join("ffmpeg.exe");
            if root_ffmpeg.exists() {
                return root_ffmpeg;
            }
        }
    }
    PathBuf::from("ffmpeg")
}

pub fn resolve_ffprobe_path(app: Option<&AppHandle>) -> PathBuf {
    if let Some(app) = app {
        if let Ok(res_dir) = app.path().resource_dir() {
            let res_ffprobe = res_dir.join("resources").join("ffprobe.exe");
            if res_ffprobe.exists() {
                return res_ffprobe;
            }
            let root_ffprobe = res_dir.join("ffprobe.exe");
            if root_ffprobe.exists() {
                return root_ffprobe;
            }
        }
    }
    PathBuf::from("ffprobe")
}

pub fn new_hidden_ffmpeg_command(app: Option<&AppHandle>) -> Command {
    new_hidden_command(resolve_ffmpeg_path(app))
}

pub fn new_hidden_ffprobe_command(app: Option<&AppHandle>) -> Command {
    new_hidden_command(resolve_ffprobe_path(app))
}

pub fn debug_log(msg: &str) {
    println!("{}", msg);
}

pub fn safe_recycle_file(path: &Path, retries: u32) -> Result<(), String> {
    for attempt in 0..retries {
        match trash::delete(path) {
            Ok(()) => return Ok(()),
            Err(e) => {
                if attempt + 1 < retries {
                    std::thread::sleep(std::time::Duration::from_millis(150));
                } else {
                    return Err(format!("Failed to recycle '{}' after {} attempts: {}", path.display(), retries, e));
                }
            }
        }
    }
    Ok(())
}

pub fn get_next_upscale_filename(parent: &Path, stem: &str, ext: &str) -> PathBuf {
    let stem_str = stem.to_string();
    
    // Check if the stem ends with a single letter suffix after digits, e.g. "007A"
    let chars: Vec<char> = stem_str.chars().collect();
    if chars.len() >= 2 {
        let last_char = chars[chars.len() - 1];
        let prev_char = chars[chars.len() - 2];
        if last_char.is_ascii_alphabetic() && prev_char.is_ascii_digit() {
            let base_part = &stem_str[..stem_str.len() - 1];
            let last_char_upper = last_char.to_ascii_uppercase();
            if last_char_upper >= 'A' && last_char_upper < 'Z' {
                for next_char in ((last_char_upper as u8 + 1)..=b'Z').map(|b| b as char) {
                    let path_attempt = parent.join(format!("{}{}.{}", base_part, next_char, ext));
                    if !path_attempt.exists() {
                        return path_attempt;
                    }
                }
            }
        }
    }
    
    // If it ends with just digits, e.g. "007"
    let trimmed = stem_str.trim_end_matches(|c: char| c.is_ascii_digit());
    let digits = &stem_str[trimmed.len()..];
    if !digits.is_empty() {
        for suffix_char in b'A'..=b'Z' {
            let suffix = (suffix_char as char).to_string();
            let path_attempt = parent.join(format!("{}{}{}.{}", trimmed, digits, suffix, ext));
            if !path_attempt.exists() {
                return path_attempt;
            }
        }
    }
    
    // Fallback: standard sequence increments
    let base_prefix = crate::commands::filesystem::extract_base_prefix(stem);
    let next_num = crate::commands::filesystem::get_next_sequence_num(parent, &base_prefix, ext);
    let mut final_path = parent.join(format!("{}_{:03}.{}", base_prefix, next_num, ext));
    let mut counter = next_num;
    while final_path.exists() {
        counter += 1;
        final_path = parent.join(format!("{}_{:03}.{}", base_prefix, counter, ext));
    }
    final_path
}

pub fn get_drag_icon_path() -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let icon_path = temp_dir.join("cosmo_drag_icon.png");
    if !icon_path.exists() {
        let bytes = include_bytes!("../../../icons/32x32.png");
        if let Err(e) = fs::write(&icon_path, bytes) {
            return Err(e.to_string());
        }
    }
    Ok(icon_path.to_string_lossy().to_string())
}
