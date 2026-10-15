$ErrorActionPreference = 'Stop'
Push-Location (Join-Path (Split-Path -Parent $PSScriptRoot) 'frontend')
try { npm.cmd run dev; if ($LASTEXITCODE -ne 0) { throw 'Frontend gagal dijalankan.' } } finally { Pop-Location }
