$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
Set-Location $PSScriptRoot

$git = "git"

Write-Host "Configurando identidade git..." -ForegroundColor Cyan
& $git config --global user.email "a.souzaaa@gmail.com"
& $git config --global user.name "Alan Souza"

Write-Host "Inicializando repositorio git..." -ForegroundColor Cyan
& $git init
& $git branch -M main

Write-Host "Adicionando arquivos..." -ForegroundColor Cyan
& $git add .

Write-Host "Criando commit inicial..." -ForegroundColor Cyan
& $git commit -m "feat: dashboard financeiro v2 - React + TypeScript + Tailwind + Recharts"

Write-Host "Conectando ao GitHub..." -ForegroundColor Cyan
& $git remote add origin https://github.com/alansouzaaa-ui/financas-familia-v2.git

Write-Host "Enviando para o GitHub..." -ForegroundColor Yellow
& $git push -u origin main

Write-Host "Concluido! Acesse:" -ForegroundColor Green
Write-Host "https://github.com/alansouzaaa-ui/financas-familia-v2" -ForegroundColor Green
