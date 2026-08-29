# Cosmo Symphony: Quick Clean Installer
# Uninstalls any previous version of Cosmo Symphony first, then installs the latest built MSIX package.

$ErrorActionPreference = "Stop"

$pkgDir = Join-Path $PSScriptRoot "CosmoSymphony-Package"
$cleanInstaller = Join-Path $pkgDir "Install-Clean.ps1"

if (Test-Path $cleanInstaller) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $cleanInstaller
} else {
    Write-Host "Error: Could not locate $cleanInstaller. Please run .\Elite-Build.ps1 first." -ForegroundColor Red
    exit 1
}
