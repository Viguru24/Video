$dirs = Get-ChildItem -Path $env:LOCALAPPDATA, $env:APPDATA -Directory
foreach ($d in $dirs) {
    if ($d.Name -like "*Cosmo*" -or $d.Name -like "*Symphony*" -or $d.Name -like "*MicroMeadow*") {
        Write-Host "Folder: $($d.FullName)"
    }
}
