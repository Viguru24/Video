# Cosmo Video Elite: Symphony Environment Reset
# This script aggressively purges all zombie processes and clears port locks to ensure a 100% clean boot.

$TARGET_PORT = 59473
$VITE_PORT = 55174
$APP_NAME = "CosmoSymphony"

# ── PROTECTED PROCESSES: These will NEVER be killed under any circumstance ──
# ComfyUI (python.exe), Comfy Desktop, GPU workloads, system services
$PROTECTED_NAMES = @("python", "python3", "ComfyUI", "ComfyUI Desktop", "Comfy Desktop", "comfyui", "ollama", "System", "svchost", "explorer")

function Stop-SafeProcess {
    param([int]$Pid, [string]$Reason)
    $proc = Get-Process -Id $Pid -ErrorAction SilentlyContinue
    if (-not $proc) { return }
    $name = $proc.ProcessName
    if ($PROTECTED_NAMES -contains $name) {
        Write-Host "  [SKIPPED] Protected process '$name' (PID: $Pid) on $Reason — will not kill." -ForegroundColor DarkGreen
        return
    }
    Write-Host "  Terminating '$name' (PID: $Pid) — $Reason" -ForegroundColor Yellow
    Stop-Process -Id $Pid -Force -ErrorAction SilentlyContinue
}

Write-Host "--- COSMO ELITE: RESETTING ENVIRONMENT ---" -ForegroundColor Magenta

# 1. Kill any process locking the target ports (with protection check)
foreach ($port in @($TARGET_PORT, $VITE_PORT)) {
    $pids = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
    foreach ($pid in ($pids | Select-Object -Unique)) {
        if ($pid) { Stop-SafeProcess -Pid $pid -Reason "port $port" }
    }
}

# 2. Kill any orphaned CosmoSymphony instances
$appProcesses = Get-Process -Name $APP_NAME -ErrorAction SilentlyContinue
if ($appProcesses) {
    Write-Host "Clearing locked application executables ($APP_NAME)..." -ForegroundColor Yellow
    $appProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
}

# 3. Aggressively clear frontend and tauri caches to prevent stale bundles
Write-Host "Purging Vite module cache..." -ForegroundColor Cyan
Remove-Item -Recurse -Force node_modules/.vite -ErrorAction SilentlyContinue

Write-Host "Purging dist folder..." -ForegroundColor Cyan
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue

Write-Host "Purging Webview2 WebView Cache..." -ForegroundColor Cyan
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\com.cosmo.symphony" -ErrorAction SilentlyContinue

# 4. Clear Tauri lock files if they exist
$lockFile = "src-tauri/target/debug/.fingerprint"
if (Test-Path $lockFile) {
    Write-Host "Cleaning build fingerprints..." -ForegroundColor Gray
}

Write-Host "--- CLEAN START GUARANTEED ---" -ForegroundColor Green
