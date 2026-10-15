$ErrorActionPreference = 'Stop'
Push-Location (Join-Path (Split-Path -Parent $PSScriptRoot) 'tools')
try { npm.cmd run db; if ($LASTEXITCODE -ne 0) { throw 'Database gagal dijalankan.' } } finally { Pop-Location }
