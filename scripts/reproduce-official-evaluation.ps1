$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot

$Database = Join-Path `
    $RepoRoot `
    "data\official\experiment-official.db"

$ChecksumFile = Join-Path `
    $RepoRoot `
    "results\detection\official\experiment-official.sha256"

Write-Host ""
Write-Host "============================================================"
Write-Host " API Anomaly Detection - Official Evaluation Reproduction"
Write-Host "============================================================"
Write-Host ""

if (-not (Test-Path $Database)) {
    throw "Official database not found: $Database"
}

if (-not (Test-Path $ChecksumFile)) {
    throw "Checksum file not found: $ChecksumFile"
}

Write-Host "1. Validating official dataset checksum..."

$ExpectedHash = (Get-Content $ChecksumFile).Trim()
$ActualHash = (Get-FileHash $Database -Algorithm SHA256).Hash

Write-Host "   Expected: $ExpectedHash"
Write-Host "   Actual  : $ActualHash"

if ($ExpectedHash -ne $ActualHash) {
    throw "Official database checksum validation failed."
}

Write-Host "   Checksum OK."
Write-Host ""

Set-Location $RepoRoot

Write-Host "2. Starting anomaly-service..."
docker compose up -d --build anomaly-service

if ($LASTEXITCODE -ne 0) {
    throw "Failed to start anomaly-service."
}

Write-Host ""
Write-Host "3. Copying official experimental database..."

docker cp `
    $Database `
    anomaly-service:/tmp/experiment-official.db

if ($LASTEXITCODE -ne 0) {
    throw "Failed to copy official database."
}

Write-Host ""
Write-Host "4. Reproducing official evaluation..."
Write-Host ""

docker exec `
    -e EXPERIMENT_DB_PATH=/tmp/experiment-official.db `
    anomaly-service `
    python -m app.services.model_evaluation

if ($LASTEXITCODE -ne 0) {
    throw "Official evaluation reproduction failed."
}

Write-Host ""
Write-Host "============================================================"
Write-Host " Reproduction completed successfully."
Write-Host "============================================================"