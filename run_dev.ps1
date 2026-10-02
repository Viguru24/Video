# Cosmo Video Symphony - Development Launcher
$ErrorActionPreference = "Continue"

# 1. Cap Cargo compiler concurrency to 4 cores so compilation never saturates CPU or impacts desktop responsiveness.
#    Leaves 16+ cores completely free for Windows DWM, mouse input, and interactive desktop.
$coreCount = [Environment]::ProcessorCount
$env:CARGO_BUILD_JOBS = [Math]::Min(4, [Math]::Max(2, $coreCount - 4))

Clear-Host
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "   COSMO VIDEO SYMPHONY - DEV LAUNCHER" -ForegroundColor Cyan
Write-Host "   Compilation Cores: $env:CARGO_BUILD_JOBS / $coreCount" -ForegroundColor DarkCyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# 2. Terminate previous CosmoSymphony instances to release locks
Write-Host "[1/3] Terminating any existing CosmoSymphony instances..." -ForegroundColor Yellow
Stop-Process -Name CosmoSymphony -Force -ErrorAction SilentlyContinue
Stop-Process -Name cosmo_enhance -Force -ErrorAction SilentlyContinue

# Kill orphaned msedgewebview2 processes whose user-data-dir points to our dev profile
# These zombie processes hold locks on WebView2Dev and cause the black screen on restart
$wv2Procs = Get-CimInstance Win32_Process -Filter "name = 'msedgewebview2.exe'" -ErrorAction SilentlyContinue
foreach ($p in $wv2Procs) {
    if ($p.CommandLine -like '*CosmoSymphonyDev*') {
        Write-Host "Killing orphaned WebView2 PID $($p.ProcessId)..." -ForegroundColor Gray
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

# Remove WebView2 singleton lock file that prevents restart after improper shutdown
$lockFile = "$env:LOCALAPPDATA\CosmoSymphonyDev\WebView2Dev\EBWebView\SingletonLock"
if (Test-Path $lockFile) {
    Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
    Write-Host "Cleared WebView2 singleton lock." -ForegroundColor Gray
}


# 3. Clear port locks (dev server, share server, and backend ports)
Write-Host "[2/3] Clearing port locks..." -ForegroundColor Yellow
$ports = @(55174, 59473, 26646, 12000, 8005)
foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            $procId = $conn.OwningProcess
            if ($procId -gt 0) {
                $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
                if ($proc -and ($proc.ProcessName -match "node|python|CosmoSymphony|cosmo_enhance")) {
                    Write-Host "Freeing port $port ($($proc.ProcessName) PID: $procId)..." -ForegroundColor Gray
                    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                }
            }
        }
    }
}

# Allow OS a moment to release file handles and socket locks
Start-Sleep -Milliseconds 800

# 4. Launch Tauri dev server
Write-Host "[3/3] Launching Tauri development server..." -ForegroundColor Yellow
Write-Host ""
npm run tauri:dev
