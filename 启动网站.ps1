param(
    [switch]$Check,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "Node.js was not found. Install Node.js or add node.exe to PATH." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}

if ($Check) {
    Write-Host "Launcher syntax is valid."
    & $node.Source --version
    exit 0
}

if (-not $NoBrowser) {
    Start-Job {
        Start-Sleep -Seconds 2
        Start-Process "http://127.0.0.1:4173"
    } | Out-Null
}

Write-Host "Starting Job Compass at http://127.0.0.1:4173" -ForegroundColor Green
Write-Host "Keep this window open. Press Ctrl+C to stop the server."
& $node.Source "$PSScriptRoot\server.mjs"

Write-Host "The server has stopped." -ForegroundColor Yellow
Read-Host "Press Enter to close"
