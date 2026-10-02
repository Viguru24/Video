@echo off
setlocal EnableDelayedExpansion
title Cosmo Symphony - MSIX Build and Run

echo =======================================================================
echo           COSMO SYMPHONY: AUTOMATED MSIX BUILD AND LAUNCH
echo =======================================================================
echo.

cd /d "%~dp0"

echo [1/2] Initiating Elite MSIX Build and Signing process...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Elite-Build.ps1" -Install

if %ERRORLEVEL% neq 0 (
    echo.
    echo =======================================================================
    echo   [ERROR] MSIX Build or Installation failed with exit code: %ERRORLEVEL%
    echo =======================================================================
    echo.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo =======================================================================
echo   [SUCCESS] Latest MSIX built, signed, installed, and launched!
echo =======================================================================
echo.
timeout /t 5 >nul
