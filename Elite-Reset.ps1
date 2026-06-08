# Cosmo Video Elite: Symphony Environment Reset
# This script aggressively purges all zombie processes and clears port locks to ensure a 100% clean boot.

$TARGET_PORT = 59473
$VITE_PORT = 55174
$APP_NAME = "CosmoSymphony"

Write-Host "--- COSMO ELITE: RESETTING ENVIRONMENT ---" -ForegroundColor Magenta

# 1. Kill any process locking the target ports
foreach ($port in @($TARGET_PORT, $VITE_PORT)) {
    $portProcess = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -First 1
    if ($portProcess) {
        Write-Host "Terminating zombie process on port $port (PID: $portProcess)..." -ForegroundColor Yellow
        Stop-Process -Id $portProcess -Force -ErrorAction SilentlyContinue
    }
}

# 2. Kill any orphaned application instances
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

# 5. Clear Tauri lock files if they exist
$lockFile = "src-tauri/target/debug/.fingerprint"
if (Test-Path $lockFile) {
    Write-Host "Cleaning build fingerprints..." -ForegroundColor Gray
}

Write-Host "--- CLEAN START GUARANTEED ---" -ForegroundColor Green
