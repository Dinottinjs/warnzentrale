#!/bin/bash

# ANSI Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}===================================================${NC}"
echo -e "${YELLOW}    FEUERWEHR-WARNZENTRALE - LINUX INSTALLER       ${NC}"
echo -e "${YELLOW}===================================================${NC}"
echo ""

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[FEHLER] Bitte führe das Skript mit Root-Rechten aus (sudo ./install.sh) wegen des systemd Services.${NC}"
  exit 1
fi

# 1. Check Python & pip
echo -e "[1/5] Überprüfe Python-Installation..."
if ! command -v python3 &> /dev/null; then
    echo -e "Installiere Python3..."
    apt-get update && apt-get install -y python3 python3-pip python3-venv sqlite3
fi
echo -e "${GREEN}[OK] Python3 ist installiert.${NC}\n"

# 2. Virtual Environment
echo -e "[2/5] Erstelle virtuelle Umgebung (.venv)..."
python3 -m venv .venv
echo -e "${GREEN}[OK] Virtuelle Umgebung erstellt.${NC}\n"

# 3. Install Requirements
echo -e "[3/5] Installiere Abhängigkeiten..."
source .venv/bin/activate
python3 -m pip install --upgrade pip --disable-pip-version-check > /dev/null 2>&1
pip install -r requirements.txt --disable-pip-version-check > /dev/null 2>&1
echo -e "${GREEN}[OK] Module erfolgreich installiert.${NC}\n"

# 4. Initialize DB
echo -e "[4/5] Initialisiere SQLite Datenbank..."
python3 -c "import app; app.init_db()" > /dev/null 2>&1
chown -R $SUDO_USER:$SUDO_USER .
echo -e "${GREEN}[OK] Datenbank erstellt.${NC}\n"

# 5. Systemd Service
echo -e "[5/5] Richte systemd Service ein..."
SERVICE_PATH="/etc/systemd/system/warnzentrale.service"
PROJECT_DIR=$(pwd)
USER_NAME=${SUDO_USER:-root}

cat <<EOF > $SERVICE_PATH
[Unit]
Description=Feuerwehr Warnzentrale Dashboard
After=network.target

[Service]
User=$USER_NAME
WorkingDirectory=$PROJECT_DIR
Environment="PATH=$PROJECT_DIR/.venv/bin"
ExecStart=$PROJECT_DIR/.venv/bin/python $PROJECT_DIR/app.py
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable warnzentrale
systemctl start warnzentrale

echo -e "${GREEN}[OK] systemd Service (warnzentrale.service) eingerichtet und gestartet.${NC}\n"

IP=$(hostname -I | awk '{print $1}')
echo -e "${GREEN}===================================================${NC}"
echo -e "${GREEN}[ERFOLG] Installation abgeschlossen!${NC}"
echo -e "Die Warnzentrale ist erreichbar unter: http://$IP:8080"
echo -e "Service Status prüfen: sudo systemctl status warnzentrale"
echo -e "${GREEN}===================================================${NC}"
