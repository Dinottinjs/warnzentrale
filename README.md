## ⚙️ Installation & Autostart

WarnZentrale wird mit einem **One-Click-Installer** geliefert, der sämtliche Umgebungsvariablen, Python-Abhängigkeiten und die Datenbankstruktur automatisch konfiguriert.

### 🪟 Installation auf Windows
1. Lade dir das Repository als `.zip` herunter und entpacke es.
2. Führe die Datei `install.bat` mit einem Doppelklick aus.
3. Das Skript installiert Python 3 (über Winget, falls nicht vorhanden), erstellt eine virtuelle Umgebung (`.venv`), installiert alle Pakete (`Flask`/`FastAPI`, `psutil`, `Pillow` etc.) und richtet einen unsichtbaren Autostart über den Windows-Autostart-Ordner ein.
4. **Standard-Zugang nach dem Start:** `http://localhost:8080` (Benutzer: `admin` | Passwort: `122`).

### 🐧 Installation auf Linux / Raspberry Pi
1. Klone das Repository oder lade die Dateien auf deinen Linux-Rechner.
2. Mache das Installationsskript ausführbar und starte es:
   ```bash
   chmod +x install.sh
   ./install.sh
