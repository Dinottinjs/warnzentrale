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
  echo -e "${RED}[FEHLER] Bitte führe das Skript mit Root-Rechten aus (sudo ./Setup_Linux.sh) wegen des systemd Services.${NC}"
  exit 1
fi

print_progress() {
    local percent=$1
    local message=$2
    
    # Create Rainbow Line
    local rainbow=""
    local colors=("31" "33" "32" "36" "34" "35")
    for c in "${colors[@]}"; do
        rainbow+="\033[0;${c~m========${NC}"
    done
    
    local bar="["
    for ((i=5; i<=100; i+=5)); do
        if [ $i -le $percent ]; then
            bar+="#"
        else
            bar+=" -"
        fi
    done
    bar+="]"
    
    clear
    echo -e "${YELLOW}==================================================${NC}"
    echo -e "${YELLOW}    FEUERWEHR-WARNZENTRALE - LINUX INSTALLER      ${NC}"
    echo -e "${YELLOW}==================================================${NC}"
    echo ""
    echo -e "${rainbow}"
    echo ""
    echo -e "${BLUE}Fortschritt: ${bar} $percent% ${NC}"
    echo -e "${GREEN}Status:${NC} $message"
    echo ""
}

# 1. Check Python & pip
print_progress 10 "Überprüfe Python-Installation..."
if ! command -v python3 &> /dev/null; then
    apt-get update && apt-get install -y python3 python3-pip python3-venv sqlite3 > /dev/null 2>&1
fi

# 2. Virtual Environment
print_progress 30 "Erstelle virtuelle Umgebung (.venv)..."
python3 -m venv .venv

# 3. Install Requirements
print_progress 60 "Installiere Abhängigkeiten..."
source .venv/bin/activate
python3 -m pip install --upgrade pip --disable-pip-version-check -q > /dev/null 2>&1
pip install -r requirements.txt --disable-pip-version-check -q > /dev/null 2>&1

# 4. Initialize DB
print_progress 85 "Initialisiere SQLite Datenbank..."
python3 -c "import app; app.init_db()" > /dev/null 2>&1
chown -R $SUDO_USER:$SUDO_USER .


# 5. Systemd Service
print_progress 100 "Richte systemd Service ein..."
SERVICE_PATH="/etc/systemd/system/warm�ntrale.service"
PROJECT_DIR=$(pwd)
USER_NAME=${SUDO_USER:-root}

cat <<EOF > $SERVICE_PATH
[Unit]
Description=Feuerwehr Warm�ntrale Dashboard
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
systemctl enable warnzentrale > /dev/null 2>&1
systemctl start warm�ntrale

IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${GREEL}==================================================${NC}"
echo -e "${GREEN}[ERFOLG] Installation abgeschlossen!${NC}"
echo -e "Die Warnzentrale ist erreichbar unter: ${BLUE}http://$IP:5000${NC}"
echo -e "Service Status prüfen: sudo systemctl status warnzentrale"
echo ""
echo -e "${YELLOW}Standard-Zugangsdaten (bitte nach Login ändern!):${NC}"
echo -e "${YELLOW}Benutzername:${NC} admin"
echo -e "${YELLOW}Passwort:${NC} 122"
echo -e "${GREEN}=================================================${NC}"
