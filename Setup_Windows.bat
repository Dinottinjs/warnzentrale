@echo off
setlocal enabledelayedexpansion
color 0B
title Feuerwehr Warnzentrale - Setup

echo ===================================================
echo     FEUERWEHR-WARNZENTRALE - WINDOWS INSTALLER
echo ===================================================
echo.

call :ProgressBar 10 Pruefe und installiere ggf. Python...
set PYTHON_EXE=
python --version >nul 2>&1
if %errorlevel% equ 0 (
    set PYTHON_EXE=python
    goto :python_found
)
if exist %LOCALAPPDATA%\Programs\Python\Python314\python.exe (
    set PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python314\python.exe
    goto :python_found
)
if exist %PROGRAMFILES%\Python314\python.exe (
    set PYTHON_EXE=%PROGRAMFILES%\Python314\python.exe
    goto :python_found
)
winget install -e --id Python.Python.3.14 --accept-package-agreements --accept-source-agreements >nul 2>&1
if exist %LOCALAPPDATA%\Programs\Python\Python314\python.exe set PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python314\python.exe
if exist %PROGRAMFILES%\Python314\python.exe set PYTHON_EXE=%PROGRAMFILES%\Python314\python.exe
if !PYTHON_EXE!==" (
 color 0C
 echo [FEHLER] Python wurde nicht gefunden. Bitte manuell installieren!
 pause
 exit /b 1
)

:python_found
call :ProgressBar 30 Python gefunden. Erstelle virtuelle Umgebung (.venv)...
!PYTHON_EXE! -m venv .venv
if %errorlevel% neq 0 (
 color 0C
 echo [FEHLER] Die virtuelle Umgebung konnte nicht erstellt werden.
 pause
 exit /b 1
)

call :ProgressBar 60 Installiere Abhaengigkeiten...
call .venv\Scripts\activate
python -m pip install --upgrade pip --disable-pip-version-check -q >nul 2>&1
pip install -r requirements.txt --disable-pip-version-check -q >nul 2>&1
if %errorlevel% neq 0 (
 color 0C
 echo [FEHLER] Abhaengigkeiten konnten nicht installiert werden.
 pause
 exit /b 1
)

call :ProgressBar 85 Initialisiere Datenbank (warnzentrale.db)...
!PYTHON_EXE! -c import app; app.init_db() >nul 2>&1

call :ProgressBar 100 Richte Autostart ein...
set VBS_PATH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Warnzentrale.vbs
set PROJECT_DIR=%CD%
echo Set WshShell = CreateObject(WScript.Shell) > %VBS_PATH%
echo WshShell.CurrentDirectory = %PROJECT_DIR% >> %VBS_PATH%
echo WshShell.Run "%PROJECT_DIR%\.venv\Scripts\python.exe %PROJECT_DIR%\app.py , 0, False >> %VBS_PATH%

echo.
echo ===================================================
color 0A
echo [ERFOLG] Installation abgeschlossen!
echo Die Warnzentrale startet beim naechsten Boot automatisch.
echo Starte Dashboard jetzt...
start " http://127.0.0.1:5000
start Warnzentrale Backend .venv\Scripts\python.exe app.py
echo.
echo Lokaler Zugriff: http://127.0.0.1:5000
echo ===================================================
pause
exit /b 0

:ProgressBar
:: Usage: call :ProgressBar <Percentage> <Message>
set /a Progress=%1
set Message=%~2
set Bar=[
for /L %%i in (1, 1, 20) do (
 set /a Check=%%i * 5
 if !Progress! geq !Check! (
 set Bar=!Bar!#
 ) else (
 set Bar=!Bar! 
 )
)
set Bar=!Bar!]
echo !Bar! !Progress!%% - !Message!
exit /b 0