Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath = "C:\Users\louis\OneDrive\Documents\GitHub\Video\backup_before_sticker_feature\CosmoSymphony_backup_2026-06-08_15-43.zip"
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$zip.Entries | Format-Table FullName, Length
$zip.Dispose()
