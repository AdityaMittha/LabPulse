# LabPulse Agent Uninstaller — run as Administrator on Lab PC

param(
    [string]$InstallDir = "C:\LabPulse",
    [switch]$KeepConfig = $true
)

$ErrorActionPreference = "Continue"

Write-Host "====================================================" -ForegroundColor Red
Write-Host "       LabPulse Agent Automated Uninstaller         " -ForegroundColor Red
Write-Host "   Walchand Institute of Technology, Solapur        " -ForegroundColor Gray
Write-Host "====================================================" -ForegroundColor Red
Write-Host ""

# 1. Verify Administrator Privileges
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")) {
    Write-Error "Access Denied: Please right-click PowerShell and select 'Run as administrator'."
    exit 1
}

# 2. Stop running agent processes
Write-Host "[1/4] Stopping active LabPulse processes..." -ForegroundColor Yellow
$procNames = @("labpulse", "pythonw", "python")
foreach ($p in Get-Process -ErrorAction SilentlyContinue) {
    try {
        if ($p.Path -and $p.Path.StartsWith($InstallDir, [System.StringComparison]::OrdinalIgnoreCase)) {
            Write-Host "      Stopping process $($p.Name) (PID: $($p.Id))..." -ForegroundColor Gray
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        }
    } catch {}
}

# 3. Remove Windows Scheduled Tasks
Write-Host "[2/4] Unregistering scheduled tasks..." -ForegroundColor Yellow
Unregister-ScheduledTask -TaskName "LabPulse" -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "LabPulse-Shutdown" -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "      Tasks 'LabPulse' and 'LabPulse-Shutdown' removed." -ForegroundColor Green

# 4. Backup config.json if requested
$configFile = Join-Path $InstallDir "config.json"
$backupFile = "$env:TEMP\labpulse_config_backup.json"
if ($KeepConfig -and (Test-Path $configFile)) {
    Write-Host "[3/4] Backing up existing config.json to $backupFile..." -ForegroundColor Yellow
    Copy-Item $configFile -Destination $backupFile -Force
    Write-Host "      Config saved. Will be restored during new install." -ForegroundColor Green
} else {
    Write-Host "[3/4] Skipping config backup." -ForegroundColor Gray
}

# 5. Delete installation directory
Write-Host "[4/4] Removing installation folder ($InstallDir)..." -ForegroundColor Yellow
if (Test-Path $InstallDir) {
    # Small pause to release any file handles
    Start-Sleep -Seconds 1
    Remove-Item -Path $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path $InstallDir) {
        Write-Warning "Some files could not be immediately deleted. Forcing deletion..."
        Start-Sleep -Seconds 1
        cmd /c "rmdir /s /q `"$InstallDir`"" 2>$null
    }
}

if (!(Test-Path $InstallDir)) {
    Write-Host "      Folder $InstallDir successfully removed." -ForegroundColor Green
} else {
    Write-Warning "Some files in $InstallDir are locked. A reboot may be needed to complete folder cleanup."
}

Write-Host ""
Write-Host "====================================================" -ForegroundColor Green
Write-Host "     Previous Agent Version Uninstalled Successfully! " -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Green
Write-Host ""
Write-Host "To install the new agent version:" -ForegroundColor Cyan
Write-Host "1. Extract the new agent pack folder."
Write-Host "2. Open PowerShell as Administrator in the new agent folder."
Write-Host "3. Run:  powershell -ExecutionPolicy Bypass -File .\install.ps1"
Write-Host ""
