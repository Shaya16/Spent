# Update Spent safely: back up the data, build the new version (its tests run during the build),
# switch to it, and roll back to the previous image if it does not come up healthy.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Wait-Healthy {
    for ($i = 0; $i -lt 40; $i++) {
        if ((docker inspect --format "{{.State.Health.Status}}" spent 2>$null) -eq "healthy") { return $true }
        Start-Sleep 3
    }
    return $false
}

docker version *> $null
if ($LASTEXITCODE -ne 0) { Write-Host "Docker is not running. Start Docker Desktop and try again."; exit 1 }

# 1. Get the newest code. --ff-only never overwrites local changes; it stops instead.
if (git remote) {
    git pull --ff-only
    if ($LASTEXITCODE -ne 0) { Write-Host "Could not fast-forward (local changes or diverged history). Nothing was changed."; exit 1 }
} else {
    Write-Host "No git remote configured: rebuilding the code that is here."
}

# 2. Back up the database and encryption key inside the data volume (newest five are kept).
if ((docker inspect --format "{{.State.Running}}" spent 2>$null) -eq "true") {
    docker compose exec -T spent node scripts/backup-data.mjs /data
    if ($LASTEXITCODE -ne 0) { Write-Host "Backup failed. Nothing was changed."; exit 1 }
}

# 3. Keep the current image so we can go back to it.
docker image inspect spent:latest *> $null
$hadPrevious = ($LASTEXITCODE -eq 0)
if ($hadPrevious) { docker tag spent:latest spent:previous }

# 4. Build. If the new version's tests fail, no image is produced and the running version is untouched.
$env:SPENT_COMMIT = (git rev-parse --short HEAD 2>$null)
if (-not $env:SPENT_COMMIT) { $env:SPENT_COMMIT = "unknown" }
docker compose build
if ($LASTEXITCODE -ne 0) {
    if ($hadPrevious) { docker tag spent:previous spent:latest }
    Write-Host "Build or tests failed. Spent keeps running the previous version."
    exit 1
}

# 5. Switch, and roll back if the new version is not healthy.
docker compose up -d
if (Wait-Healthy) {
    Write-Host "Updated to $env:SPENT_COMMIT."
    exit 0
}
Write-Host "The new version did not become healthy. Rolling back."
docker compose logs --tail 30 spent
if ($hadPrevious) {
    docker tag spent:previous spent:latest
    docker compose up -d --no-build
    if (Wait-Healthy) { Write-Host "Rolled back to the previous version." } else { Write-Host "Rollback did not come up healthy either. Your data is backed up in the volume under /data/backups." }
}
exit 1
