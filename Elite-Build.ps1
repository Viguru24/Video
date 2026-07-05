# Cosmo Symphony: Automated MSIX Build & Signature Tool
# This script handles building the Tauri app and manually signing the MSIX package 
# using signtool.exe, resolving any path/space parsing issues in msixbundle-cli.

$ErrorActionPreference = "Stop"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host " COSMO SYMPHONY: INITIALIZING MSIX BUILD" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# 1. Clean and run the standard build
Write-Host "`n[1/3] Compiling Tauri Application and creating package..." -ForegroundColor Yellow
$msixDir = "src-tauri\target\msix"
if (Test-Path $msixDir) {
    Write-Host "Cleaning old packages in $msixDir..." -ForegroundColor Gray
    Remove-Item -Path "$msixDir\*" -Include "*.msix", "*.msixbundle" -Force -ErrorAction SilentlyContinue
}
npm run tauri:windows:build

# 2. Locate signtool.exe dynamically
Write-Host "`n[2/3] Locating Windows SDK SignTool..." -ForegroundColor Yellow
$sdkPath = "C:\Program Files (x86)\Windows Kits\10\bin"
if (!(Test-Path $sdkPath)) {
    Write-Host "Error: Windows SDK Kits folder not found at $sdkPath" -ForegroundColor Red
    exit 1
}

$signtool = Get-ChildItem -Path $sdkPath -Filter "signtool.exe" -Recurse -ErrorAction SilentlyContinue | 
            Where-Object { $_.FullName -like "*\x64\*" } | 
            Select-Object -First 1 -ExpandProperty FullName

if (!$signtool) {
    Write-Host "Error: signtool.exe (x64) not found in Windows SDK." -ForegroundColor Red
    exit 1
}
Write-Host "Found SignTool: $signtool" -ForegroundColor Green

# 3. Sign the generated packages
Write-Host "`n[3/3] Signing MSIX packages with local certificate..." -ForegroundColor Yellow
$msixDir = "src-tauri\target\msix"
$certPath = "src-tauri\certificates\dev.pfx"
$password = "Cosmo2026!"

$packages = Get-ChildItem -Path $msixDir -Include "*.msix", "*.msixbundle" -Recurse

if ($packages.Count -eq 0) {
    Write-Host "Error: No MSIX packages found to sign in $msixDir" -ForegroundColor Red
    exit 1
}

foreach ($package in $packages) {
    Write-Host "Signing: $($package.Name)" -ForegroundColor Cyan
    & $signtool sign /f $certPath /p $password /fd SHA256 $package.FullName
}

# 4. Copy to root-level CosmoSymphony-Package folder (to mirror CosmoWhisper packaging style)
Write-Host "`n[4/4] Copying signed packages to root-level CosmoSymphony-Package folder..." -ForegroundColor Yellow
$targetPkgDir = Join-Path $PSScriptRoot "CosmoSymphony-Package"
if (!(Test-Path $targetPkgDir)) {
    New-Item -ItemType Directory -Path $targetPkgDir | Out-Null
}

# Clean old packages in root folder
Get-ChildItem -Path $targetPkgDir -Include "*.msix", "*.msixbundle" -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force

# Copy new signed packages
foreach ($package in $packages) {
    $dest = Join-Path $targetPkgDir $package.Name
    Copy-Item -Path $package.FullName -Destination $dest -Force
    Write-Host "Copied to: $dest" -ForegroundColor Green
}

Write-Host "`n=============================================" -ForegroundColor Green
Write-Host " BUILD & SIGNING COMPLETE!" -ForegroundColor Green
Write-Host " Packages are ready in: $targetPkgDir" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
