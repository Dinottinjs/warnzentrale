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
PROJECT_DIR=$(pwd)

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[FEHLER] Bitte fuehre das Skript mit Root-Rechten aus:${NC}"
  echo -e "  ${CYAN}sudo ./Setup_Linux.sh${NC}"
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

USER_NAME=${SUDO_USER:-root}

# 1. System-Pakete installieren
print_progress 10 "Installiere System-Abhaengigkeiten..."
apt-get update -qq > /dev/null 2>&1
apt-get install -y python3 python3-pip python3-venv sqlite3 nginx avahi-daemon avahi-utils > /dev/null 2>&1

if ! command -v python3 &> /dev/null; then
    echo -e "${RED}[FEHLER] Python3 konnte nicht installiert werden.${NC}"
    exit 1
fi

# 2. Virtual Environment
print_progress 30 "Erstelle virtuelle Umgebung (.venv)..."
python3 -m venv .venv
if [ $? -ne 0 ]; then
    apt-get install -y python3-venv > /dev/null 2>&1
    python3 -m venv .venv
    if [ $? -ne 0 ]; then
        echo -e "${RED}[FEHLER] Virtuelle Umgebung konnte nicht erstellt werden.${NC}"
        exit 1
    fi
fi

# 3. Abhaengigkeiten installieren
print_progress 55 "Installiere Python-Abhaengigkeiten..."
source .venv/bin/activate
python3 -m pip install --upgrade pip --disable-pip-version-check -q > /dev/null 2>&1
pip install -r requirements.txt --disable-pip-version-check -q > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo -e "${RED}[FEHLER] Python-Pakete konnten nicht installiert werden.${NC}"
    exit 1
fi

# 4. Datenbank initialisieren
print_progress 70 "Initialisiere SQLite Datenbank..."
python3 -c "import app; app.init_db()" > /dev/null 2>&1

# Berechtigungen setzen
if [ -n "$SUDO_USER" ]; then
    chown -R "$SUDO_USER:$SUDO_USER" "$PROJECT_DIR"
fi

# 5. Nginx Reverse Proxy konfigurieren (Port 80 -> 5000)
print_progress 78 "Konfiguriere nginx (Port 80 -> 5000)..."
NGINX_CONF="/etc/nginx/sites-available/warnzentrale"
cat > "$NGINX_CONF" << 'NGINXEOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

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

# Bestehende Default-Konfig deaktivieren, eigene aktivieren
rm -f /etc/nginx/sites-enabled/default
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/warnzentrale

nginx -t > /dev/null 2>&1 && systemctl enable nginx > /dev/null 2>&1 && systemctl restart nginx > /dev/null 2>&1

# 6. Avahi/mDNS konfigurieren (erreichbar ohne Port)
print_progress 83 "Konfiguriere mDNS (warnzentrale.local)..."
mkdir -p /etc/avahi/services
cat > "/etc/avahi/services/warnzentrale.service" << 'AVAHIEOF'
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name>Feuerwehr Warnzentrale</name>
  <service>
    <type>_http._tcp</type>
    <port>80</port>
  </service>
</service-group>
AVAHIEOF

# Hostnamen auf warnzentrale setzen
hostnamectl set-hostname warnzentrale > /dev/null 2>&1
if [ -f "/etc/avahi/avahi-daemon.conf" ]; then
    sed -i 's/^#*host-name=.*/host-name=warnzentrale/' /etc/avahi/avahi-daemon.conf 2>/dev/null || true
fi
systemctl enable avahi-daemon > /dev/null 2>&1
systemctl restart avahi-daemon > /dev/null 2>&1

# 7. Firewall oeffnen
print_progress 88 "Konfiguriere Firewall..."
if command -v ufw &> /dev/null; then
    ufw allow 80/tcp > /dev/null 2>&1
    ufw allow 5000/tcp > /dev/null 2>&1
    ufw --force enable > /dev/null 2>&1
fi
if command -v firewall-cmd &> /dev/null; then
    firewall-cmd --permanent --add-service=http > /dev/null 2>&1
    firewall-cmd --permanent --add-port=5000/tcp > /dev/null 2>&1
    firewall-cmd --reload > /dev/null 2>&1
fi

# 8. Systemd Service fuer die App einrichten
print_progress 95 "Richte systemd Service ein..."
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

# Pruefen ob Service laeuft
sleep 3
if ! systemctl is-active --quiet "$SERVICE_NAME"; then
    echo ""
    echo -e "${RED}[WARNUNG] Service konnte nicht automatisch gestartet werden.${NC}"
    systemctl status "$SERVICE_NAME" --no-pager -l
    echo ""
    echo -e "${CYAN}Versuche manuellen Start...${NC}"
    cd "$PROJECT_DIR"
    source .venv/bin/activate
    nohup python3 app.py > /tmp/warnzentrale.log 2>&1 &
    sleep 2
fi

print_progress 100 "Installation abgeschlossen!"

IP=$(hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}  [ERFOLG] Installation abgeschlossen!${NC}"
echo -e "${GREEN}==================================================${NC}"
echo ""
echo -e "  Erreichbar im Netzwerk:"
echo -e "    ${BLUE}http://$IP${NC}                (IP-Adresse, kein Port noetig)"
echo -e "    ${BLUE}http://warnzentrale.local${NC}  (mDNS - selbes Netzwerk)"
echo ""
echo -e "  Service verwalten:"
echo -e "    ${CYAN}sudo systemctl status warnzentrale${NC}"
echo -e "    ${CYAN}sudo systemctl restart warnzentrale${NC}"
echo -e "    ${CYAN}sudo journalctl -u warnzentrale -f${NC}  (Live-Logs)"
echo ""
echo -e "${YELLOW}  Standard-Zugangsdaten (bitte nach Login aendern!):${NC}"
echo -e "    ${YELLOW}Benutzername:${NC} admin"
echo -e "    ${YELLOW}Passwort:${NC}     122"
echo ""
echo -e "${GREEN}==================================================${NC}"