# LabPulse Agent Installer — run as Administrator on each lab PC

param(
    [string]$InstallDir = "C:\LabPulse",
    [string]$ConfigFile = ".\config.json",
    [string]$MachineId  = "",
    [string]$ApiKey     = "",
    [string]$LabId      = ""
)

$ErrorActionPreference = "Stop"

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "       LabPulse Agent Automated Installer           " -ForegroundColor Cyan
Write-Host "   Walchand Institute of Technology, Solapur        " -ForegroundColor Gray
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Administrator Privileges
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")) {
    Write-Error "Access Denied: Please right-click PowerShell and select 'Run as administrator'."
    exit 1
}

# 2. Create Target Install Directory
Write-Host "[1/5] Creating install directory at $InstallDir..." -ForegroundColor Yellow
if (!(Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
}
$LogsDir = Join-Path $InstallDir "logs"
if (!(Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null
}

# 3. Detect and Deploy Payload (Binary EXE vs Python Source)
$IsBinary = Test-Path ".\dist\labpulse.exe"
$LogonCmd = ""
$ShutdownCmd = ""

if ($IsBinary) {
    Write-Host "[2/5] Deploying standalone binary executable..." -ForegroundColor Yellow
    Copy-Item ".\dist\labpulse.exe" -Destination "$InstallDir\labpulse.exe" -Force
    $LogonCmd    = "`"$InstallDir\labpulse.exe`""
    $ShutdownCmd = "`"$InstallDir\labpulse.exe`" --shutdown-sync"
} else {
    Write-Host "[2/5] Deploying Python agent package..." -ForegroundColor Yellow
    
    # Check for system Python
    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if (!$pythonCmd) {
        Write-Error "Python 3.10+ was not found in system PATH. Please install Python and ensure 'Add python.exe to PATH' is checked."
        exit 1
    }

    # Copy src files
    Copy-Item ".\src" -Destination "$InstallDir\src" -Recurse -Force
    if (Test-Path ".\requirements.txt") {
        Copy-Item ".\requirements.txt" -Destination "$InstallDir\requirements.txt" -Force
    }

    # Set up Virtual Environment in InstallDir
    $VenvPath = Join-Path $InstallDir "venv"
    if (!(Test-Path "$VenvPath\Scripts\python.exe")) {
        Write-Host "      Creating Python virtual environment in $VenvPath..." -ForegroundColor Gray
        & python -m venv $VenvPath
    }

    Write-Host "      Installing required dependencies (requests, pynput, pywin32, comtypes)..." -ForegroundColor Gray
    & "$VenvPath\Scripts\pip.exe" install --quiet --disable-pip-version-check -r "$InstallDir\requirements.txt"

    $PythonwExe = Join-Path $VenvPath "Scripts\pythonw.exe"
    $MainScript = Join-Path $InstallDir "src\main.py"
    $LogonCmd    = "`"$PythonwExe`" `"$MainScript`""
    $ShutdownCmd = "`"$PythonwExe`" `"$MainScript`" --shutdown-sync"
}

# 4. Configure Machine Settings (config.json)
Write-Host "[3/5] Configuring agent settings..." -ForegroundColor Yellow
$TargetConfig = Join-Path $InstallDir "config.json"

if (Test-Path $ConfigFile) {
    Copy-Item $ConfigFile -Destination $TargetConfig -Force
} elseif (!(Test-Path $TargetConfig)) {
    # If sample exists, copy sample
    if (Test-Path ".\config.json.example") {
        Copy-Item ".\config.json.example" -Destination $TargetConfig -Force
    }
}

# Update config overrides if passed via CLI arguments
if (Test-Path $TargetConfig) {
    try {
        $json = Get-Content $TargetConfig -Raw | ConvertFrom-Json
        $dirty = $false
        if ($MachineId) { $json.machine_id = $MachineId; $dirty = $true }
        if ($ApiKey)    { $json.api_key    = $ApiKey;    $dirty = $true }
        if ($LabId)     { $json.lab_id     = $LabId;     $dirty = $true }
        if ($dirty) {
            $json | ConvertTo-Json -Depth 5 | Set-Content $TargetConfig -Force
            Write-Host "      Updated config.json with specified machine/lab parameters." -ForegroundColor Green
        }
    } catch {
        Write-Warning "Could not parse or update $TargetConfig: $_"
    }
}

# 5. Register Startup / Logon Task (Runs on User Logon)
Write-Host "[4/5] Registering logon Task Scheduler job..." -ForegroundColor Yellow
$TaskName = "LabPulse"
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$Action = if ($IsBinary) {
    New-ScheduledTaskAction -Execute "$InstallDir\labpulse.exe"
} else {
    New-ScheduledTaskAction -Execute "$InstallDir\venv\Scripts\pythonw.exe" -Argument "`"$InstallDir\src\main.py`""
}

$Trigger  = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 12) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew

$Principal = New-ScheduledTaskPrincipal -UserId "BUILTIN\Users" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Description "LabPulse computer lab usage monitoring agent - Walchand Institute of Technology, Solapur" | Out-Null

# 6. Register Shutdown Sync Task (Runs on Windows Event ID 1074)
Write-Host "[5/5] Registering pre-shutdown telemetry sync job..." -ForegroundColor Yellow
$ShutdownTaskName = "LabPulse-Shutdown"
Unregister-ScheduledTask -TaskName $ShutdownTaskName -Confirm:$false -ErrorAction SilentlyContinue

try {
    $schArgs = @(
        "/create",
        "/tn", "`"$ShutdownTaskName`"",
        "/tr", $ShutdownCmd,
        "/sc", "ONEVENT",
        "/ec", "System",
        "/mo", "*[System[Provider[@Name='USER32'] and (EventID=1074)]]",
        "/ru", "SYSTEM",
        "/f"
    )
    $proc = Start-Process -FilePath "schtasks.exe" -ArgumentList $schArgs -Wait -PassThru -NoNewWindow
    if ($proc.ExitCode -eq 0) {
        Write-Host "      Pre-shutdown interceptor registered (Event ID 1074)." -ForegroundColor Green
    } else {
        Write-Warning "schtasks returned exit code $($proc.ExitCode) registering shutdown task."
    }
} catch {
    Write-Warning "Could not register shutdown task: $_"
}

Write-Host ""
Write-Host "====================================================" -ForegroundColor Green
Write-Host "         LabPulse Agent Installed Successfully!     " -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Green
Write-Host "Installation Directory : $InstallDir"
Write-Host "Configuration File     : $InstallDir\config.json"
Write-Host "Startup Task           : $TaskName (Triggers lock screen on user logon)"
Write-Host "Shutdown Task          : $ShutdownTaskName (Syncs sessions on PC shutdown)"
Write-Host ""
Write-Host "Verification Checklist:" -ForegroundColor Cyan
Write-Host "1. Ensure machine_id and api_key in $InstallDir\config.json match Admin -> Machines."
Write-Host "2. Log off or restart this PC to test the full-screen student PNR login screen."
Write-Host "3. Log in with student PNR to verify real-time status in dashboard."
Write-Host ""
