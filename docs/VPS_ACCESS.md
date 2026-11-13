# Infrastructure Access — Cosmo Symphony

> [!CAUTION]
> Legacy Hetzner VPS credentials and static IPs were redacted from version control.
> All production infrastructure should deploy to or reverse-proxy through **Ra Server** (`C:\Users\louis\Desktop\VPS_ACCESS_MANUAL.md`) or use environment-configured artifact URLs.

---

## GPU & CPU Bundle Configuration

Set environment overrides before building or running if hosting custom mirror URLs:

- `COSMO_CPU_BUNDLE_URL`: URL to `cosmo_enhance_cpu_win64.zip`
- `COSMO_GPU_BUNDLE_URL`: URL to `cosmo_enhance_gpu_win64.zip`

The default CPU bundle (~286 MB) is hosted on **GitHub Releases**:
`https://github.com/Viguru24/Video/releases/download/ai-backend-v1.0.0/cosmo_enhance_cpu_win64.zip`

The default GPU Acceleration Pack (`cosmo_enhance_gpu_win64.zip`) resolves via **Ra Server**:
`https://api.cosmowhisper.com/downloads/cosmo_enhance_gpu_win64.zip` (served from `/var/www/html/cosmo_enhance_gpu_win64.zip` on Ra Server).

---

## Updating the GPU Bundle

1. **Build**:
   ```powershell
   .\scripts\build_cosmo_enhance_exe.ps1
   ```

2. **Stage to Ra Server (`/var/www/html`)**:
   ```powershell
   scp dist\cosmo_enhance_gpu_win64.zip viguru@192.168.1.28:/tmp/cosmo_enhance_gpu_win64.zip
   ssh viguru@192.168.1.28 "sudo mv /tmp/cosmo_enhance_gpu_win64.zip /var/www/html/cosmo_enhance_gpu_win64.zip && sudo chmod 644 /var/www/html/cosmo_enhance_gpu_win64.zip"
   ```

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
