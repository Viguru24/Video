# Cosmo Symphony: Local Certificate Setup
# Run this script as Administrator to trust the self-signed MSIX certificate.

$certPath = if ($env:COSMO_SIGN_CERT_PATH) { $env:COSMO_SIGN_CERT_PATH } else { "src-tauri\certificates\dev.pfx" }
$plainPwd = $env:COSMO_SIGN_CERT_PASSWORD
if ([string]::IsNullOrWhiteSpace($plainPwd)) {
    $password = Read-Host -Prompt "Enter PFX certificate password (or set COSMO_SIGN_CERT_PASSWORD)" -AsSecureString
} else {
    $password = ConvertTo-SecureString $plainPwd -AsPlainText -Force
}

if (!(Test-Path $certPath)) {
    Write-Host "Error: Certificate not found at $certPath" -ForegroundColor Red
    exit
}

Write-Host "Importing certificate to Trusted Root..." -ForegroundColor Cyan
Import-PfxCertificate -FilePath $certPath -CertStoreLocation "Cert:\LocalMachine\Root" -Password $password
Import-PfxCertificate -FilePath $certPath -CertStoreLocation "Cert:\LocalMachine\My" -Password $password

Write-Host "Done! You can now install the MSIX package locally." -ForegroundColor Green
