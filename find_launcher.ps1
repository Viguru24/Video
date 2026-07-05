$files = Get-ChildItem -Path C:\Users\louis\Documents\GitHub\Video -Filter * -File
foreach ($f in $files) {
    if (Test-Path $f.FullName) {
        $content = Get-Content $f.FullName -ErrorAction SilentlyContinue
        if ($content -match "COSMO VIDEO SYMPHONY") {
            Write-Host "Found file: $($f.FullName)"
        }
    }
}
