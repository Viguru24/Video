@echo off
taskkill /f /im CosmoSymphony.exe >nul 2>&1

set "EXE_PATH1=%~dp0src-tauri\target\x86_64-pc-windows-msvc\release\CosmoSymphony.exe"
set "EXE_PATH2=%~dp0src-tauri\target\release\CosmoSymphony.exe"
set "EXE_PATH="

if /i "%~1"=="dev" goto start_dev

if exist "%EXE_PATH2%" set "EXE_PATH=%EXE_PATH2%"
if not defined EXE_PATH if exist "%EXE_PATH1%" set "EXE_PATH=%EXE_PATH1%"

if defined EXE_PATH goto launch_release

:start_dev
echo Release build not found or dev mode requested.
echo Starting dev mode...
echo This might take a minute to compile...
npm run tauri:dev
exit /b

:launch_release
echo Launching Cosmo Video Professional Suite (Release Build)...
start "" "%EXE_PATH%"
exit /b
