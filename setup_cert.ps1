# Cosmo Symphony: Local Certificate Setup
# Run this script as Administrator to trust the self-signed MSIX certificate.

$certPath = "src-tauri\certificates\dev.pfx"
$password = ConvertTo-SecureString "Cosmo2026!" -AsPlainText -Force

if (!(Test-Path $certPath)) {
    Write-Host "Error: Certificate not found at $certPath" -ForegroundColor Red
    exit
}

Write-Host "Importing certificate to Trusted Root..." -ForegroundColor Cyan
Import-PfxCertificate -FilePath $certPath -CertStoreLocation "Cert:\LocalMachine\Root" -Password $password
Import-PfxCertificate -FilePath $certPath -CertStoreLocation "Cert:\LocalMachine\My" -Password $password

Write-Host "Done! You can now install the MSIX package locally." -ForegroundColor Green
