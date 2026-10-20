#[tauri::command]
pub async fn share_media_file(path: String, platform: String, mode: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let clean_path = crate::commands::filesystem::clean_local_path(&path);
        let file_path = std::path::PathBuf::from(&clean_path);
        if !file_path.exists() {
            return Err(format!("File does not exist: {}", clean_path));
        }

        let is_image = match file_path.extension().and_then(|ext| ext.to_str()).map(|e| e.to_lowercase()).as_deref() {
            Some("png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp" | "avif" | "tiff" | "ico") => true,
            _ => false,
        };

        let media_type_label = if is_image { "Image" } else { "Video" };

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;

            let ps_script = format!(
                "Set-Clipboard -Path '{}'",
                clean_path.replace("'", "''")
            );

            let mut ps_cmd = std::process::Command::new("powershell.exe");
            ps_cmd.arg("-NoProfile")
                  .arg("-NonInteractive")
                  .arg("-Command")
                  .arg(&ps_script);
            ps_cmd.creation_flags(0x08000000);

            let _ = ps_cmd.output();

            match platform.to_lowercase().as_str() {
                "whatsapp" => {
                    if mode == "web" {
                        let mut open_cmd = std::process::Command::new("cmd.exe");
                        open_cmd.arg("/c").arg("start").arg("https://web.whatsapp.com");
                        open_cmd.creation_flags(0x08000000);
                        let _ = open_cmd.spawn();
                        Ok(format!("{} copied to clipboard & WhatsApp Web opened! Press Ctrl+V in your chat.", media_type_label))
                    } else {
                        let mut open_cmd = std::process::Command::new("cmd.exe");
                        open_cmd.arg("/c").arg("start").arg("whatsapp://");
                        open_cmd.creation_flags(0x08000000);
                        let _ = open_cmd.spawn();
                        Ok(format!("{} copied to clipboard & WhatsApp opened! Press Ctrl+V in your chat.", media_type_label))
                    }
                },
                "telegram" => {
                    if mode == "web" {
                        let mut open_cmd = std::process::Command::new("cmd.exe");
                        open_cmd.arg("/c").arg("start").arg("https://web.telegram.org");
                        open_cmd.creation_flags(0x08000000);
                        let _ = open_cmd.spawn();
                        Ok(format!("{} copied to clipboard & Telegram Web opened! Press Ctrl+V in your chat.", media_type_label))
                    } else {
                        let mut open_cmd = std::process::Command::new("cmd.exe");
                        open_cmd.arg("/c").arg("start").arg("tg://");
                        open_cmd.creation_flags(0x08000000);
                        let _ = open_cmd.spawn();
                        Ok(format!("{} copied to clipboard & Telegram opened! Press Ctrl+V in your chat.", media_type_label))
                    }
                },
                "discord" => {
                    if mode == "web" {
                        let mut open_cmd = std::process::Command::new("cmd.exe");
                        open_cmd.arg("/c").arg("start").arg("https://discord.com/app");
                        open_cmd.creation_flags(0x08000000);
                        let _ = open_cmd.spawn();
                        Ok(format!("{} copied to clipboard & Discord Web opened! Press Ctrl+V in your channel.", media_type_label))
                    } else {
                        let mut open_cmd = std::process::Command::new("cmd.exe");
                        open_cmd.arg("/c").arg("start").arg("discord://");
                        open_cmd.creation_flags(0x08000000);
                        let _ = open_cmd.spawn();
                        Ok(format!("{} copied to clipboard & Discord opened! Press Ctrl+V in your channel.", media_type_label))
                    }
                },
                "email" => {
                    let mut open_cmd = std::process::Command::new("cmd.exe");
                    open_cmd.arg("/c").arg("start").arg("mailto:");
                    open_cmd.creation_flags(0x08000000);
                    let _ = open_cmd.spawn();
                    Ok(format!("{} copied to clipboard & Email client opened! Press Ctrl+V to attach.", media_type_label))
                },
                "clipboard" => {
                    Ok(format!("{} copied to clipboard! Switch to any app and press Ctrl+V to paste.", media_type_label))
                },
                "explorer" => {
                    let mut exp_cmd = std::process::Command::new("explorer.exe");
                    exp_cmd.arg("/select,").arg(&clean_path);
                    let _ = exp_cmd.spawn();
                    Ok(format!("{} located in File Explorer. Drag & drop anywhere!", media_type_label))
                },
                _ => {
                    Ok(format!("{} ready for sharing.", media_type_label))
                }
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            Ok(format!("{} ready for sharing.", media_type_label))
        }
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn share_to_whatsapp(path: String, mode: String) -> Result<String, String> {
    share_media_file(path, "whatsapp".to_string(), mode).await
}
