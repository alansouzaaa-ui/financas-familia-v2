$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
Set-Location $PSScriptRoot

$git = "git"

Write-Host "Removendo remote antigo se existir..." -ForegroundColor Yellow
& $git remote remove origin 2>$null

Write-Host "Conectando ao GitHub..." -ForegroundColor Cyan
& $git remote add origin https://github.com/alansouzaaa-ui/financas-familia-v2.git

Write-Host "Enviando para o GitHub (pode pedir login)..." -ForegroundColor Yellow
& $git push -u origin main

Write-Host ""
Write-Host "Concluido!" -ForegroundColor Green
Write-Host "Repositorio: https://github.com/alansouzaaa-ui/financas-familia-v2" -ForegroundColor Green
Write-Host "Site (apos ~2min): https://alansouzaaa-ui.github.io/financas-familia-v2/" -ForegroundColor Green
