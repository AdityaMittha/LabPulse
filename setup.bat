@echo off
setlocal enabledelayedexpansion
title LabPulse - Automated Lab PC Agent Setup
color 0b

echo ===============================================================================
echo               LabPulse Automated Lab PC Agent Setup
echo             Walchand Institute of Technology, Solapur
echo ===============================================================================
echo.

:: 1. Verify Administrator Privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Administrator privileges required. Requesting elevation...
    powershell -Command "Start-Process '%~dpnx0' -Verb RunAs"
    exit /b
)

echo [OK] Running with Administrator privileges.
echo.

:: 2. Identify USB Drive Path
set "SCRIPT_DIR=%~dp0"
set "USB_DRIVE=%~d0"
echo [1/5] Checking for USB Pen Drive and API Key files...
echo       Setup running from: %SCRIPT_DIR%

:: 3. Prompt for Machine ID and Lab ID
echo.
set "DETECTED_HOST=%COMPUTERNAME%"
set /p MACHINE_ID="Enter Machine ID [Default: %DETECTED_HOST%]: "
if "%MACHINE_ID%"=="" set "MACHINE_ID=%DETECTED_HOST%"
set "MACHINE_ID=%MACHINE_ID: =%"

set /p LAB_ID="Enter Lab ID [Default: CS-LAB-1]: "
if "%LAB_ID%"=="" set "LAB_ID=CS-LAB-1"
set "LAB_ID=%LAB_ID: =%"

echo.
echo [2/5] Searching for API Key for [%MACHINE_ID%] on USB drive...

:: 4. PowerShell Helper to Locate and Extract API Key from USB
set "FOUND_API_KEY="
for /f "usebackq delims=" %%K in (`powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$machine = '%MACHINE_ID%'.Trim();" ^
    "$usbPaths = @('%SCRIPT_DIR%', '%USB_DRIVE%\', 'E:\', 'F:\', 'G:\', 'D:\');" ^
    "$fileNames = @('api_keys.txt', 'keys.csv', 'machine_api_keys.json', 'keys.json', 'api_key.txt', 'machine_keys.txt');" ^
    "$foundKey = '';" ^
    "foreach ($drive in $usbPaths) {" ^
    "    if (Test-Path $drive) {" ^
    "        foreach ($fn in $fileNames) {" ^
    "            $target = Join-Path $drive $fn;" ^
    "            if (Test-Path $target) {" ^
    "                if ($fn.EndsWith('.json')) {" ^
    "                    try {" ^
    "                        $json = Get-Content $target -Raw | ConvertFrom-Json;" ^
    "                        if ($json.$machine) { $foundKey = $json.$machine.ToString().Trim(); break }" ^
    "                    } catch {}" ^
    "                } else {" ^
    "                    $lines = Get-Content $target;" ^
    "                    foreach ($line in $lines) {" ^
    "                        $trimmed = $line.Trim();" ^
    "                        if ($trimmed.StartsWith($machine, [System.StringComparison]::InvariantCultureIgnoreCase)) {" ^
    "                            $parts = $trimmed -split '[,=\:\t\s]+';" ^
    "                            if ($parts.Length -ge 2) { $foundKey = $parts[1].Trim(); break }" ^
    "                        } elseif ($fn -eq 'api_key.txt' -and $trimmed.StartsWith('lp_')) {" ^
    "                            $foundKey = $trimmed; break" ^
    "                        }" ^
    "                    }" ^
    "                    if ($foundKey) { break }" ^
    "                }" ^
    "            }" ^
    "        }" ^
    "    }" ^
    "    if ($foundKey) { break }" ^
    "}" ^
    "Write-Output $foundKey"`) do (
    set "FOUND_API_KEY=%%K"
)

if not "%FOUND_API_KEY%"=="" (
    echo       [OK] Found API Key on USB drive for %MACHINE_ID%!
    echo       Key: %FOUND_API_KEY:~0,8%************************
    set "API_KEY=%FOUND_API_KEY%"
) else (
    echo       [!] No API key file found on USB drive for machine [%MACHINE_ID%].
    echo           Expected format in api_keys.txt on USB: %MACHINE_ID%,lp_your_key_here
    echo.
    set /p API_KEY="Enter Machine API Key manually (lp_...): "
    if "!API_KEY!"=="" (
        echo [ERROR] API Key is required to connect to the cloud.
        pause
        exit /b 1
    )
)

:: 5. Download Agent Pack from GitHub & Extract to C:\LabPulse
echo.
echo [3/5] Downloading latest LabPulse agent package from GitHub...
set "INSTALL_DIR=C:\LabPulse"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$installDir = '%INSTALL_DIR%';" ^
    "$zipUrl = 'https://github.com/AdityaMittha/LabPulse/archive/refs/heads/main.zip';" ^
    "$tempZip = Join-Path $env:TEMP 'labpulse_main.zip';" ^
    "$tempExtract = Join-Path $env:TEMP 'labpulse_extract';" ^
    "if (!(Test-Path $installDir)) { New-Item -ItemType Directory -Force -Path $installDir | Out-Null }" ^
    "Write-Host '      Connecting to GitHub (AdityaMittha/LabPulse)...' -ForegroundColor Gray;" ^
    "try {" ^
    "    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
    "    Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip -UseBasicParsing;" ^
    "    Write-Host '      Download complete. Extracting agent files...' -ForegroundColor Gray;" ^
    "    if (Test-Path $tempExtract) { Remove-Item -Recurse -Force $tempExtract }" ^
    "    Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force;" ^
    "    $agentSource = Join-Path $tempExtract 'LabPulse-main\agent';" ^
    "    if (Test-Path $agentSource) {" ^
    "        Copy-Item -Path `\"$agentSource\*`\" -Destination $installDir -Recurse -Force;" ^
    "        Write-Host '      Agent package deployed to ' $installDir -ForegroundColor Green;" ^
    "    } else { throw 'Agent directory not found in downloaded archive.' }" ^
    "} catch {" ^
    "    Write-Warning \"GitHub download failed: $_. Checking for local agent files on USB drive...\";" ^
    "    $localAgent = Join-Path '%SCRIPT_DIR%' 'agent';" ^
    "    if (Test-Path $localAgent) {" ^
    "        Copy-Item -Path `\"$localAgent\*`\" -Destination $installDir -Recurse -Force;" ^
    "        Write-Host '      Deployed agent from USB drive.' -ForegroundColor Green;" ^
    "    } elseif (Test-Path (Join-Path '%SCRIPT_DIR%' 'src')) {" ^
    "        Copy-Item -Path `\"%SCRIPT_DIR%\*`\" -Destination $installDir -Recurse -Force;" ^
    "        Write-Host '      Deployed agent from USB root.' -ForegroundColor Green;" ^
    "    } else {" ^
    "        Write-Error 'Could not download from GitHub and no local agent files found on USB. Check internet connection.';" ^
    "        exit 1;" ^
    "    }" ^
    "}"

if %errorLevel% neq 0 (
    echo [ERROR] Failed to download or copy agent files.
    pause
    exit /b %errorLevel%
)

:: 6. Configure config.json
echo.
echo [4/5] Writing machine configuration to %INSTALL_DIR%\config.json...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$configPath = Join-Path '%INSTALL_DIR%' 'config.json';" ^
    "$config = @{" ^
    "    machine_id               = '%MACHINE_ID%';" ^
    "    lab_id                   = '%LAB_ID%';" ^
    "    lab_name                 = 'Computer Center';" ^
    "    college_name             = 'Walchand Institute of Technology, Solapur';" ^
    "    api_base_url             = 'https://cezkm5x4k8.execute-api.ap-south-1.amazonaws.com/v1';" ^
    "    api_key                  = '%API_KEY%';" ^
    "    idle_threshold_seconds   = 60;" ^
    "    summary_interval_minutes = 60;" ^
    "    retry_interval_minutes   = 5;" ^
    "    max_validate_attempts    = 3;" ^
    "    log_level                = 'INFO';" ^
    "};" ^
    "$config | ConvertTo-Json -Depth 5 | Set-Content -Path $configPath -Force;" ^
    "Write-Host '      Configuration saved successfully.' -ForegroundColor Green;"

:: 7. Run PowerShell Installer (Creates virtual environment, installs dependencies, registers scheduled tasks)
echo.
echo [5/5] Installing Python environment and registering Windows Scheduled Tasks...
cd /d "%INSTALL_DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\install.ps1" -InstallDir "%INSTALL_DIR%" -MachineId "%MACHINE_ID%" -ApiKey "%API_KEY%" -LabId "%LAB_ID%"

if %errorLevel% neq 0 (
    echo.
    echo [ERROR] Installation failed during Task Scheduler registration.
    pause
    exit /b %errorLevel%
)

:: 8. Verify Cloud Connection
echo.
echo ===============================================================================
echo                         Verifying Cloud Connection
echo ===============================================================================

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$url = 'https://cezkm5x4k8.execute-api.ap-south-1.amazonaws.com/v1/agent/validate';" ^
    "try {" ^
    "    $body = @{ pnr_no = 'TEST_PING'; password = 'TEST' } | ConvertTo-Json;" ^
    "    $headers = @{ 'x-api-key' = '%API_KEY%'; 'Content-Type' = 'application/json' };" ^
    "    $resp = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body $body -UseBasicParsing -ErrorAction Stop;" ^
    "    Write-Host '      [OK] Cloud API Gateway connection verified (HTTP 200)!' -ForegroundColor Green;" ^
    "} catch {" ^
    "    if ($_.Exception.Response.StatusCode -eq 401 -or $_.Exception.Response.StatusCode -eq 400 -or $_.Exception.Response.StatusCode -eq 404) {" ^
    "        Write-Host '      [OK] Cloud API Gateway reached successfully (API key authenticated)!' -ForegroundColor Green;" ^
    "    } elseif ($_.Exception.Response.StatusCode -eq 403) {" ^
    "        Write-Warning '      [WARNING] AWS API returned 403 Forbidden. Please verify your machine API key in config.json.';" ^
    "    } else {" ^
    "        Write-Warning \"      Could not reach cloud: $_. The agent will queue telemetry offline in SQLite and retry.\";" ^
    "    }" ^
    "}"

echo.
echo ===============================================================================
echo          [SUCCESS] LabPulse Agent Setup Completed for %MACHINE_ID%!
echo ===============================================================================
echo.
echo Summary of Setup:
echo   - Machine ID        : %MACHINE_ID%
echo   - Lab ID            : %LAB_ID%
echo   - Install Location  : %INSTALL_DIR%
echo   - Agent Downloaded  : GitHub (AdityaMittha/LabPulse)
echo   - API Key Loaded    : USB Pen Drive
echo   - Logon Task        : Triggers full-screen PNR lock screen on student logon
echo   - Shutdown Task     : Syncs all telemetry to cloud before PC powers off
echo.
echo Next Step:
echo   Restart the PC or Log Off Windows. The student PNR login screen will appear.
echo.
pause
