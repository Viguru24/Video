@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_dev.ps1"
if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: Launcher exited with code %ERRORLEVEL%
    pause
)
