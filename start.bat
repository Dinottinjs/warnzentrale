@echo off
setlocal enabledelayedexpansion
color 0A
title Feuerwehr Warnzentrale - Start ^& Auto-Update

echo ===================================================
echo     FEUERWEHR-WARNZENTRALE - START-SCRIPT
echo ===================================================
echo.

cd /d "%~dp0"

:: 1. Update from GitHub
echo [1/3] Pruefe auf Updates (GitHub)...
if not exist ".git" (
    echo [HINWEIS] Kein lokales Git-Repository gefunden. Initialisiere fuer zukuenftige Updates...
    git init >nul 2>&1
    git remote add origin https://github.com/Dinottinjs/warnzentrale.git >nul 2>&1
    git fetch >nul 2>&1
    git branch -M main >nul 2>&1
    git reset --hard origin/main >nul 2>&1
    echo [HINWEIS] Repository initialisiert und auf neuesten Stand gebracht.
) else (
    git pull origin main > git_output.txt 2>&1
    findstr /C:"Already up to date." git_output.txt > nul
    if !errorlevel! equ 0 (
        echo [HINWEIS] Kein neues Update verfuegbar. Ueberspringe...
    ) else (
        findstr /C:"Fast-forward" git_output.txt > nul
        if !errorlevel! equ 0 (
            color 0E
            echo [HINWEIS] Neues Update gefunden und installiert!
            color 0A
        ) else (
            color 0C
            echo [WARNUNG] Konnte keine Updates von GitHub laden - vielleicht keine Internetverbindung?
            type git_output.txt
            color 0A
        )
    )
    if exist git_output.txt del git_output.txt
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
python -m pip install --upgrade pip --disable-pip-version-check -q >nul 2>&1
pip install -r requirements.txt --disable-pip-version-check -q
echo.

:: 3. Start Application
echo [3/3] Starte die Zentrale...
echo.
python app.py

:: Pause if the server crashes
echo.
echo [FEHLER] Der Server wurde unerwartet beendet.
pause
