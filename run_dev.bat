@echo off
echo ===================================================
echo   COSMO VIDEO SYMPHONY - DEVELOPMENT LAUNCHER
echo ===================================================
echo.
echo [1/3] Terminating any existing CosmoSymphony instances...
taskkill /f /im CosmoSymphony.exe >nul 2>&1

echo [2/3] Clearing any processes holding app ports (55174, 59473)...
powershell -Command "$ports = @(55174, 59473); foreach ($port in $ports) { $pids = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($p in $pids) { if ($p) { Write-Host ('Killing process on port {0} (PID: {1})...' -f $port, $p); Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } } }"

echo [3/3] Launching Tauri development server...
echo.
call npm run tauri:dev
if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: Tauri development server exited with code %ERRORLEVEL%
    pause
)

