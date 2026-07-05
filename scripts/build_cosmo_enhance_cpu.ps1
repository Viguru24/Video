# Cosmo Symphony - CPU-Only AI Backend Build Script
# Creates a lightweight cosmo_enhance bundle using CPU-only PyTorch.
# This is the ~350 MB bundle that auto-downloads for ALL users on first run.
#
# USAGE:
#   .\scripts\build_cosmo_enhance_cpu.ps1
#
# PREREQUISITES:
#   This script creates a fresh CPU-only venv automatically.
#   You do NOT need to manually install anything.
#
# OUTPUT:
#   dist\cosmo_enhance_cpu_win64.zip  (~300-400 MB)
#   Upload to GitHub Releases as: cosmo_enhance_cpu_win64.zip

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot  = Split-Path $PSScriptRoot -Parent
$SrcTauri     = Join-Path $ProjectRoot "src-tauri"
$PythonScript = Join-Path $SrcTauri "cosmo_enhance.py"
$DistDir      = Join-Path $ProjectRoot "dist"
$BuildDir     = Join-Path $ProjectRoot "pyinstaller_build_cpu"
$OutputZip    = Join-Path $DistDir "cosmo_enhance_cpu_win64.zip"
$BundleDir    = Join-Path $DistDir "cosmo_enhance"
$CpuVenvDir   = Join-Path $ProjectRoot ".cosmo_cpu_venv"
$CpuPython    = Join-Path $CpuVenvDir "Scripts\python.exe"

# Verify source script exists
if (-not (Test-Path $PythonScript)) {
    Write-Error "cosmo_enhance.py not found at: $PythonScript"
    exit 1
}

# Create the CPU-only venv if it doesn't exist
if (-not (Test-Path $CpuPython)) {
    Write-Host ""
    Write-Host "[1/6] Creating CPU-only Python environment..." -ForegroundColor Green
    Write-Host "      (This is separate from your cosmo_venv CUDA environment)" -ForegroundColor Gray

    # Find system Python
    $SystemPython = $null
    $Candidates = @(
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "C:\Program Files\Python312\python.exe",
        "C:\Program Files\Python311\python.exe",
        "C:\Python312\python.exe",
        "C:\Python311\python.exe"
    )
    foreach ($c in $Candidates) {
        if (Test-Path $c) { $SystemPython = $c; break }
    }
    if (-not $SystemPython) {
        # Fall back to PATH
        $SystemPython = "python"
    }

    Write-Host "      Using system Python: $SystemPython" -ForegroundColor Gray
    & $SystemPython -m venv $CpuVenvDir
    if ($LASTEXITCODE -ne 0) { Write-Error "Failed to create CPU venv"; exit 1 }
} else {
    Write-Host "[1/6] CPU venv already exists, skipping creation." -ForegroundColor Cyan
}

# Install CPU-only torch into the venv
Write-Host "[2/6] Installing CPU-only PyTorch (this may take a few minutes)..." -ForegroundColor Green
& $CpuPython -m pip install --quiet --upgrade pip
& $CpuPython -m pip install --quiet torch torchvision --index-url https://download.pytorch.org/whl/cpu
if ($LASTEXITCODE -ne 0) { Write-Error "Failed to install CPU torch"; exit 1 }

# Install the rest of the packages
Write-Host "[3/6] Installing AI packages (numpy, opencv, basicsr, realesrgan, gfpgan)..." -ForegroundColor Green
& $CpuPython -m pip install --quiet `
    numpy "opencv-python-headless" `
    setuptools wheel `
    basicsr --no-build-isolation `
    realesrgan --no-build-isolation `
    gfpgan --no-build-isolation `
    pyinstaller
if ($LASTEXITCODE -ne 0) { Write-Error "Failed to install AI packages"; exit 1 }

# Clean previous build artefacts
Write-Host "[4/6] Cleaning previous build..." -ForegroundColor Green
if (Test-Path $BundleDir)  { Remove-Item $BundleDir  -Recurse -Force }
if (Test-Path $BuildDir)   { Remove-Item $BuildDir   -Recurse -Force }
if (Test-Path $OutputZip)  { Remove-Item $OutputZip  -Force }
New-Item -ItemType Directory -Force -Path $DistDir  | Out-Null
New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null

# Run PyInstaller with CPU venv
Write-Host "[5/6] Running PyInstaller with CPU-only torch (5-10 minutes)..." -ForegroundColor Green

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

& $CpuPython @PyInstallerArgs
if ($LASTEXITCODE -ne 0) { Write-Error "PyInstaller failed - see output above"; exit 1 }

$OutputExe = Join-Path $BundleDir "cosmo_enhance.exe"
if (-not (Test-Path $OutputExe)) {
    Write-Error "Build succeeded but cosmo_enhance.exe not found"
    exit 1
}

$BundleSizeMB = [math]::Round((Get-ChildItem $BundleDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
Write-Host "      Uncompressed bundle size: ${BundleSizeMB} MB" -ForegroundColor White

# Zip it
Write-Host "[6/6] Compressing to zip..." -ForegroundColor Green
Compress-Archive -Path $BundleDir -DestinationPath $OutputZip -CompressionLevel Optimal
$ZipSizeMB = [math]::Round((Get-Item $OutputZip).Length / 1MB, 1)

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " CPU BUNDLE BUILD COMPLETE" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host " Output zip : $OutputZip"
Write-Host " Zip size   : ${ZipSizeMB} MB"
Write-Host ""
Write-Host " Upload to GitHub Releases as: cosmo_enhance_cpu_win64.zip"
Write-Host "============================================================" -ForegroundColor Green
