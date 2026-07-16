#!/bin/bash
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e ===================================================
echo -e  FEUERWEHR-WARNZENTRALE - START-SCRIPT 
echo -e ===================================================
echo "

cd $(dirname $0)

# 1. Update from GitHub
echo -e [1/3] Prüfe auf Updates (GitHub)...
if [ ! -d .git ]; then
 echo -e [HINWEIS] Kein lokales Git-Repository gefunden. Initialisiere...
 git init > /dev/null 2>&1
 git remote add origin https://github.com/Dinottinjs/warnzentrale.git > /dev/null 2>&1
 git fetch > /dev/null 2>&1
 git branch -M main > /dev/null 2>&1
 git reset --hard origin/main > /dev/null 2>&1
 echo -e [HINWEIS] Repository initialisiert und auf neuesten Stand gebracht.
else
 git fetch origin main > /dev/null 2>&1
 if git status -uno | grep -q Your branch is behind; then
 echo -e [HINWEIS] Neues Update verfügbar! Lade herunter...
 git reset --hard origin/main > /dev/null 2>&1
 echo -e [HINWEIS] Update erfolgreich installiert.
 else
 echo -e [HINWEIS] Die Warnzentrale ist auf dem neuesten Stand.
 fi
fi
echo 

# 2. Ensure Virtual Environment exists and is activated
echo -e [2/3] Prüfe virtuelle Umgebung...
if [ ! -f .venv/bin/activate ]; then
 echo -e [HINWEIS] Virtuelle Umgebung nicht gefunden. Wird neu erstellt...
 python3 -m venv .venv
fi
source .venv/bin/activate
echo -e [HINWEIS] Umgebung aktiv. Installiere ggf. fehlende Pakete...
python3 -m pip install --upgrade pip --disable-pip-version-check -q > /dev/null 2>&1
pip install -r requirements.txt --disable-pip-version-check -q
echo 

# 3. Start Application
echo -e [3/3] Starte die Zentrale...
echo 
python3 app.py

echo 
echo -e [FEHLER] Der Server wurde unerwartet beendet.