Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath = "c:\Users\louis\OneDrive\Documents\GitHub\Video\CosmoSymphony_backup_2026-06-08_17-01.zip"
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$zip.Entries | Select-Object -First 50 | Format-Table FullName, Length
$zip.Dispose()
