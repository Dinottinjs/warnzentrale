#!/bin/bash

# ANSI Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}===================================================${NC}"
echo -e "${YELLOW}    FEUERWEHR-WARNZENTRALE - LINUX UNINSTALLER     ${NC}"
echo -e "${YELLOW}===================================================${NC}"
echo ""

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[FEHLER] Bitte führe das Skript mit Root-Rechten aus (sudo ./uninstall.sh) um den Service zu löschen.${NC}"
  exit 1
fi

echo -e "${RED}ACHTUNG: Dies wird das gesamte Programm inkl. der Datenbank,${NC}"
echo -e "${RED}aller Nutzerdaten, Profilbilder und des systemd-Services restlos löschen!${NC}"
read -p "Bist du sicher? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

echo -e "\n[1/3] Stoppe und deaktiviere systemd Service..."
systemctl stop warnzentrale 2>/dev/null
systemctl disable warnzentrale 2>/dev/null
echo -e "${GREEN}[OK] Service gestoppt.${NC}"

echo -e "[2/3] Lösche Service-Datei..."
rm -f /etc/systemd/system/warnzentrale.service
systemctl daemon-reload
echo -e "${GREEN}[OK] Service-Datei entfernt.${NC}"

echo -e "[3/3] Lösche Projektverzeichnis..."
PROJECT_DIR=$(pwd)
cd ..
rm -rf "$PROJECT_DIR"
echo -e "${GREEN}[OK] Ordnerstruktur gelöscht.${NC}"

echo -e "\n${GREEN}[ERFOLG] Deinstallation restlos abgeschlossen.${NC}"
