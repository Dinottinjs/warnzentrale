import os
import sys
import json
import sqlite3
import socket
import platform
import subprocess
import psutil
import requests
import logging
import time
from datetime import datetime
from functools import wraps
from flask import Flask, render_template, jsonify, request, session, redirect, url_for, send_from_directory, make_response, send_file
from flask_socketio import SocketIO, emit
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from PIL import Image

# --- System Stats Background Task ---
def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def check_ping():
    try:
        start = time.time()
        socket.create_connection(("8.8.8.8", 53), timeout=2)
        end = time.time()
        return f"{int((end - start) * 1000)} ms"
    except Exception:
        return "Offline"

def sys_stats_thread():
    os_name = platform.system()
    os_release = platform.release()
    if os_name == "Windows":
        try:
            import sys
            if sys.getwindowsversion().build >= 22000:
                os_release = "11"
        except Exception:
            pass
    os_info = f"{os_name} {os_release}"
    
    ip_info = get_local_ip()
    while True:
        try:
            mem = psutil.virtual_memory()
            stats = {
                "os": os_info,
                "ip": ip_info,
                "ping": check_ping(),
                "cpu": psutil.cpu_percent(interval=None),
                "ram_percent": mem.percent,
                "ram_used_gb": round(mem.used / (1024**3), 1),
                "ram_total_gb": round(mem.total / (1024**3), 1),
                "disk": psutil.disk_usage('/').percent
            }
            socketio.emit('sys_stats', stats)
        except Exception as e:
            pass
        socketio.sleep(3)

# --- Logging Setup ---
import os
if os.path.exists('/.dockerenv'):
    log_file = os.path.join('data', 'warnzentrale.log')
else:
    log_file = 'warnzentrale.log'
logging.basicConfig(level=logging.INFO,
                    format='{"timestamp": "%(asctime)s", "level": "%(levelname)s", "message": "%(message)s"}',
                    handlers=[
                        logging.FileHandler(log_file, encoding='utf-8'),
                        logging.StreamHandler()
                    ])
logger = logging.getLogger(__name__)

def schedule_restart():
    def restart_task():
        import time, subprocess, sys, os
        time.sleep(1.5)
        # Start new instance and exit this one to free the port
        kwargs = {}
        if os.name == 'nt':
            kwargs['creationflags'] = subprocess.CREATE_NEW_CONSOLE
        subprocess.Popen([sys.executable, 'app.py', '--restarted'], close_fds=True, **kwargs)
        os._exit(0)
    import threading
    threading.Thread(target=restart_task).start()

app = Flask(__name__)
app.secret_key = 'super_secret_dashboard_key_v3'
socketio = SocketIO(app, cors_allowed_origins="*")

if os.path.exists('/.dockerenv'):
    DB_FILE = os.path.join('data', 'warnzentrale.db')
else:
    DB_FILE = 'warnzentrale.db'

UPLOAD_FOLDER = os.path.join('static', 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

api_session = requests.Session()

# --- Database Setup ---
def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    
    # Roles
    c.execute('''CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role_name TEXT UNIQUE NOT NULL,
        permissions TEXT NOT NULL
    )''')
    
    # Groups
    c.execute('''CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_name TEXT UNIQUE NOT NULL,
        description TEXT,
        color TEXT DEFAULT '#e11d48'
    )''')
    
    # Try to add color column if it's an old DB
    try:
        c.execute("ALTER TABLE groups ADD COLUMN color TEXT DEFAULT '#e11d48'")
    except sqlite3.OperationalError:
        pass # Column already exists
    
    # Users
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        first_name TEXT,
        last_name TEXT,
        password_hash TEXT NOT NULL,
        email TEXT,
        profile_picture_path TEXT,
        theme TEXT DEFAULT 'dark',
        group_id INTEGER,
        role_id INTEGER,
        invite_token TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(group_id) REFERENCES groups(id),
        FOREIGN KEY(role_id) REFERENCES roles(id)
    )''')
    
    # Schema upgrade for existing users table
    try:
        c.execute("ALTER TABLE users ADD COLUMN first_name TEXT")
    except sqlite3.OperationalError:
        pass # Column already exists
    try:
        c.execute("ALTER TABLE users ADD COLUMN last_name TEXT")
    except sqlite3.OperationalError:
        pass # Column already exists
    
    try:
        c.execute("ALTER TABLE users ADD COLUMN invite_token TEXT")
    except sqlite3.OperationalError:
        pass # Column already exists
        
    try:
        c.execute("ALTER TABLE users ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP")
    except sqlite3.OperationalError:
        pass # Column already exists
    
    # Invitations
    c.execute('''CREATE TABLE IF NOT EXISTS invitations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT,
        token TEXT UNIQUE NOT NULL,
        role_id INTEGER,
        group_id INTEGER,
        status TEXT DEFAULT 'pending',
        expires_at DATETIME
    )''')
    
    # Settings (for Kumpel API etc)
    c.execute('''CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )''')
    
    # Events history cache
    c.execute('''CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY,
        type TEXT,
        desc TEXT,
        status TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')

    # Missions (Einsätze)
    c.execute('''CREATE TABLE IF NOT EXISTS missions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        address TEXT,
        lat REAL,
        lng REAL,
        status TEXT DEFAULT 'active',
        group_id INTEGER,
        color_code TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(group_id) REFERENCES groups(id),
        FOREIGN KEY(created_by) REFERENCES users(id)
    )''')

    # Vehicles / Equipment
    c.execute('''CREATE TABLE IF NOT EXISTS vehicles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT,
        equipment_list TEXT,
        checklist_state TEXT,
        status TEXT DEFAULT 'available',
        current_mission_id INTEGER,
        FOREIGN KEY(current_mission_id) REFERENCES missions(id)
    )''')

    # Mission Logs
    c.execute('''CREATE TABLE IF NOT EXISTS mission_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mission_id INTEGER NOT NULL,
        log_text TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_id INTEGER,
        FOREIGN KEY(mission_id) REFERENCES missions(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
    )''')
    c.execute("SELECT id, role_name, permissions FROM roles")
    existing_roles = c.fetchall()
    
    # Define default permissions template
    default_perms = {
        "all": False,
        "trigger_alarm": False,
        "manage_users": False,
        "view_only": True,
        "manage_missions": False,
        "edit_log": False,
        "manage_groups": False,
        "manage_vehicles": False,
        "manage_settings": False,
        "manage_roles": False,
        "manage_system": False
    }

    if not existing_roles:
        admin_perms = default_perms.copy()
        for k in admin_perms: admin_perms[k] = True
        
        op_perms = default_perms.copy()
        op_perms.update({"trigger_alarm": True, "manage_missions": True, "edit_log": True, "manage_vehicles": True})
        
        member_perms = default_perms.copy()
        
        c.execute("INSERT INTO roles (role_name, permissions) VALUES (?, ?)", ("Admin", json.dumps(admin_perms)))
        c.execute("INSERT INTO roles (role_name, permissions) VALUES (?, ?)", ("Operator", json.dumps(op_perms)))
        c.execute("INSERT INTO roles (role_name, permissions) VALUES (?, ?)", ("Mitglied", json.dumps(member_perms)))
    else:
        # Upgrade existing roles
        for r in existing_roles:
            r_id, r_name, r_perms_str = r
            try:
                r_perms = json.loads(r_perms_str)
            except:
                r_perms = {}
            
            updated = False
            for k, v in default_perms.items():
                if k not in r_perms:
                    # Give admin all rights, others default
                    r_perms[k] = True if r_name == "Admin" else v
                    updated = True
            
            if updated:
                c.execute("UPDATE roles SET permissions = ? WHERE id = ?", (json.dumps(r_perms), r_id))
        
    c.execute("SELECT COUNT(*) FROM groups")
    if c.fetchone()[0] == 0:
        c.execute("INSERT INTO groups (group_name, description, color) VALUES (?, ?, ?)", ("Hauptfeuerwache", "Zentrale Leitung", "#e11d48"))
        
    c.execute("SELECT COUNT(*) FROM users")
    if c.fetchone()[0] == 0:
        pwd_hash = generate_password_hash("122")
        c.execute("INSERT INTO users (username, first_name, last_name, password_hash, role_id, group_id, theme, profile_picture_path) VALUES (?, ?, ?, ?, 1, 1, 'dark', '')", 
                  ("admin", "Admin", "User", pwd_hash))
                  
    # Seed Settings
    c.execute("SELECT COUNT(*) FROM settings")
    if c.fetchone()[0] == 0:
        c.execute("INSERT INTO settings (key, value) VALUES ('kumpel_ip', '127.0.0.1')")
        c.execute("INSERT INTO settings (key, value) VALUES ('kumpel_port', '8122')")
        c.execute("INSERT INTO settings (key, value) VALUES ('kumpel_password', '122')")
        c.execute("INSERT INTO settings (key, value) VALUES ('port', '5000')")
        c.execute("INSERT INTO settings (key, value) VALUES ('local_domain', '')")
        c.execute("INSERT INTO settings (key, value) VALUES ('network_mode', 'lan')")
        c.execute("INSERT INTO settings (key, value) VALUES ('wifi_ssid', '')")
        
    # Always try inserting new keys for upgrades
    c.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('session_timeout', '60')")
    c.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('maintenance_mode', '0')")
        
    conn.commit()
    conn.close()

init_db()

# --- Auth Decorators ---
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

def permission_required(perm_name):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'user_id' not in session:
                return jsonify({"error": "Unauthorized"}), 401
            conn = get_db()
            user = conn.execute("SELECT roles.permissions FROM users JOIN roles ON users.role_id = roles.id WHERE users.id = ?", (session['user_id'],)).fetchone()
            conn.close()
            if not user:
                return jsonify({"error": "Unauthorized"}), 403
            
            try:
                perms = json.loads(user['permissions'])
                if perms.get('all', False) or perms.get(perm_name, False):
                    return f(*args, **kwargs)
            except:
                pass
            return jsonify({"error": "Forbidden"}), 403
        return decorated_function
    return decorator

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({"error": "Unauthorized"}), 401
        conn = get_db()
        user = conn.execute("SELECT roles.role_name FROM users JOIN roles ON users.role_id = roles.id WHERE users.id = ?", (session['user_id'],)).fetchone()
        conn.close()
        if not user or user['role_name'] != 'Admin':
            return jsonify({"error": "Forbidden"}), 403
        return f(*args, **kwargs)
    return decorated_function

from datetime import timedelta

@app.before_request
def security_checks():
    if request.path.startswith('/static') or request.path in ['/login', '/logout']:
        return
        
    conn = get_db()
    
    # Check Maintenance Mode
    m_mode = conn.execute("SELECT value FROM settings WHERE key = 'maintenance_mode'").fetchone()
    if m_mode and m_mode['value'] == '1':
        if 'user_id' in session:
            role = conn.execute("SELECT role_name FROM roles JOIN users ON users.role_id = roles.id WHERE users.id = ?", (session['user_id'],)).fetchone()
            if not role or role['role_name'] != 'Admin':
                conn.close()
                session.clear()
                return "Das System befindet sich im Wartungsmodus. Nur Administratoren haben Zugriff.", 503
        else:
            conn.close()
            return "Das System befindet sich im Wartungsmodus.", 503
            
    # Check Session Timeout
    s_timeout = conn.execute("SELECT value FROM settings WHERE key = 'session_timeout'").fetchone()
    conn.close()
    
    if s_timeout and s_timeout['value'].isdigit():
        minutes = int(s_timeout['value'])
        if minutes > 0:
            app.permanent_session_lifetime = timedelta(minutes=minutes)
            session.permanent = True

# --- Routes ---

def socket_permission_required(perm_name):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'user_id' not in session:
                return
            conn = get_db()
            user = conn.execute("SELECT roles.permissions FROM users JOIN roles ON users.role_id = roles.id WHERE users.id = ?", (session['user_id'],)).fetchone()
            conn.close()
            if not user:
                return
            try:
                perms = json.loads(user['permissions'])
                if perms.get('all', False) or perms.get(perm_name, False):
                    return f(*args, **kwargs)
            except:
                pass
            return
        return decorated_function
    return decorator

# --- Settings Helper ---
def get_setting(key, default=""):
    conn = get_db()
    val = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    conn.close()
    return val['value'] if val else default

def set_setting(key, value):
    conn = get_db()
    conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, str(value)))
    conn.commit()
    conn.close()

# --- Routes ---

@app.route('/invite/<token>', methods=['GET'])
def invite_login(token):
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE invite_token = ?", (token,)).fetchone()
    if user:
        session['user_id'] = user['id']
        session['username'] = user['username']
        # Remove token so it's one-time use
        conn.execute("UPDATE users SET invite_token = NULL WHERE id = ?", (user['id'],))
        conn.commit()
        conn.close()
        logger.info(f"User '{user['username']}' logged in via invite token.")
        # Optional check if we want to flash a warning
        return redirect(url_for('index'))
    else:
        conn.close()
        return "Ungültiger oder abgelaufener Link.", 400

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        data = request.json
        username = data.get('username')
        password = data.get('password')
        
        conn = get_db()
        user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        conn.close()
        
        if user and check_password_hash(user['password_hash'], password):
            session['user_id'] = user['id']
            session['username'] = user['username']
            logger.info(f"User {username} logged in.")
            return jsonify({"success": True})
        logger.warning(f"Failed login attempt for username: {username}")
        return jsonify({"success": False, "error": "Ungültige Anmeldedaten"}), 401
    return render_template('login.html')

@app.route('/logout')
def logout():
    logger.info(f"User {session.get('username')} logged out.")
    session.clear()
    return redirect(url_for('login'))

@app.route('/api/verify_password', methods=['POST'])
@login_required
def verify_password():
    data = request.json
    password = data.get('password')
    conn = get_db()
    user = conn.execute("SELECT password_hash FROM users WHERE id = ?", (session['user_id'],)).fetchone()
    conn.close()
    if user and check_password_hash(user['password_hash'], password):
        return jsonify({"success": True})
    return jsonify({"success": False, "error": "Falsches Passwort"}), 401

@app.route('/')
@login_required
def index():
    conn = get_db()
    user = conn.execute(
        "SELECT u.username, u.password_hash, u.group_id, r.role_name, r.permissions "
        "FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?",
        (session['user_id'],)
    ).fetchone()
    conn.close()

    user_perms = {}
    current_role = ""
    current_user = session.get('username', '')
    current_group_id = None
    has_default_password = False

    if user:
        current_user = user['username']
        current_role = user['role_name'] or ''
        current_group_id = user['group_id']
        has_default_password = check_password_hash(user['password_hash'], '122') or check_password_hash(user['password_hash'], 'ff122')
        try:
            user_perms = json.loads(user['permissions']) if user['permissions'] else {}
        except Exception:
            user_perms = {}

    import time
    sys_version = int(time.time())

    response = make_response(render_template(
        'index.html',
        current_user=current_user,
        current_role=current_role,
        current_group_id=current_group_id,
        has_default_password=has_default_password,
        user_perms=user_perms,
        sys_version=sys_version
    ))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

# --- System Info ---
@app.route('/api/system_info', methods=['GET'])
@login_required
def system_info():
    ping_status = "Offline"
    try:
        if platform.system().lower() == "windows":
            output = subprocess.run(["ping", "-n", "1", "-w", "1000", "8.8.8.8"], capture_output=True)
        else:
            output = subprocess.run(["ping", "-c", "1", "-W", "1", "8.8.8.8"], capture_output=True)
        if output.returncode == 0:
            ping_status = "Online"
    except:
        pass

    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        local_ip = s.getsockname()[0]
    except Exception:
        local_ip = '127.0.0.1'
    finally:
        s.close()

    cpu = psutil.cpu_percent(interval=0.1)
    ram = psutil.virtual_memory()
    
    os_name = platform.system()
    os_release = platform.release()
    if os_name == "Windows":
        try:
            import sys
            if sys.getwindowsversion().build >= 22000:
                os_release = "11"
        except Exception:
            pass
    full_os_name = f"{os_name} {os_release}"

    return jsonify({
        "os": full_os_name,
        "cpu": cpu,
        "ram_percent": ram.percent,
        "ram_used_gb": round(ram.used / (1024 ** 3), 1),
        "ram_total_gb": round(ram.total / (1024 ** 3), 1),
        "ip": local_ip,
        "internet": ping_status
    })

# --- Account ---
@app.route('/api/account', methods=['GET', 'POST'])
@login_required
def account():
    conn = get_db()
    if request.method == 'POST':
        data = request.json
        if "name" in data and data["name"]:
            if session['user_id'] == 1 and data["name"].lower() != "admin":
                conn.close()
                return jsonify({"error": "Sicherheitswarnung: Der Benutzername des Hauptadministrators darf nicht geändert werden!"}), 403
            conn.execute("UPDATE users SET username = ? WHERE id = ?", (data["name"], session['user_id']))
            session['username'] = data["name"]
        if "password" in data and data["password"]:
            pwd_hash = generate_password_hash(data["password"])
            conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (pwd_hash, session['user_id']))
            logger.info(f"Benutzer '{session['username']}' hat sein Passwort geändert.")
        if "theme" in data:
            conn.execute("UPDATE users SET theme = ? WHERE id = ?", (data["theme"], session['user_id']))
        conn.commit()
        conn.close()
        logger.info(f"Benutzer '{session.get('username')}' hat sein Profil aktualisiert.")
        return jsonify({"success": True})
    
    user = conn.execute("SELECT username, email, profile_picture_path as avatar, theme FROM users WHERE id = ?", (session['user_id'],)).fetchone()
    conn.close()
    
    return jsonify({
        "name": user["username"],
        "email": user["email"],
        "avatar": user["avatar"],
        "theme": user["theme"]
    })

@app.route('/api/account/avatar', methods=['POST'])
@login_required
def upload_avatar():
    if 'avatar' not in request.files: return jsonify({"error": "No file"}), 400
    file = request.files['avatar']
    if file.filename == '': return jsonify({"error": "No file"}), 400
    
    try:
        img = Image.open(file)
        img.verify()
        file.seek(0)
        
        filename = f"user_{session['user_id']}_{secure_filename(file.filename)}"
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)
        
        conn = get_db()
        conn.execute("UPDATE users SET profile_picture_path = ? WHERE id = ?", (filename, session['user_id']))
        conn.commit()
        conn.close()
        
        logger.info(f"Benutzer '{session['username']}' hat sein Profilbild (Avatar) aktualisiert.")
        return jsonify({"success": True, "filename": filename})
    except Exception as e:
        return jsonify({"error": "Invalid image"}), 400

@app.route('/api/system/security', methods=['GET', 'POST'])
@permission_required('manage_system')
def api_system_security():
    if request.method == 'POST':
        data = request.json
        if "maintenance_mode" in data: set_setting('maintenance_mode', data['maintenance_mode'])
        if "session_timeout" in data: set_setting('session_timeout', data['session_timeout'])
        logger.info(f"Benutzer '{session.get('username')}' hat die Sicherheitseinstellungen aktualisiert.")
        return jsonify({"success": True})
    return jsonify({
        "maintenance_mode": get_setting("maintenance_mode", "0"),
        "session_timeout": get_setting("session_timeout", "60")
    })

@app.route('/api/system/logs/download', methods=['GET'])
@login_required
@permission_required('manage_system')
def download_logs():
    try:
        return send_file(log_file, as_attachment=True, download_name='system_logs.jsonl', mimetype='application/jsonl')
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/system/update', methods=['POST'])
@permission_required('manage_system')
def check_and_update():
    import subprocess
    import sys
    
    if os.path.exists('/.dockerenv'):
        return jsonify({"error": "Updates sind in der Docker-Version deaktiviert. Bitte laden Sie das neueste Docker-Image (docker pull) herunter."}), 403
        
    try:
        # Ensure it's a git repository and handle dubious ownership
        subprocess.run(["git", "init"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["git", "config", "--global", "--add", "safe.directory", os.getcwd()], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # Check if remote exists, add if not
        remotes = subprocess.run(["git", "remote"], capture_output=True, text=True)
        if "origin" not in remotes.stdout:
            subprocess.run(["git", "remote", "add", "origin", "https://github.com/Dinottinjs/warnzentrale.git"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
        # Fetch latest changes
        subprocess.run(["git", "fetch", "origin", "main"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # Compare local and remote commit hashes
        local_hash_cmd = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True)
        local_hash = local_hash_cmd.stdout.strip() if local_hash_cmd.returncode == 0 else ""
        remote_hash = subprocess.run(["git", "rev-parse", "origin/main"], capture_output=True, text=True).stdout.strip()
        
        if local_hash != remote_hash and remote_hash != "":
            # Update available
            subprocess.run(["git", "reset", "--hard", "origin/main"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            subprocess.run([sys.executable, "-m", "pip", "install", "-r", "requirements.txt", "--disable-pip-version-check"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            logger.info("System wurde aktualisiert und startet nun neu...")
            
            # Restart current python process
            schedule_restart()
            return jsonify({"status": "updated"})
        else:
            return jsonify({"status": "up_to_date"})
    except subprocess.CalledProcessError as e:
        logger.error(f"Git/Pip Fehler beim Update: {e}")
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        logger.error(f"Fehler beim Update: {e}")
        return jsonify({"error": str(e)}), 500

# --- Kumpel Proxy ---
def get_kumpel_url(path):
    ip = get_setting("kumpel_ip", "127.0.0.1")
    port = get_setting("kumpel_port", "8122")
    return f"http://{ip}:{port}{path}"

@app.route('/api/kumpel/config', methods=['GET', 'POST'])
@permission_required('manage_settings')
def kumpel_config():
    if request.method == 'POST':
        data = request.json
        if "ip" in data: set_setting('kumpel_ip', data['ip'])
        if "port" in data: set_setting('kumpel_port', data['port'])
        if "password" in data: set_setting('kumpel_password', data['password'])
        logger.info(f"Benutzer '{session.get('username')}' hat die Kumpel API Konfiguration aktualisiert.")
        return jsonify({"success": True})
    return jsonify({
        "ip": get_setting("kumpel_ip"),
        "port": get_setting("kumpel_port"),
        "password": "" 
    })

@app.route('/api/kumpel/test', methods=['POST'])
@permission_required('manage_settings')
def kumpel_test():
    pwd = get_setting("kumpel_password")
    try:
        url = get_kumpel_url('/api/login')
        res = api_session.post(url, json={"password": pwd}, timeout=5)
        res.raise_for_status()
        logger.info("Successfully connected to Kumpel Software API.")
        return jsonify({"success": True})
    except Exception as e:
        logger.error(f"Failed to connect to Kumpel API: {e}")
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/kumpel/<path:subpath>', methods=['GET', 'POST', 'DELETE'])
@login_required
def kumpel_proxy(subpath):
    url = get_kumpel_url(f"/api/{subpath}")
    try:
        if request.method == 'GET':
            res = api_session.get(url, params=request.args, timeout=5)
            if subpath == 'history' and res.ok:
                data = res.json()
                events = data.get('events', data) if isinstance(data, dict) else data
                conn = get_db()
                for ev in events:
                    if isinstance(ev, dict) and 'id' in ev:
                        conn.execute("INSERT OR REPLACE INTO events (id, type, desc, status) VALUES (?, ?, ?, ?)", 
                                     (ev['id'], ev.get('type',''), ev.get('desc',''), ev.get('status','')))
                conn.commit()
                conn.close()
        elif request.method == 'POST':
            res = api_session.post(url, json=request.json, timeout=5)
        elif request.method == 'DELETE':
            res = api_session.delete(url, timeout=5)
            
        return (res.content, res.status_code, res.headers.items())
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# --- DB Management & Rights (Admin) ---
@app.route('/api/db/<table>', methods=['GET'])
@permission_required('manage_settings') # Can be adjusted, but manage_settings acts as a high-level permission
def get_table(table):
    # Depending on table, we could implement finer checks, but for now we require manage_settings
    if table not in ['users', 'roles', 'groups', 'invitations', 'settings', 'missions', 'vehicles', 'mission_logs']:
        return jsonify({"error": "Invalid table"}), 400
    conn = get_db()
    rows = conn.execute(f"SELECT * FROM {table}").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/db/groups', methods=['POST'])
@permission_required('manage_groups')
def add_group():
    data = request.json
    conn = get_db()
    try:
        conn.execute("INSERT INTO groups (group_name, description, color) VALUES (?, ?, ?)", (data['group_name'], data.get('description',''), data.get('color', '#e11d48')))
        conn.commit()
        logger.info(f"Benutzer '{session.get('username')}' hat die Gruppe '{data['group_name']}' erstellt.")
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    finally:
        conn.close()

@app.route('/api/db/groups/<int:group_id>', methods=['PUT', 'DELETE'])
@permission_required('manage_groups')
def manage_group(group_id):
    conn = get_db()
    try:
        if request.method == 'DELETE':
            conn.execute("DELETE FROM groups WHERE id = ?", (group_id,))
            conn.execute("UPDATE users SET group_id = NULL WHERE group_id = ?", (group_id,))
            conn.commit()
            logger.info(f"Benutzer '{session.get('username')}' hat die Gruppe (ID: {group_id}) gelöscht.")
            return jsonify({"success": True})
        elif request.method == 'PUT':
            data = request.json
            conn.execute("UPDATE groups SET group_name = ?, description = ?, color = ? WHERE id = ?", 
                         (data['group_name'], data.get('description',''), data.get('color', '#e11d48'), group_id))
            conn.commit()
            logger.info(f"Benutzer '{session.get('username')}' hat die Gruppe '{data['group_name']}' bearbeitet.")
            return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    finally:
        conn.close()

@app.route('/api/db/users/<int:user_id>/group', methods=['PUT'])
@permission_required('manage_users')
def update_user_group(user_id):
    data = request.json
    conn = get_db()
    try:
        conn.execute("UPDATE users SET group_id = ? WHERE id = ?", (data.get('group_id'), user_id))
        conn.commit()
        logger.info(f"Benutzer '{session.get('username')}' hat die Gruppenzuweisung von Mitglied-ID {user_id} geändert.")
        socketio.emit('users_update')
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    finally:
        conn.close()

# Public endpoint: all logged-in users can fetch group list (for mission dropdown)
@app.route('/api/groups', methods=['GET'])
@login_required
def api_get_groups():
    conn = get_db()
    rows = conn.execute("SELECT id, group_name, description, color FROM groups ORDER BY group_name ASC").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

# --- Missions & Vehicles API ---
@app.route('/api/missions', methods=['GET', 'POST'])
@login_required
def api_missions():
    conn = get_db()
    if request.method == 'GET':
        rows = conn.execute("SELECT m.*, g.group_name, u.username as creator FROM missions m LEFT JOIN groups g ON m.group_id = g.id LEFT JOIN users u ON m.created_by = u.id ORDER BY m.created_at DESC").fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    elif request.method == 'POST':
        user_roles = conn.execute("SELECT roles.permissions FROM users JOIN roles ON users.role_id = roles.id WHERE users.id = ?", (session['user_id'],)).fetchone()
        if not user_roles or not json.loads(user_roles['permissions']).get('manage_missions', False):
            conn.close()
            return jsonify({"error": "Unauthorized"}), 403
        data = request.json
        c = conn.execute("INSERT INTO missions (title, description, address, lat, lng, group_id, color_code, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", 
                         (data['title'], data.get('description',''), data.get('address',''), data.get('lat'), data.get('lng'), data.get('group_id'), data.get('color_code', '#e11d48'), session['user_id']))
        conn.commit()
        mission_id = c.lastrowid
        conn.close()
        logger.info(f"Benutzer '{session.get('username')}' hat den Einsatz '{data['title']}' erstellt.")
        socketio.emit('missions_update')
        return jsonify({"success": True, "mission_id": mission_id})

@app.route('/api/missions/<int:mission_id>', methods=['PUT', 'DELETE'])
@login_required
@permission_required('manage_missions')
def api_mission_detail(mission_id):
    conn = get_db()
    if request.method == 'DELETE':
        conn.execute("DELETE FROM mission_logs WHERE mission_id = ?", (mission_id,))
        conn.execute("UPDATE vehicles SET current_mission_id = NULL WHERE current_mission_id = ?", (mission_id,))
        conn.execute("DELETE FROM missions WHERE id = ?", (mission_id,))
        conn.commit()
        conn.close()
        logger.info(f"Benutzer '{session.get('username')}' hat den Einsatz (ID: {mission_id}) gelöscht.")
        socketio.emit('missions_update')
        return jsonify({"success": True})
    elif request.method == 'PUT':
        data = request.json
        conn.execute("UPDATE missions SET title = ?, description = ?, address = ?, lat = ?, lng = ?, status = ?, color_code = ? WHERE id = ?", 
                     (data['title'], data.get('description',''), data.get('address',''), data.get('lat'), data.get('lng'), data.get('status', 'active'), data.get('color_code', '#e11d48'), mission_id))
        conn.commit()
        conn.close()
        logger.info(f"Benutzer '{session.get('username')}' hat den Einsatz '{data.get('title', mission_id)}' aktualisiert.")
        socketio.emit('missions_update')
        return jsonify({"success": True})

@app.route('/api/vehicles', methods=['GET', 'POST'])
@login_required
def api_vehicles():
    conn = get_db()
    if request.method == 'GET':
        rows = conn.execute("SELECT * FROM vehicles").fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    elif request.method == 'POST':
        user_roles = conn.execute("SELECT roles.permissions FROM users JOIN roles ON users.role_id = roles.id WHERE users.id = ?", (session['user_id'],)).fetchone()
        if not user_roles or not json.loads(user_roles['permissions']).get('manage_vehicles', False):
            conn.close()
            return jsonify({"error": "Unauthorized"}), 403
        data = request.json
        conn.execute("INSERT INTO vehicles (name, type, equipment_list, checklist_state, status) VALUES (?, ?, ?, ?, ?)", 
                     (data['name'], data.get('type',''), data.get('equipment_list',''), '{}', data.get('status','available')))
        conn.commit()
        conn.close()
        logger.info(f"Benutzer '{session.get('username')}' hat das Fahrzeug/Gerät '{data['name']}' erstellt.")
        socketio.emit('vehicles_update')
        return jsonify({"success": True})

@app.route('/api/vehicles/<int:vehicle_id>', methods=['PUT', 'DELETE'])
@login_required
@permission_required('manage_vehicles')
def api_vehicle_detail(vehicle_id):
    conn = get_db()
    if request.method == 'DELETE':
        conn.execute("DELETE FROM vehicles WHERE id = ?", (vehicle_id,))
        conn.commit()
        conn.close()
        logger.info(f"Benutzer '{session.get('username')}' hat das Fahrzeug/Gerät (ID: {vehicle_id}) gelöscht.")
        socketio.emit('vehicles_update')
        return jsonify({"success": True})
    elif request.method == 'PUT':
        data = request.json
        conn.execute("UPDATE vehicles SET name = COALESCE(?, name), type = COALESCE(?, type), equipment_list = COALESCE(?, equipment_list), checklist_state = COALESCE(?, checklist_state), status = COALESCE(?, status), current_mission_id = COALESCE(?, current_mission_id) WHERE id = ?", 
                     (data.get('name'), data.get('type'), data.get('equipment_list'), data.get('checklist_state'), data.get('status'), data.get('current_mission_id'), vehicle_id))
        conn.commit()
        conn.close()
        logger.info(f"Benutzer '{session.get('username')}' hat das Fahrzeug/Gerät (ID: {vehicle_id}) aktualisiert.")
        socketio.emit('vehicles_update')
        return jsonify({"success": True})

@app.route('/api/missions/<int:mission_id>/logs', methods=['GET', 'POST'])
@login_required
def api_mission_logs(mission_id):
    conn = get_db()
    if request.method == 'GET':
        rows = conn.execute("SELECT l.*, u.username FROM mission_logs l LEFT JOIN users u ON l.user_id = u.id WHERE l.mission_id = ? ORDER BY l.timestamp ASC", (mission_id,)).fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    elif request.method == 'POST':
        user_roles = conn.execute("SELECT roles.permissions FROM users JOIN roles ON users.role_id = roles.id WHERE users.id = ?", (session['user_id'],)).fetchone()
        if not user_roles or not json.loads(user_roles['permissions']).get('edit_log', False):
            conn.close()
            return jsonify({"error": "Unauthorized"}), 403
        data = request.json
        conn.execute("INSERT INTO mission_logs (mission_id, log_text, user_id) VALUES (?, ?, ?)", 
                     (mission_id, data['log_text'], session['user_id']))
        conn.commit()
        conn.close()
        socketio.emit('mission_logs_update', {'mission_id': mission_id})
        return jsonify({"success": True})
@app.route('/api/users', methods=['GET', 'POST'])
@login_required
def api_users():
    conn = get_db()
    if request.method == 'GET':
        users = conn.execute("SELECT u.id, u.username, u.first_name, u.last_name, u.group_id, u.role_id, u.created_at, u.invite_token, g.group_name, r.role_name FROM users u LEFT JOIN groups g ON u.group_id = g.id LEFT JOIN roles r ON u.role_id = r.id").fetchall()
        conn.close()
        return jsonify([dict(u) for u in users])
    elif request.method == 'POST':
        # Need manage_users permission
        user_roles = conn.execute("SELECT roles.permissions FROM users JOIN roles ON users.role_id = roles.id WHERE users.id = ?", (session['user_id'],)).fetchone()
        if not user_roles:
            conn.close()
            return jsonify({"error": "Unauthorized"}), 403
        
        perms = json.loads(user_roles['permissions']) if user_roles['permissions'] else {}
        if not perms.get('all') and not perms.get('manage_users'):
            conn.close()
            return jsonify({"error": "Forbidden"}), 403
            
        data = request.json
        first_name = data.get('first_name', '').strip()
        last_name = data.get('last_name', '').strip()
        group_id = data.get('group_id')
        
        if not first_name or not last_name:
            conn.close()
            return jsonify({"error": "Vor- und Nachname erforderlich."}), 400
            
        base_username = (first_name[:3] + last_name[:3]).capitalize()
        username = base_username
        
        # Ensure unique username
        counter = 1
        while conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone():
            counter += 1
            username = f"{base_username}{counter}"
            
        import uuid
        invite_token = str(uuid.uuid4())
        pwd_hash = generate_password_hash("ff122")
        
        conn.execute("INSERT INTO users (username, first_name, last_name, password_hash, role_id, group_id, invite_token) VALUES (?, ?, ?, ?, ?, ?, ?)", 
                     (username, first_name, last_name, pwd_hash, 3, group_id, invite_token))
        conn.commit()
        conn.close()
        socketio.emit('users_update')
        return jsonify({
            "success": True, 
            "username": username,
            "token": invite_token
        })

@app.route('/api/db/users/<int:user_id>', methods=['PUT', 'DELETE'])
@permission_required('manage_users')
def manage_user(user_id):
    conn = get_db()
    if request.method == 'DELETE':
        if user_id == 1:
            conn.close()
            return jsonify({"error": "Sicherheitswarnung: Der Hauptadministrator kann nicht gelöscht werden!"}), 403
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        conn.close()
        logger.info(f"Benutzer '{session.get('username')}' hat Mitglied-ID {user_id} gelöscht.")
        socketio.emit('users_update')
        return jsonify({"success": True})
    elif request.method == 'PUT':
        data = request.json
        if user_id == 1:
            if data.get('username') and data.get('username').lower() != 'admin':
                conn.close()
                return jsonify({"error": "Sicherheitswarnung: Der Benutzername des Hauptadministrators darf nicht geändert werden!"}), 403
            if data.get('role_id') and str(data.get('role_id')) != '1':
                conn.close()
                return jsonify({"error": "Sicherheitswarnung: Die Rolle des Hauptadministrators darf nicht geändert werden!"}), 403
            
        conn.execute("UPDATE users SET username = COALESCE(?, username), first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), group_id = COALESCE(?, group_id), role_id = COALESCE(?, role_id) WHERE id = ?", 
                     (data.get('username'), data.get('first_name'), data.get('last_name'), data.get('group_id'), data.get('role_id'), user_id))
        conn.commit()
        conn.close()
        logger.info(f"Benutzer '{session.get('username')}' hat die Daten von Mitglied-ID {user_id} aktualisiert.")
        socketio.emit('users_update')
        return jsonify({"success": True})

@app.route('/api/users/me/permissions', methods=['GET'])
@login_required
def api_my_permissions():
    conn = get_db()
    u = conn.execute("SELECT roles.permissions, roles.role_name FROM users JOIN roles ON users.role_id = roles.id WHERE users.id = ?", (session['user_id'],)).fetchone()
    conn.close()
    if u:
        try:
            perms = json.loads(u['permissions'])
        except:
            perms = {}
        return jsonify({"success": True, "permissions": perms, "role_name": u['role_name']})
    return jsonify({"success": False, "error": "Not found"}), 404

@app.route('/api/users/<int:user_id>/group', methods=['PUT'])
@permission_required('manage_users')
def update_user_group_id(user_id):
    data = request.json
    new_group_id = data.get('group_id')
    conn = get_db()
    conn.execute("UPDATE users SET group_id = ? WHERE id = ?", (new_group_id, user_id))
    conn.commit()
    conn.close()
    socketio.emit('users_update')
    return jsonify({"success": True})

@app.route('/api/invitations', methods=['POST'])
@permission_required('manage_users')
def create_invitation():
    import uuid
    data = request.json
    token = str(uuid.uuid4())
    conn = get_db()
    conn.execute("INSERT INTO invitations (email, token, role_id, group_id) VALUES (?, ?, ?, ?)", 
                 (data.get('email',''), token, data.get('role_id',3), data.get('group_id',1)))
    conn.commit()
    conn.close()
    logger.info(f"Benutzer '{session.get('username')}' hat ein neues Mitglied (Email: {data.get('email', 'Keine')}) erstellt.")
    socketio.emit('users_update')
    return jsonify({"success": True, "token": token})

# --- Socket.IO Handlers (Group Owner / Admin) ---
@socketio.on('system_action')
@socket_permission_required('manage_system')
def handle_system_action(data):
    action = data.get('action')
    if action == 'restart':
        logger.warning(f"Admin '{session.get('username')}' initiated system RESTART.")
        socketio.emit('server_message', {"msg": "Server startet neu...", "type": "warning"})
        # Start a new process
        schedule_restart()
    elif action == 'shutdown':
        logger.warning(f"Admin '{session.get('username')}' initiated system SHUTDOWN.")
        socketio.emit('server_message', {"msg": "Server wird heruntergefahren...", "type": "error"})
        os._exit(0)

@socketio.on('get_logs')
@socket_permission_required('manage_system')
def handle_get_logs():
    try:
        with open(log_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        # the file contains json lines from our formatter
        logs = []
        for line in lines[-100:]: # last 100 lines
            try:
                logs.append(json.loads(line.strip()))
            except:
                pass
        emit('logs_data', logs)
    except Exception as e:
        emit('logs_data', [{"timestamp": "", "level": "ERROR", "message": f"Konnte Logs nicht lesen: {e}"}])

@socketio.on('update_permissions')
@socket_permission_required('manage_roles')
def handle_update_permissions(data):
    role_id = data.get('role_id')
    new_perms = data.get('permissions')
    
    if role_id and new_perms is not None:
        conn = get_db()
        conn.execute("UPDATE roles SET permissions = ? WHERE id = ?", (json.dumps(new_perms), role_id))
        conn.commit()
        conn.close()
        logger.info(f"Benutzer '{session.get('username')}' hat die Berechtigungen für Rolle (ID: {role_id}) aktualisiert.")
        
        # Broadcast the change to all connected clients
        emit('permissions_updated', {"role_id": role_id, "permissions": new_perms}, broadcast=True)

@app.route('/api/settings', methods=['POST'])
@permission_required('manage_settings')
def update_settings():
    data = request.json
    conn = get_db()
    for key, value in data.items():
        # Insert or replace setting
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, str(value)))
    conn.commit()
    conn.close()
    
    # Optional: apply local domain logic if it changed
    local_domain = data.get('local_domain')
    if local_domain:
        # Simplistic approach: Just log it. Real mDNS/hosts file mapping is OS-specific and requires admin rights.
        logger.info(f"Local domain set to {local_domain}. Please configure your DNS or Hosts file accordingly.")

    logger.info(f"Benutzer '{session.get('username')}' hat die Systemeinstellungen aktualisiert.")
    return jsonify({"success": True})

@app.route('/api/network/wifi/scan', methods=['GET'])
@permission_required('manage_settings')
def api_wifi_scan():
    try:
        if platform.system() == "Windows":
            result = subprocess.check_output(['netsh', 'wlan', 'show', 'networks'], shell=True, text=True, encoding='cp850', errors='ignore')
            networks = []
            for line in result.split('\n'):
                if "SSID" in line and "BSSID" not in line:
                    parts = line.split(':')
                    if len(parts) > 1:
                        ssid = parts[1].strip()
                        if ssid and ssid not in networks:
                            networks.append(ssid)
            return jsonify({"networks": networks})
        else:
            result = subprocess.check_output(['nmcli', '-t', '-f', 'SSID', 'dev', 'wifi'], text=True)
            networks = [line.strip() for line in result.split('\n') if line.strip()]
            return jsonify({"networks": list(set(networks))})
    except Exception as e:
        logger.error(f"Wifi scan failed: {e}")
        return jsonify({"networks": [], "error": str(e)})

@app.route('/api/network/wifi/connect', methods=['POST'])
@permission_required('manage_settings')
def api_wifi_connect():
    data = request.json
    ssid = data.get('ssid')
    password = data.get('password')
    if not ssid:
        return jsonify({"success": False, "error": "SSID required"})
    
    try:
        if platform.system() == "Windows":
            # XML Escape um Fehler bei Sonderzeichen (&, <, >) im WLAN-Namen oder Passwort zu verhindern
            xml_ssid = ssid.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            xml_pass = password.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            
            profile_xml = f"""<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
    <name>{xml_ssid}</name>
    <SSIDConfig>
        <SSID>
            <name>{xml_ssid}</name>
        </SSID>
    </SSIDConfig>
    <connectionType>ESS</connectionType>
    <connectionMode>auto</connectionMode>
    <MSM>
        <security>
            <authEncryption>
                <authentication>WPA2PSK</authentication>
                <encryption>AES</encryption>
                <useOneX>false</useOneX>
            </authEncryption>
            <sharedKey>
                <keyType>passPhrase</keyType>
                <protected>false</protected>
                <keyMaterial>{xml_pass}</keyMaterial>
            </sharedKey>
        </security>
    </MSM>
</WLANProfile>"""
            profile_path = "temp_wifi_profile.xml"
            with open(profile_path, "w", encoding="utf-8") as f:
                f.write(profile_xml)
                
            res_add = subprocess.run(['netsh', 'wlan', 'add', 'profile', f'filename={profile_path}'], capture_output=True, text=True, encoding='cp850', errors='ignore')
            res_conn = subprocess.run(['netsh', 'wlan', 'connect', f'name={ssid}'], capture_output=True, text=True, encoding='cp850', errors='ignore')
            
            if os.path.exists(profile_path):
                os.remove(profile_path)
                
            if res_conn.returncode == 0:
                return jsonify({"success": True, "msg": f"Mit {ssid} verbunden"})
            else:
                return jsonify({"success": False, "error": res_conn.stderr or res_conn.stdout})
        else:
            # Linux nmcli
            subprocess.check_call(['nmcli', 'radio', 'wifi', 'on'])
            cmd = ['nmcli', 'dev', 'wifi', 'connect', ssid, 'password', password]
            res = subprocess.run(cmd, capture_output=True, text=True)
            if res.returncode == 0:
                return jsonify({"success": True, "msg": f"Mit {ssid} verbunden"})
            else:
                return jsonify({"success": False, "error": res.stderr})
    except Exception as e:
        logger.error(f"Wifi connect error: {e}")
        return jsonify({"success": False, "error": str(e)})

# --- Direct User Context injection ---
@app.context_processor
def inject_user():
    user = None
    role = None
    group_id = None
    user_perms = {}
    has_default_password = False
    if 'user_id' in session:
        conn = get_db()
        u = conn.execute("SELECT users.username, users.group_id, users.password_hash, roles.role_name, roles.permissions FROM users JOIN roles ON users.role_id = roles.id WHERE users.id = ?", (session['user_id'],)).fetchone()
        conn.close()
        if u:
            user = u['username']
            role = u['role_name']
            group_id = u['group_id']
            has_default_password = check_password_hash(u['password_hash'], 'ff122')
            try:
                user_perms = json.loads(u['permissions'])
            except:
                user_perms = {}
    return dict(current_user=user, current_role=role, current_group_id=group_id, user_perms=user_perms, has_default_password=has_default_password)

def get_free_port(starting_port):
    import socket
    port = starting_port
    while True:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(('0.0.0.0', port))
                return port
            except OSError:
                port += 1

if __name__ == '__main__':
    if '--restarted' in sys.argv:
        time.sleep(2)  # Wait for old process to fully release the port
        
    # Fetch port from db
    conn = get_db()
    port_row = conn.execute("SELECT value FROM settings WHERE key = 'port'").fetchone()
    
    desired_port = 5000
    if port_row and port_row['value'].isdigit():
        desired_port = int(port_row['value'])
        
    run_port = get_free_port(desired_port)
    
    if run_port != desired_port:
        conn.execute("UPDATE settings SET value = ? WHERE key = 'port'", (str(run_port),))
        conn.commit()
    conn.close()
    
    # Start the system stats thread
    socketio.start_background_task(sys_stats_thread)
    
    print("\n" + "="*50)
    print(f" WARNZENTRALE LOKAL ERREICHBAR UNTER:")
    print(f" -> http://127.0.0.1:{run_port}")
    print("="*50 + "\n")
    print("="*50 + "\n")

    # Use socketio.run instead of app.run
    socketio.run(app, host='0.0.0.0', port=run_port, debug=False, allow_unsafe_werkzeug=True)
