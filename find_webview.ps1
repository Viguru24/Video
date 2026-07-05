$procs = Get-Process
foreach ($p in $procs) {
    if ($p.Name -like "*webview*" -or $p.Name -like "*CosmoSymphony*" -or $p.Name -like "*msedge*") {
        Write-Host "PID: $($p.Id), Name: $($p.Name)"
    }
}
