@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo     FEUERWEHR-WARNZENTRALE - WINDOWS INSTALLER
echo ===================================================
echo.

:: 1. Check Python
echo [1/4] Ueberpruefe Python-Installation...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [FEHLER] Python wurde nicht gefunden! Bitte installiere Python 3 und fuege es dem PATH hinzu.
    pause
    exit /b 1
)
echo [OK] Python ist installiert.
echo.

:: 2. Create Virtual Environment
echo [2/4] Erstelle virtuelle Umgebung (.venv)...
python -m venv .venv
if %errorlevel% neq 0 (
    color 0C
    echo [FEHLER] Die virtuelle Umgebung konnte nicht erstellt werden.
    pause
    exit /b 1
)
echo [OK] Virtuelle Umgebung erstellt.
echo.

:: 3. Install Requirements with Progress Bar visual
echo [3/4] Installiere Abhaengigkeiten...
echo [##########..........] 50%%
call .venv\Scripts\activate
pip install -r requirements.txt >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [FEHLER] Abhaengigkeiten konnten nicht installiert werden.
    pause
    exit /b 1
)
echo [####################] 100%%
echo [OK] Flask, Requests und Psutil erfolgreich installiert.
echo.

:: 4. Get Local IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set IP=%%a
    set IP=!IP: =!
)
if "!IP!"=="" set IP=127.0.0.1

echo ===================================================
color 0A
echo [ERFOLG] Installation abgeschlossen!
echo.
echo Die Warnzentrale ist nun erreichbar unter:
echo Lokaler Zugriff: http://127.0.0.1:5000
echo Netzwerk Zugriff: http://!IP!:5000
echo ===================================================
echo.
echo Starte Server...
python app.py

pause
