$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$url = "http://127.0.0.1:41234"
$env:NEXT_TELEMETRY_DISABLED = "1"

if (-not (Test-Path node_modules)) {
    Write-Host "Installing dependencies..."
    npm install
}

# Rebuild when there is no build yet or any source file is newer than it.
$buildId = ".next\BUILD_ID"
$needsBuild = -not (Test-Path $buildId)
if (-not $needsBuild) {
    $built = (Get-Item $buildId).LastWriteTime
    $newest = Get-ChildItem src, package.json, next.config.ts -Recurse -File |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $needsBuild = $newest.LastWriteTime -gt $built
}
if ($needsBuild) {
    Write-Host "Building..."
    npm run build
}

# Open the browser once the server answers.
Start-Job -ScriptBlock {
    param($u)
    for ($i = 0; $i -lt 60; $i++) {
        try { Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 2 | Out-Null; Start-Process $u; return } catch { Start-Sleep 1 }
    }
} -ArgumentList $url | Out-Null

Write-Host "Spent running at $url  (close this window to stop)"
npm start
