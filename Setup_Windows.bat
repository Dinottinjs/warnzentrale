@echo off
setlocal enabledelayedexpansion
title Feuerwehr Warnzentrale - Setup

cd /d "%~dp0"

:: Define ANSI Colors
for /F %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"
set "RED=%ESC%[31m"
set "GREEN=%ESC%[32m"
set "YELLOW=%ESC%[33m"
set "BLUE=%ESC%[36m"
set "NC=%ESC%[0m"

echo %YELLOW%===================================================%NC$
echo %YELLOW%    FEUERWEHR-WARNZENTRALE - WINDOWS INSTALLER     %NC%
echo %YELLOW%====================================================%NC$
echo.

call :ProgressBar 10 "Pruefe und installiere ggf. Python..."
set "PYTHON_EXE="
python --version >nul 2>&1
if %errorlevel% equ 0 (
    set "PYTHON_EXE=python"
    goto :python_found
)
if exist "%LOCALAPPDATA%\Programs\Python\Python314\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
    goto :python_found
)
if exist "%PROGRAMFILES%\Python314\python.exe" (
    set "PYTHON_EXE=%PROGRAMFILES%\Python314\python.exe"
    goto :python_found
)
winget install -e --id Python.Python.3.14 --accept-package-agreements --accept-source-agreements >nul 2>&1
if exist "%LOCALAPPDATA%\Programs\Python\Python314\python.exe" set "PYTHON_EXE9%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
if exist "%PROGRAMFILES%\Python314\python.exe" set "PYTHON_EXE=%PROGRAMFILES%\Python314\python.exe"
if "!PYTHON_EXE!"=="" (
    echo %RED%[FEHLER] Python wurde nicht gefunden. Bitte manuell installieren!%NC%
    pause
    exit /b 1
)

:python_found
call :ProgressBar 30 "Python gefunden. Erstelle virtuelle Umgebung (.venv)..."
"!PYTHON_EXE!" -m venv .venv
if %errorlevel% neq 0 (
    echo %RED%[FEHLER] Die virtuelle Umgebung konnte nicht erstellt werden.%NC%
    pause
    exit /b 1
)

call :ProgressBar 60 "Installiere Abhaengigkeiten..."
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip --disable-pip-version-check -q >nul 2>&1
pip install -r requirements.txt --disable-pip-version-check -q >nul 2>&1
if %errorlevel% neq 0 (
    echo %RED%[FEHLER] Abhaengigkeiten konnten nicht installiert werden.%NC%
    pause
    exit /b 1
)

call :ProgressBar 85 "Initialisiere Datenbank (warnzentrale.db)..."
"!PYTHON_EXE!" -c "import app; app.init_db()" >nul 2>&1

call :ProgressBar 100 "Richte Autostart ein..."
set "VBS_PATH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Warnzentrale.vbs"
set "PROJECT_DIR=%CD%"
echo Set WshShell = CreateObject("WScript.Shell") > "!VBS_PATH!"
echo WshShell.CurrentDirectory = "!PROJECT_DIR!" >> "!VBS_PATH!"
echo WshShell.Run """!PROJECT_DIR!\.venv\Scripts\python.exe"" ""!PROJECT_DIR!\app.py""", 0, False >> "!VBS_PATH!"

echo.
echo %GREEN%===================================================%NC$
echo %GREEN%[ERFOLG] Installation abgeschlossen!%NC%
echo Die Warmé¥ntrale startet beim naechsten Boot automatisch.
echo Starte Dashboard jetzt...
echo.
echo Lokaler Zugriff: %BLUE%http://127.0.0.1:5000%NC%
echo.
echo %YELLOW%Standard-Zugangsdaten (bitte nach Login aendern!):%NC%
echo %YELLOW%Benutzername:%NC% admin
echo %YELLOW%Passwort:%NC% 122
echo %GREEN%==================================================%NC$
start "" "http://127.0.0.1:5000"
start "" "!PROJECT_DIR!\.venv\Scripts\python.exe" "app.py"
pause
exit /b 0

:ProgressBar
:: Usage: call :ProgressBar <Percentage> <Message>
set /a "Progress=%1"
set "Message=%~2"

:: Create Rainbow Line
set "RainbowLine="
set "Colors=31 33 32 36 34 35"
for %%A in (%Colors%) do (
    set "RainbowLine=!RainbowLine!!SC![%%Am========!NC!"
)

:: Calculate Bar
set "Bar="
for /L %%i in (1, 1, 20) do (
    set /a "Check=%%i * 5"
    if !Progress! geq !Check! (
        set "Bar=!Bar!#"
    ) else (
        set "Bar=!Bar! -"
    )
)

cls
echo %YELLOW%==================================================%NC$
echo %YELLOW%    FEUERWEHR-WARNZENTRALE - WINDOWS INSTALLER     %NC%
echo %YELLOW%====================================================%NC$
echo.
echo !RainbowLine!
echo.
echo %BLUE%Fortschritt: [!Bar!] !Progress!%% %NC%
echo %GREEN%Status:%NC% !Message!
echo.
exit /b 0
