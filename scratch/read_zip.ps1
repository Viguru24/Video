[System.Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem') | Out-Null
$zipPath = 'C:\Users\louis\OneDrive\Documents\GitHub\CosmoSymphony_backup_2026-05-21_13-45.zip'
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$i = 0
$zip.Entries | ForEach-Object {
    if ($_.FullName -like '*App.tsx*' -or $_.FullName -like '*VideoCard.tsx*' -or $_.FullName -like '*ControlBar.tsx*' -or $_.FullName -like '*useStore.ts*' -or $_.FullName -like '*types.ts*' -or $_.FullName -like '*index.css*' -or $_.FullName -like '*SymphonyWorkshop.tsx*' -or $_.FullName -like '*VideoGrid.tsx*') {
        [PSCustomObject]@{
            Index = $i
            FullName = $_.FullName
            Length = $_.Length
            LastWriteTime = $_.LastWriteTime
        }
    }
    $i++
} | Format-Table -AutoSize
$zip.Dispose()
