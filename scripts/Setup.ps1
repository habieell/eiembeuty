param([switch]$SkipPortableDatabase)
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
function Invoke-Checked([scriptblock]$Action) {
    & $Action
    if ($LASTEXITCODE -ne 0) { throw "Perintah gagal dengan exit code $LASTEXITCODE" }
}
Get-Command node, npm.cmd, go -ErrorAction Stop | Out-Null
Push-Location $ProjectRoot
try {
    if (-not (Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
    if (-not (Test-Path frontend/.env.local)) { Copy-Item frontend/.env.local.example frontend/.env.local }
    Push-Location frontend
    try { Invoke-Checked { npm.cmd ci --no-audit --no-fund } } finally { Pop-Location }
    if (-not $SkipPortableDatabase) {
        Push-Location tools
        try { Invoke-Checked { npm.cmd ci --no-audit --no-fund } } finally { Pop-Location }
    }
    Push-Location backend
    try { Invoke-Checked { go mod download } } finally { Pop-Location }
    Write-Host 'Setup selesai. Jalankan Start-Database.ps1, Start-Backend.ps1, lalu Start-Frontend.ps1 di tiga terminal.'
} finally { Pop-Location }
