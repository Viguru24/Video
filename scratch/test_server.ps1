try {
    $response = Invoke-WebRequest -Uri 'http://localhost:55173/' -TimeoutSec 10 -UseBasicParsing
    Write-Host "Status: $($response.StatusCode)"
    Write-Host "Content Length: $($response.Content.Length)"
    $preview = $response.Content.Substring(0, [Math]::Min(500, $response.Content.Length))
    Write-Host $preview
} catch {
    Write-Host "Failed: $($_.Exception.Message)"
}
