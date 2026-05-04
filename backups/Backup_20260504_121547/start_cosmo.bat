@echo off
set "EXE_PATH=%~dp0src-tauri\target\release\app.exe"

if exist "%EXE_PATH%" (
    echo Launching Cosmo Video Professional Suite...
    start "" "%EXE_PATH%"
) else (
    echo Release build not found at %EXE_PATH%
    echo Starting dev mode...
    echo This might take a minute to compile...
    npm run tauri:dev
)
