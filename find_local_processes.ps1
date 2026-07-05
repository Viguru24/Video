$procs = Get-Process
foreach ($p in $procs) {
    try {
        $path = $p.Path
        if ($path -and ($path -like "*GitHub\Video*" -or $path -like "*CosmoStudio*")) {
            Write-Host "Process ID: $($p.Id), Name: $($p.Name), Path: $path"
        }
    } catch {
        # Ignore process access errors
    }
}
