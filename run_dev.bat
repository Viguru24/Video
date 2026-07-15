@echo off
echo ===================================================
echo   COSMO VIDEO SYMPHONY - RESILIENT LAUNCHER
echo ===================================================
echo.
echo [1/4] Terminating all Cosmo and backend processes...
taskkill /f /im CosmoSymphony.exe >nul 2>&1
taskkill /f /im cosmo_enhance.exe >nul 2>&1
taskkill /f /im python.exe >nul 2>&1

echo [2/4] Terminating hanging Microsoft WebView2 sub-processes...
taskkill /f /im msedgewebview2.exe >nul 2>&1

echo [3/4] Clearing port locks (55174, 59473, 12000, 8005, 26646)...
for %%p in (55174 59473 12000 8005 26646) do (
    for /f "usebackq tokens=5" %%a in (`netstat -aon ^| findstr :%%p 2^>nul`) do (
        if "%%a" neq "0" (
            taskkill /f /pid %%a >nul 2>&1
        )
    )
)

echo [4/4] Launching Tauri development server...
echo.
call npm run tauri:dev
if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: Tauri development server exited with code %ERRORLEVEL%
    pause
)
