@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo     FEUERWEHR-WARNZENTRALE - WINDOWS INSTALLER
echo ===================================================
echo.

:: 1. Check Python and Git (Winget)
echo [1/5] Pruefe und installiere ggf. Python via Winget...
set "PYTHON_JUST_INSTALLED=0"
winget --version >nul 2>&1
if %errorlevel% equ 0 (
    python --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo Installiere Python 3...
        winget install -e --id Python.Python.3.11 --accept-package-agreements --accept-source-agreements
        set "PYTHON_JUST_INSTALLED=1"
    )
) else (
    echo [WARNUNG] Winget nicht gefunden. Ueberpruefe Python manuell.
)

python --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    if "!PYTHON_JUST_INSTALLED!"=="1" (
        echo [HINWEIS] Python wurde erfolgreich installiert, aber die Konsole muss neu gestartet werden.
        echo Bitte schliesse dieses Fenster und starte 'install.bat' erneut!
    ) else (
        echo [FEHLER] Python wurde nicht gefunden! Bitte installiere Python 3 manuell.
    )
    pause
    exit /b 1
)
echo [OK] Python ist verfuegbar.
echo.

:: 2. Create Virtual Environment
echo [2/5] Erstelle virtuelle Umgebung (.venv)...
python -m venv .venv
if %errorlevel% neq 0 (
    color 0C
    echo [FEHLER] Die virtuelle Umgebung konnte nicht erstellt werden.
    pause
    exit /b 1
)
echo [OK] Virtuelle Umgebung erstellt.
echo.

:: 3. Install Requirements
echo [3/5] Installiere Abhaengigkeiten (Flask, psutil, requests, pillow, uvicorn, fastapi)...
call .venv\Scripts\activate
pip install -r requirements.txt >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [FEHLER] Abhaengigkeiten konnten nicht installiert werden.
    pause
    exit /b 1
)
echo [OK] Module erfolgreich installiert.
echo.

:: 4. Create SQLite DB and Default Admin
echo [4/5] Initialisiere Datenbank (warnzentrale.db)...
python -c "import app; app.init_db()" >nul 2>&1
echo [OK] Datenbank initialisiert (Standard-Nutzer: admin / 122).
echo.

:: 5. Autostart Setup
echo [5/5] Richte unsichtbaren Windows-Autostart ein...
set VBS_PATH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Warnzentrale.vbs
set PROJECT_DIR=%CD%

echo Set WshShell = CreateObject("WScript.Shell") > "%VBS_PATH%"
echo WshShell.CurrentDirectory = "%PROJECT_DIR%" >> "%VBS_PATH%"
echo WshShell.Run """%PROJECT_DIR%\.venv\Scripts\python.exe"" ""%PROJECT_DIR%\app.py""", 0, False >> "%VBS_PATH%"

echo [OK] Autostart-Skript in '%VBS_PATH%' angelegt.
echo.

echo ===================================================
color 0A
echo [ERFOLG] Installation abgeschlossen!
echo.
echo Die Warnzentrale startet beim naechsten Boot automatisch.
echo Um sie jetzt direkt zu starten, fuehre 'python app.py' aus.
echo Lokaler Zugriff: http://127.0.0.1:8080
echo ===================================================
pause
