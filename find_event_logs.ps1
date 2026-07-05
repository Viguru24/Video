$startTime = (Get-Date).AddMinutes(-20)
Write-Host "Searching Event Logs since $startTime..."

Get-WinEvent -FilterHashtable @{
    LogName = 'Application'
    StartTime = $startTime
} -ErrorAction SilentlyContinue | Where-Object { $_.Message -like "*Cosmo*" -or $_.Message -like "*Symphony*" -or $_.Message -like "*Tauri*" -or $_.Message -like "*WebView2*" } | ForEach-Object {
    Write-Host "--- Application Event Log ---"
    Write-Host "Time: $($_.TimeCreated)"
    Write-Host "Level: $($_.LevelDisplayName)"
    Write-Host "Provider: $($_.ProviderName)"
    Write-Host "Message: $($_.Message)"
}

Get-WinEvent -FilterHashtable @{
    LogName = 'System'
    StartTime = $startTime
} -ErrorAction SilentlyContinue | Where-Object { $_.Message -like "*Cosmo*" -or $_.Message -like "*Symphony*" -or $_.Message -like "*Tauri*" -or $_.Message -like "*WebView2*" } | ForEach-Object {
    Write-Host "--- System Event Log ---"
    Write-Host "Time: $($_.TimeCreated)"
    Write-Host "Level: $($_.LevelDisplayName)"
    Write-Host "Provider: $($_.ProviderName)"
    Write-Host "Message: $($_.Message)"
}
