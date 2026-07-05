$connections = netstat -aon | Where-Object { $_ -match ':8005\s' }
if ($connections) {
    $line = ($connections | Select-Object -First 1).Trim()
    $pid8005 = ($line -split '\s+')[-1]
    Write-Host "Killing PID $pid8005 on port 8005"
    Stop-Process -Id ([int]$pid8005) -Force -ErrorAction SilentlyContinue
    Write-Host "Done"
} else {
    Write-Host "No process found on port 8005"
}
