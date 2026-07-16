#!/bin/bash

# ANSI Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}===================================================${NC}"
echo -e "${YELLOW}    FEUERWEHR-WARNZENTRALE - LINUX INSTALLER       ${NC}"
echo -e "${YELLOW}===================================================${NC}"
echo ""

# 1. Check Python
echo -e "[1/4] Überprüfe Python-Installation..."
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}[FEHLER] Python3 wurde nicht gefunden! Bitte installieren Sie Python 3.${NC}"
    exit 1
fi
echo -e "${GREEN}[OK] Python3 ist installiert.${NC}\n"

# 2. Create Virtual Environment
echo -e "[2/4] Erstelle virtuelle Umgebung (.venv)..."
python3 -m venv .venv
if [ $? -ne 0 ]; then
    echo -e "${RED}[FEHLER] Die virtuelle Umgebung konnte nicht erstellt werden.${NC}"
    exit 1
fi
echo -e "${GREEN}[OK] Virtuelle Umgebung erstellt.${NC}\n"

# 3. Install Requirements with Progress Bar visual
echo -e "[3/4] Installiere Abhängigkeiten..."
echo -e "[##########..........] 50%"
source .venv/bin/activate
pip install -r requirements.txt > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo -e "${RED}[FEHLER] Abhängigkeiten konnten nicht installiert werden.${NC}"
    exit 1
fi
echo -e "[####################] 100%"
echo -e "${GREEN}[OK] Flask, Requests und Psutil erfolgreich installiert.${NC}\n"

# 4. Get Local IP
IP=$(hostname -I | awk '{print $1}')
if [ -z "$IP" ]; then
    IP="127.0.0.1"
fi

echo -e "${GREEN}===================================================${NC}"
echo -e "${GREEN}[ERFOLG] Installation abgeschlossen!${NC}"
echo ""
echo -e "Die Warnzentrale ist nun erreichbar unter:"
echo -e "Lokaler Zugriff:  http://127.0.0.1:5000"
echo -e "Netzwerk Zugriff: http://$IP:5000"
echo -e "${GREEN}===================================================${NC}"
echo ""
echo -e "Starte Server..."
python3 app.py
