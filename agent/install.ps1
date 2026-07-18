# LabPulse Agent Installer
# Walchand Institute of Technology, Solapur
# Run as Administrator on each lab PC

param(
    [string]$InstallDir = "C:\LabPulse",
    [string]$ConfigFile = ".\config.json"
)

$ErrorActionPreference = "Stop"

Write-Host "=== LabPulse Agent Installer ===" -ForegroundColor Cyan
Write-Host "Walchand Institute of Technology, Solapur" -ForegroundColor Gray

# Check admin
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")) {
    Write-Error "Please run this script as Administrator."
    exit 1
}

# Create install directory
Write-Host "`nCreating install directory: $InstallDir"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# Copy files
Write-Host "Copying LabPulse agent..."
Copy-Item ".\dist\labpulse.exe" -Destination "$InstallDir\labpulse.exe" -Force

if (Test-Path $ConfigFile) {
    Copy-Item $ConfigFile -Destination "$InstallDir\config.json" -Force
    Write-Host "Config file copied."
} else {
    Write-Warning "config.json not found at $ConfigFile — copy it manually to $InstallDir\config.json"
}

# Register Scheduled Task (runs at logon for any user)
$TaskName = "LabPulse"
$Action   = New-ScheduledTaskAction -Execute "$InstallDir\labpulse.exe"
$Trigger  = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 12) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew

$Principal = New-ScheduledTaskPrincipal -UserId "BUILTIN\Users" -LogonType Interactive -RunLevel Limited

# Remove existing task if present
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Description "LabPulse computer lab usage monitoring agent — Walchand Institute of Technology, Solapur" | Out-Null

Write-Host "`n✅ Installation complete!" -ForegroundColor Green
Write-Host "   Installed to  : $InstallDir"
Write-Host "   Scheduled Task: $TaskName (runs at Windows logon)"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Edit $InstallDir\config.json with the correct machine_id, lab_id, and api_key"
Write-Host "  2. Log out and back in to test — the agent should start automatically"
Write-Host "  3. Check logs at $InstallDir\logs\"
