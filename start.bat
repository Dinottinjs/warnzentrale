@echo off
color 0A
title Feuerwehr Warnzentrale - Start ^& Auto-Update

echo ===================================================
echo     FEUERWEHR-WARNZENTRALE - START-SCRIPT
echo ===================================================
echo.

:: 1. Update from GitHub
echo [1/3] Pruefe auf Updates (GitHub)...
git pull origin main
if %errorlevel% neq 0 (
    color 0C
    echo [WARNUNG] Konnte keine Updates von GitHub laden - vielleicht keine Internetverbindung?
    color 0A
) else (
    echo [HINWEIS] Updates erfolgreich geprueft.
)
echo.

:: 2. Ensure Virtual Environment exists and is activated
echo [2/3] Pruefe virtuelle Umgebung...
if not exist ".venv\Scripts\activate.bat" (
    echo [HINWEIS] Virtuelle Umgebung nicht gefunden. Wird neu erstellt...
    python -m venv .venv
)
call .venv\Scripts\activate.bat
echo [HINWEIS] Umgebung aktiv. Installiere ggf. fehlende Pakete...
pip install -r requirements.txt -q
echo.

:: 3. Start Application
echo [3/3] Starte die Zentrale...
echo.
python app.py

:: Pause if the server crashes
echo.
echo [FEHLER] Der Server wurde unerwartet beendet.
pause
