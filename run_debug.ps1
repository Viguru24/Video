$env:RUST_BACKTRACE = "1"
$env:TAURI_DEBUG = "1"
& "C:\Users\louis\Documents\GitHub\Video\src-tauri\target\debug\CosmoSymphony.exe" 2>&1 | Out-File -FilePath crash_debug.log -Encoding utf8
Write-Host "Exit code: $LASTEXITCODE"
