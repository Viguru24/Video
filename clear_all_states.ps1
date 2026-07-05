# Clear the window state JSON from AppData Roaming
$roamingPath = "$env:APPDATA\MicroMeadow.CosmoSymphony"
if (Test-Path $roamingPath) {
    Get-ChildItem -Path $roamingPath -Filter "*window-state*" -Recurse | Remove-Item -Force -ErrorAction SilentlyContinue
    Write-Host "Cleared roaming window state files."
}

# Also clear the local app data path fully to reset WebView2 state completely
$localPath = "$env:LOCALAPPDATA\MicroMeadow.CosmoSymphony"
if (Test-Path $localPath) {
    Remove-Item -Path $localPath -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Cleared local WebView2 cache directory."
}
