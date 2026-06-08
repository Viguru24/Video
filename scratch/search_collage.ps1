Add-Type -AssemblyName System.IO.Compression.FileSystem
$zips = Get-ChildItem -Path "c:\Users\louis\OneDrive\Documents\GitHub\Video" -Filter "*.zip" -Recurse
foreach ($zip in $zips) {
    try {
        $archive = [System.IO.Compression.ZipFile]::OpenRead($zip.FullName)
        foreach ($entry in $archive.Entries) {
            if ($entry.FullName.EndsWith(".ts") -or $entry.FullName.EndsWith(".tsx") -or $entry.FullName.EndsWith(".css") -or $entry.FullName.EndsWith(".html") -or $entry.FullName.EndsWith(".js")) {
                $stream = $entry.Open()
                $reader = New-Object System.IO.StreamReader($stream)
                $text = $reader.ReadToEnd()
                $reader.Close()
                $stream.Close()
                if ($text -match "collage") {
                    Write-Host "Found collage in: $($zip.FullName) -> $($entry.FullName)"
                }
            }
        }
        $archive.Dispose()
    } catch {
        Write-Host "Error reading $($zip.FullName): $_"
    }
}
