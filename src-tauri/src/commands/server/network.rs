use base64::Engine as _;
use image::{ImageBuffer, Rgba};
use qrcode::QrCode;
use std::io::Cursor;

pub fn get_local_ip() -> String {
    let virtual_keywords = [
        "virtual",
        "vbox",
        "wsl",
        "docker",
        "host-only",
        "hyper-v",
        "vpn",
        "tailscale",
        "surfshark",
        "openvpn",
        "loopback",
        "pseudo",
    ];

    let is_virtual = |name: &str| -> bool {
        let lower = name.to_lowercase();
        virtual_keywords.iter().any(|kw| lower.contains(kw))
    };

    let mut fallback_ip: Option<String> = None;

    if let Ok(ifaces) = if_addrs::get_if_addrs() {
        // Pass 1: Look for physical Ethernet / standard LAN IP (192.168.x.x / 10.x.x.x / 172.16-31.x.x) on non-virtual interface
        for iface in &ifaces {
            if let std::net::IpAddr::V4(ipv4) = iface.addr.ip() {
                let ip_str = ipv4.to_string();
                if iface.is_loopback() || ip_str.starts_with("169.254.") || ip_str.starts_with("127.") {
                    continue;
                }
                let is_ethernet = iface.name.to_lowercase().contains("ethernet") || iface.name.to_lowercase().contains("eth");
                if (!is_virtual(&iface.name) || is_ethernet) && (ip_str.starts_with("192.168.") || ip_str.starts_with("10.")) {
                    return ip_str;
                }
            }
        }

        // Pass 2: Fallback to any non-virtual physical interface
        for iface in &ifaces {
            if let std::net::IpAddr::V4(ipv4) = iface.addr.ip() {
                let ip_str = ipv4.to_string();
                if iface.is_loopback() || ip_str.starts_with("169.254.") || ip_str.starts_with("127.") {
                    continue;
                }
                if !is_virtual(&iface.name) {
                    return ip_str;
                } else if fallback_ip.is_none() {
                    fallback_ip = Some(ip_str);
                }
            }
        }
    }

    fallback_ip.unwrap_or_else(|| "127.0.0.1".to_string())
}

pub fn generate_qr_data_url(text: &str) -> String {
    let code = match QrCode::new(text.as_bytes()) {
        Ok(c) => c,
        Err(_) => return String::new(),
    };

    let matrix = code
        .render::<char>()
        .quiet_zone(true)
        .module_dimensions(1, 1)
        .build();
    let lines: Vec<&str> = matrix.lines().collect();
    let h = lines.len();
    let w = if h > 0 { lines[0].chars().count() } else { 0 };

    let scale = 8u32;
    let img_w = (w as u32) * scale;
    let img_h = (h as u32) * scale;

    let mut img = ImageBuffer::<Rgba<u8>, Vec<u8>>::new(img_w, img_h);

    // Fill white
    for pixel in img.pixels_mut() {
        *pixel = Rgba([255, 255, 255, 255]);
    }

    // Draw black modules
    for (row_idx, line) in lines.iter().enumerate() {
        for (col_idx, ch) in line.chars().enumerate() {
            if ch == '█' {
                for dy in 0..scale {
                    for dx in 0..scale {
                        let px = (col_idx as u32) * scale + dx;
                        let py = (row_idx as u32) * scale + dy;
                        if px < img_w && py < img_h {
                            img.put_pixel(px, py, Rgba([0, 0, 0, 255]));
                        }
                    }
                }
            }
        }
    }

    let mut buf = Cursor::new(Vec::new());
    if image::write_buffer_with_format(
        &mut buf,
        &img,
        img_w,
        img_h,
        image::ColorType::Rgba8,
        image::ImageFormat::Png,
    )
    .is_err()
    {
        return String::new();
    }

    let b64 = base64::engine::general_purpose::STANDARD.encode(buf.into_inner());
    format!("data:image/png;base64,{}", b64)
}

pub fn urlencoding_name(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c.to_string()
            } else {
                format!("%{:02X}", c as u32)
            }
        })
        .collect()
}
