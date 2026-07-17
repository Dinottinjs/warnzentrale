# 🚨 WarnZentrale – Das ultimative Leitstellen- & Dashboard-System (DEMO) 🚒

[![Python Version](https://img.shields.io/badge/Python-3.11%20%7C%203.12-blue.svg)](https://www.python.org/)
[![License](https://img.shields.io/badge/Lizenz-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Plattform-Windows%20%7C%20Linux%20%7C%20Raspberry%20Pi-orange.svg)](#)

**WarnZentrale** ist ein hochmodernes, ausfallsicheres Steuerungs-Dashboard für Feuerwehrhäuser, Einsatzzentralen und IT-Techniker im Rettungsdienst. Es bündelt physische System-Metriken, eine interaktive Einsatzkarte von Österreich, eine vollständige Benutzer- & Rechteverwaltung auf Basis einer integrierten SQLite-Datenbank und eine nahtlose Schnittstellen-Verbindung zu externen Alarm- & Durchsagesystemen.

---

## 🌟 Hauptfeatures im Überblick

### 🖥️ High-Contrast Warning Center UI
* **Dark- & Light-Mode Toggle:** Wechsel auf Knopfdruck das Design (wird clientseitig im Browser-Speicher und serverseitig im Benutzerprofil gesichert).
* **Responsive Command-Center Layout:** Perfekt optimiert für Großbildschirme in der Fahrzeughalle, Tablets im Rüsthaus oder PCs am Funktisch.

### 🗺️ Live-Einsatzkarte (Österreich) & System-Status
* **Interaktive Leaflet-Karte:** Visualisierung aller aktiven Einsatzadressen in ganz Österreich in Echtzeit per Geocoding (Nominatim/OSM).
* **Echte Systemdaten (Keine Fake-Daten):** Live-Überwachung von CPU-Auslastung, RAM, Festplattenbelegung, Betriebssystem-Informationen und dem Netzwerk-Status (aktive LAN/WLAN-Verbindungen).

### 👥 Datenbank- & Rechtesystem (SQLite)
* **Integrierte Benutzerverwaltung:** Registrierung, Anmeldung und Anpassung von Name, Passwort und Profilbild (Upload in die sichere Datenbank).
* **Gruppen- & Einladungssystem:** Erstelle Gruppen (z. B. "Löschzug Nord", "Hauptfeuerwache") und lade Mitglieder direkt per Link oder Code ein.
* **Berechtigungs-Matrix:** Admins können Rollen (Admin, Operator, Mitglied) erstellen und deren Berechtigungen (z. B. "Darf manuell durchsagen", "Darf DB editieren") via WebUI granular verwalten.
* **Interaktiver Web-Datenbank-Editor:** Ein direkt im Dashboard integrierter Viewer, um SQLite-Tabellen bei Bedarf direkt zu modifizieren (nur für Admins).

### 🔌 API-Verknüpfung (Kumpel-Schnittstelle)
* Verbinde dich über die Einstellungen mit der API des lokalen Durchsage-Programms (Port `8122`).
* Synchronisiere Einsatz-Historien, frage den Status ab und steuere Gongs oder manuelle Text-to-Speech-Durchsagen direkt aus der Haupt-WarnZentrale heraus.

---

## 🛠️ Systemarchitektur

```
                                  +-----------------------+
                                  |     Browser-Client    |
                                  |  (Dashboard Web-UI)  |
                                  +-----------+-----------+
                                              | HTTP / WebSocket
                                              v
+-----------------------------------------------------------------------------------------+
|                                      WARNZENTRALE                                       |
|                                                                                         |
|   +-----------------------+   +-----------------------+   +-------------------------+   |
|   |    System-Monitor     |   |    SQLite-Datenbank   |   |   Gruppen/Mitglieder    |   |
|   |  (psutil CPU/RAM/IP)  |   |   (warnzentrale.db)   |   |     & Rechtesystem      |   |
|   +-----------------------+   +-----------+-----------+   +-------------------------+   |
|                                           |                                             |
+-------------------------------------------|---------------------------------------------+
                                            |
                                            | HTTP (API-Schnittstelle)
                                            v
                         +----------------------------------+
                         |      Durchsage-Server (Port 8122) |
                         |   - Lokale Audio-Ausgabe (Gong)  |
                         |   - Text-to-Speech (edge-tts)    |
                         +----------------------------------+
```

---

## ⚙️ Installation & Autostart

WarnZentrale wird mit einem **One-Click-Installer** geliefert, der sämtliche Umgebungsvariablen, Python-Abhängigkeiten und die Datenbankstruktur automatisch konfiguriert.

### 🪟 Installation auf Windows
1. Lade dir das Repository als `.zip` herunter und entpacke es.
2. Führe die Datei `install.bat` mit einem Doppelklick aus.
3. Das Skript installiert Python 3 (über Winget, falls nicht vorhanden), erstellt eine virtuelle Umgebung (`.venv`), installiert alle Pakete (`Flask`/`FastAPI`, `psutil`, `Pillow` etc.) und richtet einen unsichtbaren Autostart über den Windows-Autostart-Ordner ein.
4. **Standard-Zugang nach dem Start:** `http://localhost:5000` (Benutzer: `admin` | Passwort: `122`).

### 🐧 Installation auf Linux / Raspberry Pi
1. Klone das Repository oder lade die Dateien auf deinen Linux-Rechner.
2. Mache das Installationsskript ausführbar und starte es:
   ```bash
   chmod +x install.sh
   ./install.sh
   ```
3. Das Skript richtet die Umgebung ein, initialisiert die SQLite-Datenbank und installiert einen `systemd`-Hintergrunddienst (`warnzentrale.service`), sodass das Dashboard nach jedem Booten des Rechners sofort erreichbar ist.

---

## 🧹 Rückstandslose Deinstallation

Sollte das System von einem Rechner entfernt werden müssen, sorgen die Uninstaller dafür, dass **keine** Dateileichen, Registry-Einträge oder Hintergrund-Dienste zurückbleiben.

* **Unter Windows:** Führe die Datei `uninstall.bat` aus. Sie beendet alle Hintergrund-Python-Prozesse, löscht die Autostart-Verknüpfung im System und entfernt das gesamte Verzeichnis samt der SQLite-Datenbank und der virtuellen Umgebung.
* **Unter Linux:** Führe `./uninstall.sh` im Terminal aus. Der `systemd`-Service wird gestoppt, dauerhaft deaktiviert und die Konfigurations- sowie Programmdateien werden vollständig gelöscht.

---

## 📝 Lizenz & Rechtliches

Dieses Projekt ist unter der MIT-Lizenz lizenziert. Siehe die `LICENSE` Datei für Details.
