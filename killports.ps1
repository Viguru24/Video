foreach ($port in @(55174, 8005)) {
    $lines = netstat -aon | Where-Object { $_ -match (":$port\s") }
    foreach ($line in $lines) {
        $procId = ($line.Trim() -split '\s+')[-1]
        if ($procId -match '^\d+$') {
            Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue
            Write-Host "Killed PID $procId on port $port"
        }
    }
}
Start-Sleep -Seconds 2
Write-Host "All ports cleared"
