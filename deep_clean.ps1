# 1. Kill any python processes running the backend (holding port 8005)
$conn = Get-NetTCPConnection -LocalPort 8005 -ErrorAction SilentlyContinue
if ($conn) {
    Write-Host "Found process holding port 8005: $($conn.OwningProcess)"
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
}

# Kill Cosmo-specific background instances only
Get-Process | Where-Object { $_.Name -like "*cosmo_enhance*" } | ForEach-Object {
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}

# 2. Kill CosmoSymphony background instances
taskkill /F /IM CosmoSymphony.exe /T 2>$null

# 3. Clean up Lockfiles from all possible user data paths
$paths = @(
    "$env:LOCALAPPDATA\MicroMeadow.CosmoSymphony",
    "$env:APPDATA\MicroMeadow.CosmoSymphony",
    "$env:LOCALAPPDATA\com.cosmo.symphony",
    "$env:APPDATA\com.cosmo.symphony"
)

foreach ($path in $paths) {
    if (Test-Path $path) {
        Write-Host "Cleaning locks in $path..."
        Get-ChildItem -Path $path -Recurse -Filter "Lockfile" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
        Get-ChildItem -Path $path -Recurse -Filter "*.lock" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    }
}

# Clear dev target wry directory
$wryPath = "C:\Users\louis\Documents\GitHub\Video\src-tauri\target\debug\wry"
if (Test-Path $wryPath) {
    Remove-Item -Path $wryPath -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Deep Cleanup complete! All locks, ports, and processes cleared."
