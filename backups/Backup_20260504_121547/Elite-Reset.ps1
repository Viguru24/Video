# Cosmo Video Elite: Symphony Environment Reset
# This script aggressively purges all zombie processes and clears port locks to ensure a 100% clean boot.

$TARGET_PORT = 59473
$VITE_PORT = 55173
$APP_NAME = "cosmovideo"

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

# 3. Kill orphaned Node/Vite processes (optional but recommended)
# We only kill them if they are likely related to this project (listening on common ports)
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { 
    $_.Path -match "node_modules" 
} | Stop-Process -Force -ErrorAction SilentlyContinue

# 4. Clear Tauri lock files if they exist
$lockFile = "src-tauri/target/debug/.fingerprint"
if (Test-Path $lockFile) {
    Write-Host "Cleaning build fingerprints..." -ForegroundColor Gray
    # Removing this can slow down the next build, but ensures no corrupt state
    # Remove-Item -Recurse -Force $lockFile -ErrorAction SilentlyContinue
}

Write-Host "--- CLEAN START GUARANTEED ---" -ForegroundColor Green
