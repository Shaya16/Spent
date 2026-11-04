# Start Spent in Docker and open it in the browser.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$url = "http://127.0.0.1:41234"

docker version *> $null
if ($LASTEXITCODE -ne 0) { Write-Host "Docker is not running. Start Docker Desktop and try again."; exit 1 }

# Lets the update check compare the running version with the newest one.
$env:SPENT_COMMIT = (git rev-parse --short HEAD 2>$null)
if (-not $env:SPENT_COMMIT) { $env:SPENT_COMMIT = "unknown" }

Write-Host "Building and starting Spent (the first build takes a few minutes)..."
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed. See the messages above."; exit 1 }

for ($i = 0; $i -lt 40; $i++) {
    if ((docker inspect --format "{{.State.Health.Status}}" spent 2>$null) -eq "healthy") {
        Write-Host "Spent is running at $url"
        Start-Process $url
        exit 0
    }
    Start-Sleep 3
}
Write-Host "Spent did not become healthy. Logs:"
docker compose logs --tail 30 spent
exit 1
