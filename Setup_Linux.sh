#!/bin/bash
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BLUE='\033[0;34m'
RED='\033[0;31m'

echo -e "${YELLOW}==================================================${NC}"
echo -e "${YELLOW}    FEUERWEHR-WARNZENTRALE - LINUX INSTALLER      ${NC}"
echo -e "${YELLOW}==================================================${NC}"
echo ""

cd "$(dirname "$0")"

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[FEHLER] Bitte fuehre das Skript mit Root-Rechten aus (sudo ./Setup_Linux.sh).${NC}"
  exit 1
fi

print_progress() {
    local percent=$1
    local message=$2
    local bar="["
    for ((i=5; i<=100; i+=5)); do
        if [ $i -le $percent ]; then
            bar+="#"
        else
            bar+=" "
        fi
    done
    bar+="]"
    clear
    echo -e "${YELLOW}==================================================${NC}"
    echo -e "${YELLOW}    FEUERWEHR-WARNZENTRALE - LINUX INSTALLER      ${NC}"
    echo -e "${YELLOW}==================================================${NC}"
    echo ""
    echo -e "${BLUE}Fortschritt: ${bar} $percent% ${NC}"
    echo -e "${GREEN}Status:${NC} $message"
    echo ""
}

print_progress 10 "Ueberpruefe Python-Installation..."
if ! command -v python3 &> /dev/null; then
    echo -e "${CYAN}Installiere Python3...${NC}"
    apt-get update && apt-get install -y python3 python3-pip python3-venv sqlite3 > /dev/null 2>&1
fi

if ! command -v python3 &> /dev/null; then
    echo -e "${RED}[FEHLER] Python3 konnte nicht installiert werden.${NC}"
    exit 1
fi

print_progress 30 "Erstelle virtuelle Umgebung (.venv)..."
python3 -m venv .venv
if [ $? -ne 0 ]; then
    apt-get install -y python3-venv > /dev/null 2>&1
    python3 -m venv .venv
fi

print_progress 60 "Installiere Abhaengigkeiten..."
source .venv/bin/activate
python3 -m pip install --upgrade pip --disable-pip-version-check -q > /dev/null 2>&1
pip install -r requirements.txt --disable-pip-version-check -q > /dev/null 2>&1

print_progress 85 "Initialisiere SQLite Datenbank..."
python3 -c "import app; app.init_db()" > /dev/null 2>&1
if [ -n "$SUDO_USER" ]; then
    chown -R "$SUDO_USER:$SUDO_USER" .
fi

print_progress 95 "Richte systemd Service ein..."
SERVICE_NAME="warnzentrale"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
PROJECT_DIR=$(pwd)
USER_NAME=${SUDO_USER:-root}

cat > "$SERVICE_PATH" << SERVICEEOF
[Unit]
Description=Feuerwehr Warnzentrale Dashboard
After=network.target

[Service]
User=$USER_NAME
WorkingDirectory=$PROJECT_DIR
Environment="PATH=$PROJECT_DIR/.venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
ExecStart=$PROJECT_DIR/.venv/bin/python $PROJECT_DIR/app.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICEEOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" > /dev/null 2>&1
systemctl start "$SERVICE_NAME"

print_progress 100 "Installation abgeschlossen!"

IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}[ERFOLG] Installation abgeschlossen!${NC}"
echo -e "Warnzentrale erreichbar unter: ${BLUE}http://$IP:5000${NC}"
echo -e "Service Status: sudo systemctl status warnzentrale"
echo ""
echo -e "${YELLOW}Standard-Zugangsdaten (bitte nach Login aendern!):${NC}"
echo -e "${YELLOW}Benutzername:${NC} admin"
echo -e "${YELLOW}Passwort:${NC} 122"
echo -e "${GREEN}==================================================${NC}"