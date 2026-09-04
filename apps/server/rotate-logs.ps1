# Log Rotation Script for Pi Agent
# This script rotates logs/out.log and logs/err.log when they exceed 100MB
# Run this script via Windows Task Scheduler or periodically via PM2

$logDir = "D:\Project\pi-agent\apps\server\logs"
$maxSize = 100MB
$retainCount = 7

# Rotate out.log
$outLog = Join-Path $logDir "out.log"
if (Test-Path $outLog) {
    $fileInfo = Get-Item $outLog
    if ($fileInfo.Length -gt $maxSize) {
        $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
        $archive = Join-Path $logDir "out-$timestamp.log"
        Move-Item $outLog $archive -Force
        Write-Host "Rotated out.log to out-$timestamp.log"
        
        # Compress archive
        Compress-Archive -Path $archive -DestinationPath "$archive.zip" -Force
        Remove-Item $archive -Force
        Write-Host "Compressed to out-$timestamp.log.zip"
        
        # Clean old archives
        $archives = Get-ChildItem -Path $logDir -Filter "out-*.log.zip" | Sort-Object LastWriteTime -Descending
        if ($archives.Count -gt $retainCount) {
            $archives | Select-Object -Skip $retainCount | ForEach-Object {
                Remove-Item $_.FullName -Force
                Write-Host "Removed old archive: $($_.Name)"
            }
        }
    }
}

# Rotate err.log
$errLog = Join-Path $logDir "err.log"
if (Test-Path $errLog) {
    $fileInfo = Get-Item $errLog
    if ($fileInfo.Length -gt $maxSize) {
        $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
        $archive = Join-Path $logDir "err-$timestamp.log"
        Move-Item $errLog $archive -Force
        Write-Host "Rotated err.log to err-$timestamp.log"
        
        # Compress archive
        Compress-Archive -Path $archive -DestinationPath "$archive.zip" -Force
        Remove-Item $archive -Force
        Write-Host "Compressed to err-$timestamp.log.zip"
        
        # Clean old archives
        $archives = Get-ChildItem -Path $logDir -Filter "err-*.log.zip" | Sort-Object LastWriteTime -Descending
        if ($archives.Count -gt $retainCount) {
            $archives | Select-Object -Skip $retainCount | ForEach-Object {
                Remove-Item $_.FullName -Force
                Write-Host "Removed old archive: $($_.Name)"
            }
        }
    }
}
