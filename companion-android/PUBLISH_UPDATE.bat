@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File .\publish-update.ps1
pause
