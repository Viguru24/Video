@echo off
echo ===================================================
echo   COSMO VIDEO SYMPHONY - DEVELOPMENT LAUNCHER
echo ===================================================
echo.
echo [1/2] Terminating any existing CosmoSymphony instances...
taskkill /f /im CosmoSymphony.exe >nul 2>&1

echo [2/2] Launching Tauri development server...
echo (This will clean fingerprints and boot Vite + Cargo)
echo.
npm run tauri:dev
