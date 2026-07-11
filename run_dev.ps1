# Cosmo Video Symphony - PowerShell Development Launcher
$ErrorActionPreference = "Continue"

Clear-Host
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "   COSMO VIDEO SYMPHONY - POWERSHELL LAUNCHER" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Terminate existing CosmoSymphony instances
Write-Host "[1/3] Terminating any existing CosmoSymphony instances..." -ForegroundColor Yellow
Stop-Process -Name CosmoSymphony -Force -ErrorAction SilentlyContinue

# 2. Clear port locks
Write-Host "[2/3] Clearing port locks..." -ForegroundColor Yellow
$ports = @(55174, 59473, 12000, 26646)
foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            $pid = $conn.OwningProcess
            if ($pid -gt 0) {
                Write-Host "Killing process holding port $port (PID: $pid)..." -ForegroundColor Gray
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

# 3. Launch Tauri dev server
Write-Host "[3/3] Launching Tauri development server..." -ForegroundColor Yellow
Write-Host ""
npm run tauri:dev
