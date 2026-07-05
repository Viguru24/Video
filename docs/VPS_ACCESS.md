# VPS Access — Cosmo Symphony

This VPS (Hetzner) hosts the **GPU Acceleration Pack** (`cosmo_enhance_gpu_win64.zip`)
that users download when they opt in to full Real-ESRGAN AI upscaling.

---

## Connection Details

| Field       | Value                     |
|-------------|---------------------------|
| Host IP     | `49.12.79.244`            |
| SSH Port    | `8522`                    |
| User        | `root`                    |
| Key         | `%USERPROFILE%\.ssh\id_ed25519` |

### SSH into the VPS

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519" -p 8522 root@49.12.79.244
```

### SCP a file to the VPS

```powershell
scp -i "$env:USERPROFILE\.ssh\id_ed25519" -P 8522 <local-file> root@49.12.79.244:/var/www/html/<filename>
```

---

## Hosted Files

Files are served via **nginx** from `/var/www/html/`.

| File | URL | Purpose |
|---|---|---|
| `cosmo_enhance_gpu_win64.zip` | `http://49.12.79.244:8099/cosmo_enhance_gpu_win64.zip` | GPU Acceleration Pack (~2.8 GB) |

The CPU bundle (~286 MB) is hosted on **GitHub Releases**:
`https://github.com/Viguru24/Video/releases/latest/download/cosmo_enhance_cpu_win64.zip`

---

## Updating the GPU Bundle

When you rebuild the GPU pack with a new version of cosmo_enhance.py:

1. **Build** the new bundle:
   ```powershell
   .\scripts\build_cosmo_enhance_exe.ps1
   ```

2. **Upload** to VPS (replaces the existing file):
   ```powershell
   scp -i "$env:USERPROFILE\.ssh\id_ed25519" -P 8522 `
     dist\cosmo_enhance_gpu_win64.zip `
     root@49.12.79.244:/var/www/html/cosmo_enhance_gpu_win64.zip
   ```

3. **No code change needed** — `GPU_BUNDLE_URL` in `system.rs` already points there.

---

## Updating the CPU Bundle

1. **Build**:
   ```powershell
   .\scripts\build_cosmo_enhance_cpu.ps1
   ```

2. **Upload** to GitHub Releases (replace existing asset):
   ```powershell
   gh release upload ai-backend-v1.0.0 dist\cosmo_enhance_cpu_win64.zip --clobber
   ```

---

## VPS Monitor

The VPS monitor dashboard runs locally on port `58913`.
Launch it from the **VPS Monitor** project:

```powershell
# In C:\Users\louis\Documents\GitHub\VPS Monitor
.\vps-monitor.bat
```

Then open: [http://localhost:58913](http://localhost:58913)

---

## Disk Space

| Total | Used | Free |
|---|---|---|
| 38 GB | 25 GB (69%) | ~12 GB |

After uploading the GPU bundle (~2.8 GB), expect ~9 GB free.
