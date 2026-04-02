$npm = "C:\Program Files\nodejs\npm.cmd"
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
Set-Location $PSScriptRoot
Write-Host "Rodando build..." -ForegroundColor Cyan
& $npm run build 2>&1
