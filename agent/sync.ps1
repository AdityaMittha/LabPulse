# LabPulse - Single Command Cloud Data Sync for PowerShell
param(
    [string]$InstallDir = "C:\LabPulse"
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ($ScriptDir -and (Test-Path "$ScriptDir\config.json")) {
    $InstallDir = $ScriptDir
} elseif (!(Test-Path "$InstallDir\config.json")) {
    if (Test-Path ".\config.json") {
        $InstallDir = (Get-Location).Path
    }
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "       LabPulse Agent - Immediate Cloud Data Sync           " -ForegroundColor Cyan
Write-Host "   Walchand Institute of Technology, Solapur                " -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Agent Directory: $InstallDir" -ForegroundColor Gray
Write-Host ""

$PythonExe = Join-Path $InstallDir "venv\Scripts\python.exe"
if (!(Test-Path $PythonExe)) {
    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($cmd) { $PythonExe = $cmd.Source }
}

if (!(Test-Path $PythonExe)) {
    Write-Error "Python executable not found in $InstallDir\venv or system PATH."
    exit 1
}

$SendNowScript = Join-Path $InstallDir "send_now.py"
if (!(Test-Path $SendNowScript)) {
    Write-Error "send_now.py was not found in $InstallDir."
    exit 1
}

& $PythonExe $SendNowScript $args
