@echo off
set PATH=C:\Program Files\nodejs;%PATH%
set PROJECT=D:\usuario\OneDrive\Área de Trabalho\dashboard\financas-familia-v2
cd /d "%PROJECT%"

echo [1/3] Instalando dependencias base...
"C:\Program Files\nodejs\npm.cmd" install

echo [2/3] Instalando dependencias do projeto...
"C:\Program Files\nodejs\npm.cmd" install recharts zustand react-router-dom @supabase/supabase-js

echo [3/3] Instalando devDependencies...
"C:\Program Files\nodejs\npm.cmd" install -D tailwindcss@3 postcss autoprefixer @types/node

echo Inicializando Tailwind CSS...
"C:\Program Files\nodejs\node.exe" node_modules\.bin\tailwindcss init -p

echo.
echo Tudo pronto!
pause
