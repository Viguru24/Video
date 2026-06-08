# Cosmo Symphony: Backup Script Executable
$sourceDir = "c:\Users\louis\OneDrive\Documents\GitHub\Video"
$zipPath = "c:\Users\louis\OneDrive\Documents\GitHub\CosmoSymphony_backup_2026-05-25.zip"
$tempStage = "C:\Users\louis\AppData\Local\Temp\CosmoSymphony_backup_stage"

Write-Host "Staging files for backup..." -ForegroundColor Cyan

if (Test-Path $tempStage) { Remove-Item -Recurse -Force $tempStage }
New-Item -ItemType Directory -Path $tempStage | Out-Null

$files = Get-ChildItem -Path $sourceDir -Recurse | Where-Object {
    $_.FullName -notlike "*\node_modules*" -and
    $_.FullName -notlike "*\src-tauri\target*" -and
    $_.FullName -notlike "*\.cosmo_models*" -and
    $_.FullName -notlike "*\dist*" -and
    $_.FullName -notlike "*\.git*"
}

foreach ($file in $files) {
    if ($file.PsIsContainer) { continue }
    $relPath = $file.FullName.Substring($sourceDir.Length + 1)
    $targetFile = Join-Path $tempStage $relPath
    $targetDir = Split-Path $targetFile -Parent
    if (!(Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
    Copy-Item -Path $file.FullName -Destination $targetFile -Force
}

Write-Host "Compressing archive to $zipPath ..." -ForegroundColor Cyan
Compress-Archive -Path "$tempStage\*" -DestinationPath $zipPath -Force

Write-Host "Cleaning up stage..." -ForegroundColor Cyan
Remove-Item -Recurse -Force $tempStage

Write-Host "Backup zip successfully created at $zipPath" -ForegroundColor Green
