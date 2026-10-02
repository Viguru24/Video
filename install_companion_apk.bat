@echo off
setlocal enabledelayedexpansion
title Cosmo Symphony Companion - APK Installer

echo ===================================================
echo     Cosmo Symphony Companion - Android Installer
echo ===================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "APK_PATH=%SCRIPT_DIR%companion-android\app\build\outputs\apk\debug\app-debug.apk"

if not exist "%APK_PATH%" (
    echo [ERROR] APK not found at:
    echo "%APK_PATH%"
    echo.
    echo Please rebuild the APK first.
    echo.
    pause
    exit /b 1
)

echo Checking for connected Android devices via ADB...
adb devices
echo.

echo Installing Cosmo Symphony Companion APK to device...
adb install -r -d "%APK_PATH%"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ===================================================
    echo [SUCCESS] Cosmo Symphony Companion installed successfully!
    echo ===================================================
) else (
    echo.
    echo ===================================================
    echo [FAILED] ADB installation failed.
    echo Please ensure:
    echo   1. Your phone is connected via USB.
    echo   2. USB Debugging is enabled on your Android device.
    echo   3. You accepted the "Allow USB Debugging" prompt on phone.
    echo ===================================================
)

echo.
pause
