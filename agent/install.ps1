# LabPulse Agent Installer — run as Administrator on each lab PC

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
Write-Host "Creating install directory: $InstallDir"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# Copy files
Write-Host "Copying LabPulse agent..."
Copy-Item ".\dist\labpulse.exe" -Destination "$InstallDir\labpulse.exe" -Force

if (Test-Path $ConfigFile) {
    Copy-Item $ConfigFile -Destination "$InstallDir\config.json" -Force
    Write-Host "Config file copied."
} else {
    Write-Warning "config.json not found at $ConfigFile - copy it manually to $InstallDir\config.json"
}

# Register Scheduled Task for Startup / Logon (runs at logon for any user)
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
    -Description "LabPulse computer lab usage monitoring agent - Walchand Institute of Technology, Solapur" | Out-Null

# Register Scheduled Task for Shutdown Sync (runs before shutdown/restart)
$ShutdownTaskName = "LabPulse-Shutdown"
Unregister-ScheduledTask -TaskName $ShutdownTaskName -Confirm:$false -ErrorAction SilentlyContinue

try {
    $schArgs = @(
        "/create",
        "/tn", "`"$ShutdownTaskName`"",
        "/tr", "`"`"$InstallDir\labpulse.exe`" --shutdown-sync`"",
        "/sc", "ONEVENT",
        "/ec", "System",
        "/mo", "*[System[Provider[@Name='USER32'] and (EventID=1074)]]",
        "/ru", "SYSTEM",
        "/f"
    )
    $proc = Start-Process -FilePath "schtasks.exe" -ArgumentList $schArgs -Wait -PassThru -NoNewWindow
    if ($proc.ExitCode -eq 0) {
        Write-Host "Registered shutdown task: $ShutdownTaskName" -ForegroundColor Green
    } else {
        Write-Warning "schtasks returned exit code $($proc.ExitCode) while registering shutdown task."
    }
} catch {
    Write-Warning "Could not register shutdown task: $_"
}

Write-Host "Installation complete!" -ForegroundColor Green
Write-Host "   Installed to   : $InstallDir"
Write-Host "   Logon Task     : $TaskName (starts agent on Windows logon)"
Write-Host "   Shutdown Task  : $ShutdownTaskName (runs --shutdown-sync on PC shutdown/restart)"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Edit $InstallDir\config.json with the correct machine_id, lab_id, and api_key"
Write-Host "  2. Log out and back in to test - the agent should start automatically and prompt for PNR"
Write-Host "  3. Check logs at $InstallDir\logs"

