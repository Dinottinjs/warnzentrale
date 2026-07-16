@echo off
echo ===================================================
echo     FEUERWEHR-WARNZENTRALE - WINDOWS UNINSTALLER
echo ===================================================
echo.
echo ACHTUNG: Dies wird das gesamte Programm inkl. der Datenbank,
echo aller Nutzerdaten, Profilbilder und des Autostarts restlos loeschen!
echo.
pause

echo [1/3] Beende laufende Dashboard-Prozesse...
powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'app.py' } | Invoke-CimMethod -MethodName Terminate" >nul 2>&1
echo [OK] Prozesse beendet.

echo [2/3] Entferne Autostart-Eintrag...
set VBS_PATH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Warnzentrale.vbs
if exist "%VBS_PATH%" del /Q "%VBS_PATH%"
echo [OK] Autostart entfernt.

echo [3/3] Loesche Projektverzeichnis...
set PROJECT_DIR=%CD%
cd ..

:: Nutze einen asynchronen CMD-Aufruf, da sich die Batch-Datei nicht sofort selbst loeschen kann, 
:: waehrend sie noch von CMD blockiert wird.
start /b cmd /c "timeout /t 2 /nobreak >nul & rmdir /s /q "%PROJECT_DIR%""

echo.
echo [ERFOLG] Deinstallation abgeschlossen. Das Fenster schliesst sich und der Ordner wird geloescht.
pause
exit
