# Sovereign Over-The-Air (OTA) Updates Guide - COSMO Symphony Companion

This application receives direct Over-The-Air updates from your self-hosted sovereign VPS server.

## Overview
- **VPS Server:** `https://api.cosmowhisper.com`
- **Application Slug:** `cosmo-companion`
- **Metadata URL:** `https://api.cosmowhisper.com/updates/cosmo-companion/version.json`
- **APK Download:** `https://api.cosmowhisper.com/updates/cosmo-companion/app-latest.apk`
- **Publishing Upload:** `POST https://api.cosmowhisper.com/updates/cosmo-companion/upload`

## In-App Update Features
1. **Startup Check:** On launch, `AppUpdateManager` queries the VPS asynchronously.
2. **Floating Pill & Alert:** When a new build exists, a floating update indicator appears, tapping which prompts the user to download and install.
3. **Settings Check:** In the Companion Settings sheet, a dedicated "Check for Updates" button provides on-demand verification.

## Publishing Updates
- **Desktop Batch File:** Double-click `Publish_COSMO_Companion.bat` inside `C:\Users\louis\Desktop\OTA Update Publishers` or `PUBLISH_UPDATE.bat` in this repository.
- **PowerShell:**
  ```powershell
  cd C:\Users\louis\Documents\GitHub\Video\companion-android
  .\publish-update.ps1 -Notes "Symphony music composition, companion connectivity and performance fixes"
  ```
