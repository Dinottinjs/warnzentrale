import os
import json
import random
import time
import psutil
import requests
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)
CONFIG_FILE = 'config.json'

def load_config():
    if not os.path.exists(CONFIG_FILE):
        default_config = {
            "mode": "test",
            "api_url": "https://api.example.com/data",
            "api_key": "",
            "poll_interval": 5,
            "network": {
                "type": "LAN",
                "method": "DHCP",
                "ip": "",
                "subnet": "",
                "gateway": "",
                "ssid": "",
                "password": ""
            }
        }
        save_config(default_config)
        return default_config
    with open(CONFIG_FILE, 'r') as f:
        return json.load(f)

def save_config(config):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=4)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/status', methods=['GET'])
def get_status():
    return jsonify({
        "cpu": psutil.cpu_percent(interval=None),
        "ram": psutil.virtual_memory().percent,
        "network": "Verbunden" # Dummy status
    })

@app.route('/api/settings', methods=['GET', 'POST'])
def settings():
    if request.method == 'POST':
        config = load_config()
        data = request.json
        config.update(data)
        save_config(config)
        return jsonify({"status": "success"})
    return jsonify(load_config())

@app.route('/api/live-data', methods=['GET'])
def live_data():
    config = load_config()
    mode = config.get("mode", "test")
    
    if mode == "test":
        # Generate random test dummy data
        events = [
            {"id": 1, "type": "B02", "desc": "Freiflächenbrand klein", "status": "ALARM"},
            {"id": 2, "type": "T01", "desc": "Technische Hilfeleistung", "status": "WARNUNG"},
            {"id": 3, "type": "B04", "desc": "Wohnungsbrand", "status": "ALARM"},
            {"id": 4, "type": "T03", "desc": "Verkehrsunfall", "status": "INFO"}
        ]
        active_events = random.sample(events, k=random.randint(0, 3))
        status = "ALARM" if any(e["status"] == "ALARM" for e in active_events) else "BEREITSCHAFT"
        
        return jsonify({
            "status": status,
            "events": active_events,
            "mode": "test"
        })
    else:
        # Live mode
        api_url = config.get("api_url")
        api_key = config.get("api_key")
        
        if not api_url:
            return jsonify({"status": "ERROR", "error": "Keine API-URL konfiguriert", "mode": "live", "events": []})
        
        headers = {}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
            
        try:
            response = requests.get(api_url, headers=headers, timeout=5)
            response.raise_for_status()
            data = response.json()
            return jsonify({
                "status": data.get("status", "BEREITSCHAFT"),
                "events": data.get("events", []),
                "mode": "live"
            })
        except Exception as e:
            return jsonify({"status": "ERROR", "error": str(e), "mode": "live", "events": []})

@app.route('/api/test-connection', methods=['POST'])
def test_connection():
    data = request.json
    api_url = data.get("api_url")
    api_key = data.get("api_key")
    
    if not api_url:
        return jsonify({"success": False, "message": "Keine API-URL angegeben."})
        
    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
        
    try:
        response = requests.get(api_url, headers=headers, timeout=5)
        response.raise_for_status()
        return jsonify({"success": True, "message": "Verbindung erfolgreich."})
    except Exception as e:
        return jsonify({"success": False, "message": f"Fehler: {str(e)}"})

if __name__ == '__main__':
    load_config()
    app.run(host='0.0.0.0', port=5000, debug=True)
