@echo off
setlocal enabledelayedexpansion
color 0B
title Feuerwehr Warnzentrale - Update Script

echo ===================================================
echo     FEUERWEHR-WARNZENTRALE - UPDATE-SCRIPT
echo ===================================================
echo.

cd /d %~dp0

echo [1/2] Pruefe auf Updates (GitHub)...
if not exist .git (
    echo [HINWEIS] Kein lokales Git-Repository gefunden. Initialisiere...
    git init >nul 2>&1
    git remote add origin https://github.com/Dinottinjs/warnzentrale.git >nul 2>&1
    git fetch >nul 2>&1
    git branch -M main >nul 2>&1
    git reset --hard origin/main >nul 2>&1
    echo [HINWEIS] Repository initialisiert und auf neuesten Stand gebracht.
) else (
    git fetch origin main >nul 2>&1
    git status -uno | findstr /C:Your branch is behind > nul
    if !errorlevel! equ 0 (
        color 0E
        echo [HINWEIS] Neues Update verfuegbar! Lade herunter...
        git reset --hard origin/main >nul 2>&1
        echo [HINWEIS] Update erfolgreich installiert.
        color 0B
    ) else (
        echo [HINWEIS] Die Warnzentrale ist bereits auf dem neuesten Stand. Keine Updates noetig.
    )
)
echo.

echo [2/2] Pruefe und aktualisiere virtuelle Umgebung...
if not exist .venv\Scripts\activate.bat (
    echo [HINWEIS] Virtuelle Umgebung nicht gefunden. Wird neu erstellt...
    python -m venv .venv
)
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip --disable-pip-version-check -q >nul 2>&1
pip install -r requirements.txt --disable-pip-version-check -q
echo.

echo ===================================================
color 0A
echo [ERFOLG] Update-Vorgang abgeschlossen!
echo ===================================================
pause