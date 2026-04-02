$node = "C:\Program Files\nodejs\node.exe"
$npm  = "C:\Program Files\nodejs\npm.cmd"
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH

# Muda para o diretorio do script
Set-Location $PSScriptRoot
Write-Host "Diretorio: $PSScriptRoot" -ForegroundColor Yellow

Write-Host "[1/3] Instalando dependencias base..." -ForegroundColor Cyan
& $npm install

Write-Host "[2/3] Instalando dependencias do projeto..." -ForegroundColor Cyan
& $npm install recharts zustand react-router-dom "@supabase/supabase-js"

Write-Host "[3/3] Instalando devDependencies..." -ForegroundColor Cyan
& $npm install -D "tailwindcss@3" postcss autoprefixer "@types/node"

Write-Host "[4/4] Inicializando Tailwind CSS..." -ForegroundColor Cyan
& $node "node_modules\.bin\tailwindcss" init -p

Write-Host "Dependencias instaladas!" -ForegroundColor Green
