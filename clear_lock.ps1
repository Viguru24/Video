# Stop any running processes of CosmoSymphony or WebView2
Get-Process -Name "CosmoSymphony", "msedgewebview2" -ErrorAction SilentlyContinue | Stop-Process -Force

# Wait a second for processes to release handles
Start-Sleep -Seconds 1

# Define the local app data path for the app
$appDataPath = "$env:LOCALAPPDATA\MicroMeadow.CosmoSymphony"
Write-Host "Target AppData path: $appDataPath"

# Clear lock files inside EBWebView if they exist
if (Test-Path $appDataPath) {
    Write-Host "Clearing WebView2 lock files..."
    Get-ChildItem -Path $appDataPath -Recurse -Filter "Lockfile" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    Get-ChildItem -Path $appDataPath -Recurse -Filter "*.lock" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    Write-Host "WebView2 lock files cleared."
} else {
    Write-Host "AppData path does not exist yet."
}

# Also clear the dev target wry directory
$wryPath = "C:\Users\louis\Documents\GitHub\Video\src-tauri\target\debug\wry"
if (Test-Path $wryPath) {
    Remove-Item -Path $wryPath -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Dev Wry directory cleared."
}
