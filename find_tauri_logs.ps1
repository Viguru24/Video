$paths = @(
    "$env:LOCALAPPDATA\MicroMeadow.CosmoSymphony",
    "$env:APPDATA\MicroMeadow.CosmoSymphony",
    "$env:LOCALAPPDATA\com.cosmo.symphony",
    "$env:APPDATA\com.cosmo.symphony"
)

foreach ($path in $paths) {
    if (Test-Path $path) {
        Write-Host "Searching in: $path"
        Get-ChildItem -Path $path -Recurse -Filter "*.log" -ErrorAction SilentlyContinue | ForEach-Object {
            Write-Host "Log file: $($_.FullName) (Size: $($_.Length), Last Write: $($_.LastWriteTime))"
        }
    }
}
