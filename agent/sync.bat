@echo off
title LabPulse - Cloud Data Sync
setlocal enabledelayedexpansion

:: Determine agent directory
set "AGENT_DIR=%~dp0"
if not exist "%AGENT_DIR%config.json" (
    if exist "C:\LabPulse\config.json" (
        set "AGENT_DIR=C:\LabPulse\"
    )
)

echo ============================================================
echo   LabPulse Agent - Immediate Cloud Data Sync
echo   Walchand Institute of Technology, Solapur
echo ============================================================
echo Agent Location : %AGENT_DIR%
echo.

:: Detect Python executable (venv or system)
set "PYTHON_EXE="
if exist "%AGENT_DIR%venv\Scripts\python.exe" (
    set "PYTHON_EXE=%AGENT_DIR%venv\Scripts\python.exe"
) else (
    for %%P in (python.exe) do set "PYTHON_EXE=%%~$PATH:P"
)

if "%PYTHON_EXE%"=="" (
    echo [ERROR] Python executable not found in %AGENT_DIR%venv or PATH.
    echo Please ensure Python is installed.
    pause
    exit /b 1
)

:: Run send_now.py
"%PYTHON_EXE%" "%AGENT_DIR%send_now.py" %*

if %errorLevel% equ 0 (
    echo.
    echo [SUCCESS] Workstation data successfully synchronized to AWS Cloud!
) else (
    echo.
    echo [WARNING] Sync process exited with code %errorLevel%. Check logs in %AGENT_DIR%logs.
)
