@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title ClientPilot Dev
echo Starting ClientPilot (tauri:dev)...
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found on PATH. Install Node 20+ and try again.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo node_modules missing — running npm install...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
  echo.
)

REM Load MSVC linker env if Visual Studio Build Tools are installed
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if exist "%VSWHERE%" (
  for /f "usebackq delims=" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do (
    if exist "%%i\VC\Auxiliary\Build\vcvars64.bat" (
      call "%%i\VC\Auxiliary\Build\vcvars64.bat" >nul
    )
  )
)

set "CARGO_TARGET_DIR=%cd%\src-tauri\target"

call npm run tauri:dev
echo.
echo ClientPilot exited with code %ERRORLEVEL%.
pause
