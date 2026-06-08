Add-Type -AssemblyName System.IO.Compression.FileSystem
$zips = Get-ChildItem -Path "C:\Users\louis\OneDrive\Documents\GitHub" -Filter "CosmoSymphony_backup_*.zip"
foreach ($zip in $zips) {
    try {
        $archive = [System.IO.Compression.ZipFile]::OpenRead($zip.FullName)
        foreach ($entry in $archive.Entries) {
            if ($entry.FullName.EndsWith(".json")) {
                $stream = $entry.Open()
                $reader = New-Object System.IO.StreamReader($stream)
                $text = $reader.ReadToEnd()
                $reader.Close()
                $stream.Close()
                if ($text -match "Micky_012" -or $text -match "NINO_001") {
                    Write-Host "Found videos in: $($zip.FullName) -> $($entry.FullName)"
                }
                if ($text -match "collage") {
                    Write-Host "Found collage keyword in: $($zip.FullName) -> $($entry.FullName)"
                }
            }
        }
        $archive.Dispose()
    } catch {
        Write-Host "Error reading $($zip.FullName): $_"
    }
}
