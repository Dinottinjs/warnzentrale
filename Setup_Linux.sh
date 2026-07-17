#!/bin/bash
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BLUE='\033[0;34m'
RED='\033[0;31m'

# Prevent ALL interactive prompts from apt-get
export DEBIAN_FRONTEND=noninteractive

clear
echo -e "${YELLOW}==================================================${NC}"
echo -e "${YELLOW}    FEUERWEHR-WARNZENTRALE - LINUX INSTALLER      ${NC}"
echo -e "${YELLOW}==================================================${NC}"
echo -e "${CYAN} (c) 2026 Maximilian Holzer - Lizenziert unter MIT${NC}"
echo ""

cd "$(dirname "$0")"
PROJECT_DIR=$(pwd)

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[FEHLER] Bitte fuehre das Skript mit Root-Rechten aus:${NC}"
  echo -e "  ${CYAN}sudo ./Setup_Linux.sh${NC}"
  exit 1
fi

USER_NAME=${SUDO_USER:-root}

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
    echo -e "${CYAN} (c) 2026 Maximilian Holzer - Lizenziert unter MIT${NC}"
    echo ""
    echo -e "${BLUE}Fortschritt: ${bar} $percent% ${NC}"
    echo -e "${GREEN}Status:${NC} $message"
    echo ""
}

# Helper: install a package only if not present
install_pkg() {
    if ! dpkg -s "$1" &> /dev/null; then
        apt-get install -y -qq "$1" 2>&1 || true
    fi
}

# 1. Update package lists (with timeout)
print_progress 5 "Aktualisiere Paketlisten..."
echo -e "  ${CYAN}(apt-get update laeuft, bitte warten...)${NC}"
apt-get update -qq -o Acquire::http::Timeout="15" -o Acquire::https::Timeout="15" > /dev/null 2>&1 || {
    echo -e "${YELLOW}  Warnung: apt-get update fehlgeschlagen, fahre trotzdem fort...${NC}"
    sleep 2
}

# 2. Install Python and C build tools
print_progress 10 "Installiere Python3 und Build-Tools..."
install_pkg python3
install_pkg python3-pip
install_pkg python3-venv
install_pkg python3-dev
install_pkg build-essential
install_pkg libssl-dev
install_pkg libffi-dev
install_pkg libjpeg-dev
install_pkg zlib1g-dev

if ! command -v python3 &> /dev/null; then
    echo -e "${RED}[FEHLER] Python3 konnte nicht installiert werden.${NC}"
    echo -e "Bitte manuell installieren: sudo apt-get install python3"
    exit 1
fi

# 3. Virtual Environment
print_progress 30 "Erstelle virtuelle Umgebung (.venv)..."
python3 -m venv .venv 2>&1
if [ $? -ne 0 ]; then
    install_pkg python3-venv
    python3 -m venv .venv 2>&1
    if [ $? -ne 0 ]; then
        echo -e "${RED}[FEHLER] Virtuelle Umgebung konnte nicht erstellt werden.${NC}"
        exit 1
    fi
fi

# 4. Python-Abhaengigkeiten
print_progress 50 "Installiere Python-Abhaengigkeiten..."
echo -e "  ${CYAN}(pip install laeuft, bitte warten...)${NC}"
source .venv/bin/activate
python3 -m pip install --upgrade pip setuptools wheel --disable-pip-version-check -q 2>&1
pip install -r requirements.txt --disable-pip-version-check --prefer-binary -q 2>&1
if [ $? -ne 0 ]; then
    echo -e "${RED}[FEHLER] Python-Pakete konnten nicht installiert werden.${NC}"
    exit 1
fi

# 5. Datenbank initialisieren
print_progress 65 "Initialisiere SQLite Datenbank..."
python3 -c "import app; app.init_db()" 2>&1 || true

if [ -n "$SUDO_USER" ]; then
    chown -R "$SUDO_USER:$SUDO_USER" "$PROJECT_DIR"
fi

# 6. nginx installieren und konfigurieren (nur wenn Port 80 frei ist)
print_progress 73 "Pruefe Port 80 fuer Reverse Proxy..."

PORT_80_IN_USE=false
if ss -tuln | grep -q ":80 "; then
    PORT_80_IN_USE=true
fi

NGINX_INSTALLED=false

if [ "$PORT_80_IN_USE" = false ]; then
    print_progress 75 "Installiere nginx (Reverse Proxy)..."
    install_pkg nginx

    NGINX_CONF="/etc/nginx/sites-available/warnzentrale"
    cat > "$NGINX_CONF" << 'NGINXEOF'
server {
    listen 80;
    listen [::]:80;
    server_name warnzentrale.local;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }
}
NGINXEOF

    ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/warnzentrale
    nginx -t > /dev/null 2>&1 && systemctl enable nginx > /dev/null 2>&1 && systemctl restart nginx > /dev/null 2>&1 || true
    NGINX_INSTALLED=true
else
    echo -e "${YELLOW}  Port 80 ist belegt (z.B. durch Pi-hole). Überspringe Nginx Setup.${NC}"
    echo -e "  Die Warnzentrale wird ueber Port 5000 erreichbar sein."
    sleep 3
fi



# 8. Firewall
print_progress 85 "Konfiguriere Firewall..."
if command -v ufw &> /dev/null; then
    ufw allow 80/tcp > /dev/null 2>&1 || true
    ufw allow 5000/tcp > /dev/null 2>&1 || true
    ufw --force enable > /dev/null 2>&1 || true
fi
if command -v firewall-cmd &> /dev/null; then
    firewall-cmd --permanent --add-service=http > /dev/null 2>&1 || true
    firewall-cmd --permanent --add-port=5000/tcp > /dev/null 2>&1 || true
    firewall-cmd --reload > /dev/null 2>&1 || true
fi

# 9. Systemd Service
print_progress 92 "Richte systemd Service ein..."
SERVICE_NAME="warnzentrale"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

cat > "$SERVICE_PATH" << SERVICEEOF
[Unit]
Description=Feuerwehr Warnzentrale Dashboard
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$PROJECT_DIR
Environment=PATH=$PROJECT_DIR/.venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=$PROJECT_DIR/.venv/bin/python $PROJECT_DIR/app.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICEEOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" > /dev/null 2>&1
systemctl stop "$SERVICE_NAME" > /dev/null 2>&1
sleep 1
systemctl start "$SERVICE_NAME"

print_progress 100 "Pruefe ob Service laeuft..."
sleep 4

if ! systemctl is-active --quiet "$SERVICE_NAME"; then
    echo ""
    echo -e "${RED}[WARNUNG] Service nicht gestartet. Starte direkt...${NC}"
    echo -e "Fehlerdetails:"
    journalctl -u "$SERVICE_NAME" --no-pager -n 20
    echo ""
    cd "$PROJECT_DIR"
    source .venv/bin/activate
    nohup python3 app.py > /tmp/warnzentrale.log 2>&1 &
    sleep 3
    echo -e "${CYAN}Direkt-Start versucht. Log: /tmp/warnzentrale.log${NC}"
fi

IP=$(hostname -I | awk '{print $1}')

clear
echo -e "${YELLOW}==================================================${NC}"
echo -e "${YELLOW}    FEUERWEHR-WARNZENTRALE - LINUX INSTALLER      ${NC}"
echo -e "${YELLOW}==================================================${NC}"
echo -e "${CYAN} (c) 2026 Maximilian Holzer - Lizenziert unter MIT${NC}"
echo ""
echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}  [ERFOLG] Installation abgeschlossen!${NC}"
echo -e "${GREEN}==================================================${NC}"
echo ""
echo -e "  Erreichbar im Netzwerk:"
if [ "$NGINX_INSTALLED" = true ]; then
    echo -e "    ${BLUE}http://$IP${NC}                (IP-Adresse - kein Port noetig)"
else
    echo -e "    ${BLUE}http://$IP:5000${NC}             (IP-Adresse)"
fi
echo ""
echo -e "  Service verwalten:"
echo -e "    ${CYAN}sudo systemctl status warnzentrale${NC}"
echo -e "    ${CYAN}sudo systemctl restart warnzentrale${NC}"
echo -e "    ${CYAN}sudo journalctl -u warnzentrale -f${NC}"
echo ""
echo -e "${YELLOW}  Standard-Zugangsdaten:${NC}"
echo -e "    ${YELLOW}Benutzername:${NC} admin"
echo -e "    ${YELLOW}Passwort:${NC}     122"
echo ""
echo -e "${GREEN}==================================================${NC}"