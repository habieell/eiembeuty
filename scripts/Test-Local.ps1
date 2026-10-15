param([string]$TestDatabaseUrl = 'postgres://eiem:eiem_local_password@127.0.0.1:5432/eiembeauty?sslmode=disable', [switch]$SkipBrowser)
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PreviousTestUrl = $env:TEST_DATABASE_URL
try {
    $env:TEST_DATABASE_URL = $TestDatabaseUrl
    Push-Location (Join-Path $ProjectRoot 'backend')
    try {
        go test -count=1 -v ./...
        if ($LASTEXITCODE -ne 0) { throw 'Pengujian Go gagal.' }
    } finally { Pop-Location }
    Push-Location (Join-Path $ProjectRoot 'frontend')
    try {
        npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Build frontend gagal.' }
        if (-not $SkipBrowser) {
            npm.cmd run test:e2e
            if ($LASTEXITCODE -ne 0) { throw 'Pengujian browser gagal.' }
        }
    } finally { Pop-Location }
} finally { $env:TEST_DATABASE_URL = $PreviousTestUrl }
