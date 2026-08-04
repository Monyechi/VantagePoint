$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $MyInvocation.MyCommand.Path -Parent) -Parent
Set-Location $Root

$existing = Get-Process -Name "clientpilot" -ErrorAction SilentlyContinue
if ($existing) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
  foreach ($p in $existing) {
    if ($p.MainWindowHandle -ne [IntPtr]::Zero) {
      [Win]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
      [Win]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
    }
  }
  exit 0
}

$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vswhere) {
  $vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  if ($vsPath) {
    cmd /c "`"$vsPath\VC\Auxiliary\Build\vcvars64.bat`" && set" | ForEach-Object {
      if ($_ -match "^([^=]+)=(.*)$") {
        [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2])
      }
    }
  }
}

$env:CARGO_TARGET_DIR = Join-Path $Root "src-tauri\target"
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("Path","User") + ";" +
            $env:Path

npm run tauri:dev
