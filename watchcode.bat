@echo off
REM Abre o Watch Code (fork em desenvolvimento) com perfil isolado e workspace aberto.
REM Uso: watchcode.bat [pasta-do-workspace]

setlocal
set "ROOT=%~dp0"
set "EXE=%ROOT%.build\electron\Code - OSS.exe"
set "UDD=%LOCALAPPDATA%\watchcode-udd"
set "EXT=%LOCALAPPDATA%\watchcode-ext"
set "WORKSPACE=%~1"
if "%WORKSPACE%"=="" set "WORKSPACE=%ROOT:~0,-1%"

if not exist "%EXE%" (
  echo ERRO: executavel nao encontrado em "%EXE%"
  echo Rode "npm run compile-client" e "npm run electron" primeiro.
  pause
  exit /b 1
)

set "NODE_ENV=development"
set "VSCODE_DEV=1"
set "VSCODE_CLI=1"
set "VSCODE_SKIP_PRELAUNCH=1"

echo Abrindo Watch Code...
echo   workspace : %WORKSPACE%
echo   perfil    : %UDD%
start "" "%EXE%" "%ROOT:~0,-1%" --user-data-dir="%UDD%" --extensions-dir="%EXT%" --disable-workspace-trust --folder-uri="file:///%WORKSPACE:\=/%"
endlocal
