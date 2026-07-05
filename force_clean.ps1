# 1. Kill any python processes running the backend (holding port 8005)
$conn = Get-NetTCPConnection -LocalPort 8005 -ErrorAction SilentlyContinue
if ($conn) {
    Write-Host "Found process holding port 8005: $($conn.OwningProcess)"
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
}

# Kill all python processes that were spawned for the backend
Get-Process -Name "python" -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.CommandLine -match "studio_agent" -or $_.CommandLine -match "uvicorn") {
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
}

# 2. Kill all CosmoSymphony and WebView2 background instances
Get-Process -Name "CosmoSymphony", "msedgewebview2" -ErrorAction SilentlyContinue | Stop-Process -Force

# 3. Clean up the Lockfile from all possible user data paths
$paths = @(
    "$env:LOCALAPPDATA\MicroMeadow.CosmoSymphony",
    "$env:APPDATA\MicroMeadow.CosmoSymphony"
)

foreach ($path in $paths) {
    if (Test-Path $path) {
        Write-Host "Cleaning locks in $path..."
        Get-ChildItem -Path $path -Recurse -Filter "Lockfile" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
        Get-ChildItem -Path $path -Recurse -Filter "*.lock" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    }
}

# Clear target wry directory
$wryPath = "C:\Users\louis\Documents\GitHub\Video\src-tauri\target\debug\wry"
if (Test-Path $wryPath) {
    Remove-Item -Path $wryPath -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Cleanup complete! All locks and ports are cleared."
