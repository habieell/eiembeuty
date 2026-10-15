$ErrorActionPreference = 'Stop'
Push-Location (Join-Path (Split-Path -Parent $PSScriptRoot) 'backend')
try {
    go run . migrate
    if ($LASTEXITCODE -ne 0) { throw 'Migrasi gagal. Pastikan database berjalan dan DATABASE_URL benar.' }
    go run .
    if ($LASTEXITCODE -ne 0) { throw 'Backend gagal dijalankan.' }
} finally { Pop-Location }
