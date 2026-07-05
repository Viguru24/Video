# Cosmo Symphony - AI Backend Freeze Build Script
# Creates a self-contained cosmo_enhance bundle using PyInstaller.
# The output zip is hosted on GitHub Releases so users download
# ONE pre-built file instead of running live pip installs.
#
# USAGE:
#   .\scripts\build_cosmo_enhance_exe.ps1
#
# OUTPUT:
#   dist\cosmo_enhance_win64.zip  (~250-400 MB)
#   Ready to upload to GitHub Releases.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot   = Split-Path $PSScriptRoot -Parent
$SrcTauri      = Join-Path $ProjectRoot "src-tauri"
$PythonScript  = Join-Path $SrcTauri "cosmo_enhance.py"
$DistDir       = Join-Path $ProjectRoot "dist"
$BuildDir      = Join-Path $ProjectRoot "pyinstaller_build"
$OutputZip     = Join-Path $DistDir "cosmo_enhance_gpu_win64.zip"
$BundleDir     = Join-Path $DistDir "cosmo_enhance"

# Prefer cosmo_venv if it exists, otherwise fall back to system Python
$VenvPython    = "$env:LOCALAPPDATA\cosmo_venv\Scripts\python.exe"

if (Test-Path $VenvPython) {
    $Python = $VenvPython
    Write-Host "[BUILD] Using cosmo_venv Python: $Python" -ForegroundColor Cyan
} else {
    $Python = "python"
    Write-Host "[BUILD] cosmo_venv not found - using system Python" -ForegroundColor Yellow
}

# Verify source script exists
if (-not (Test-Path $PythonScript)) {
    Write-Error "cosmo_enhance.py not found at: $PythonScript"
    exit 1
}

# Install / upgrade PyInstaller into the venv
Write-Host ""
Write-Host "[1/5] Installing PyInstaller..." -ForegroundColor Green
& $Python -m pip install --quiet --upgrade pyinstaller
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install PyInstaller"
    exit 1
}

# Clean previous build artefacts
Write-Host "[2/5] Cleaning previous build..." -ForegroundColor Green
if (Test-Path $BundleDir)  { Remove-Item $BundleDir  -Recurse -Force }
if (Test-Path $BuildDir)   { Remove-Item $BuildDir   -Recurse -Force }
if (Test-Path $OutputZip)  { Remove-Item $OutputZip  -Force }

New-Item -ItemType Directory -Force -Path $DistDir   | Out-Null
New-Item -ItemType Directory -Force -Path $BuildDir  | Out-Null

# Run PyInstaller
# --onedir   : outputs a folder (not a single .exe) - much faster startup
# --noupx    : skip UPX compression (causes false-positive AV flags in Store)
# --noconsole: no console window (Rust spawns it hidden anyway)
Write-Host "[3/5] Running PyInstaller (this takes 5-10 minutes)..." -ForegroundColor Green

$PyInstallerArgs = @(
    "-m", "PyInstaller",
    "--onedir",
    "--name", "cosmo_enhance",
    "--distpath", $DistDir,
    "--workpath", $BuildDir,
    "--noupx",
    "--noconsole",
    "--hidden-import", "torch",
    "--hidden-import", "torchvision",
    "--hidden-import", "torchvision.transforms",
    "--hidden-import", "torchvision.transforms.functional",
    "--hidden-import", "basicsr",
    "--hidden-import", "basicsr.archs.rrdbnet_arch",
    "--hidden-import", "realesrgan",
    "--hidden-import", "gfpgan",
    "--hidden-import", "cv2",
    "--hidden-import", "numpy",
    "--hidden-import", "facexlib",
    "--hidden-import", "facexlib.detection",
    "--hidden-import", "facexlib.parsing",
    "--collect-all", "basicsr",
    "--collect-all", "realesrgan",
    "--collect-all", "gfpgan",
    "--collect-all", "facexlib",
    $PythonScript
)

& $Python @PyInstallerArgs
if ($LASTEXITCODE -ne 0) {
    Write-Error "PyInstaller failed - see output above"
    exit 1
}

# Verify the output
$OutputExe = Join-Path $BundleDir "cosmo_enhance.exe"
if (-not (Test-Path $OutputExe)) {
    Write-Error "Build succeeded but cosmo_enhance.exe not found at: $OutputExe"
    exit 1
}

Write-Host "[4/5] Bundle created. Measuring size..." -ForegroundColor Green
$BundleSizeMB = [math]::Round((Get-ChildItem $BundleDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
Write-Host "      Uncompressed bundle size: ${BundleSizeMB} MB" -ForegroundColor White

# Zip the bundle
Write-Host "[5/5] Compressing to zip..." -ForegroundColor Green
Compress-Archive -Path $BundleDir -DestinationPath $OutputZip -CompressionLevel Optimal

$ZipSizeMB = [math]::Round((Get-Item $OutputZip).Length / 1MB, 1)

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " BUILD COMPLETE" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host " Output zip : $OutputZip"
Write-Host " Zip size   : ${ZipSizeMB} MB"
Write-Host ""
Write-Host " NEXT STEPS:"
Write-Host "  1. Go to your GitHub repo - Releases - New Release"
Write-Host "  2. Create a tag like: ai-backend-v1.0.0"
Write-Host "  3. Upload: $OutputZip"
Write-Host " Upload to GitHub Releases as: cosmo_enhance_gpu_win64.zip"
Write-Host "============================================================" -ForegroundColor Green
