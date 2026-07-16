document.addEventListener('DOMContentLoaded', () => {
    // === 1. System & UI Basics ===
    
    // Clock setup
    const updateClock = () => {
        const now = new Date();
        document.getElementById('clock').textContent = now.toLocaleTimeString('de-DE');
    };
    setInterval(updateClock, 1000);
    updateClock();

    // Tab Navigation
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => {
                b.classList.remove('active', 'border-neon-green', 'text-gray-800', 'dark:text-white', 'bg-white', 'dark:bg-panel-bg');
                // Keep red text for db tab
                if(b.dataset.tab !== 'db') b.classList.add('border-transparent', 'text-gray-500', 'dark:text-gray-400', 'bg-transparent');
            });
            tabContents.forEach(c => c.classList.add('hidden'));

            btn.classList.remove('border-transparent', 'text-gray-500', 'dark:text-gray-400', 'bg-transparent');
            if(btn.dataset.tab === 'db') {
                btn.classList.add('active', 'border-red-500', 'bg-white', 'dark:bg-panel-bg');
            } else {
                btn.classList.add('active', 'border-neon-green', 'text-gray-800', 'dark:text-white', 'bg-white', 'dark:bg-panel-bg');
            }
            
            const tabId = `tab-${btn.dataset.tab}`;
            const target = document.getElementById(tabId);
            if(target) target.classList.remove('hidden');
            
            // Revalidate map
            if (btn.dataset.tab === 'dashboard' && map) {
                setTimeout(() => map.invalidateSize(), 100);
            }
        });
    });

    const showToast = (message, type = 'info') => {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        
        let bgColor = 'bg-blue-600';
        let icon = 'fa-info-circle';
        
        if(type === 'success') { bgColor = 'bg-green-600'; icon = 'fa-check-circle'; }
        else if(type === 'error') { bgColor = 'bg-red-600'; icon = 'fa-exclamation-circle'; }
        
        toast.className = `${bgColor} text-white px-4 py-3 rounded shadow-lg flex items-center transition-opacity duration-300 transform translate-y-10 opacity-0`;
        toast.innerHTML = `<i class="fa-solid ${icon} mr-3"></i> ${message}`;
        
        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.remove('translate-y-10', 'opacity-0'));
        setTimeout(() => {
            toast.classList.add('opacity-0');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };

    // === 2. Theme Management ===
    const themeToggleBtn = document.getElementById('theme-toggle');
    const applyTheme = (theme) => {
        if (theme === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    };

    themeToggleBtn.addEventListener('click', async () => {
        const isDark = document.documentElement.classList.contains('dark');
        const newTheme = isDark ? 'light' : 'dark';
        applyTheme(newTheme);
        localStorage.setItem('theme', newTheme);
        
        try {
            await fetch('/api/account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ theme: newTheme })
            });
        } catch (e) {}
    });

    // === 3. Map & Geocoding ===
    let map = null;
    let markers = {};
    const geoCache = JSON.parse(localStorage.getItem('geoCache') || '{}');

    const initMap = () => {
        if(document.getElementById('map')) {
            map = L.map('map').setView([47.5162, 14.5501], 7);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(map);
        }
    };
    initMap();

    const geocodeLocation = async (query) => {
        let cleanQuery = query.split('-')[0].trim(); 
        const search = cleanQuery + ", Austria";
        if (geoCache[search]) return geoCache[search];

        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(search)}&limit=1`);
            const data = await res.json();
            if (data && data.length > 0) {
                const coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
                geoCache[search] = coords;
                localStorage.setItem('geoCache', JSON.stringify(geoCache));
                return coords;
            }
        } catch (e) {}
        return null;
    };

    const updateMapMarkers = async (events) => {
        if(!map) return;
        const currentIds = events.map(e => e.id);
        for (let id in markers) {
            if (!currentIds.includes(parseInt(id) || id)) {
                map.removeLayer(markers[id]);
                delete markers[id];
            }
        }

        for (let ev of events) {
            if (!markers[ev.id]) {
                const coords = await geocodeLocation(ev.desc || ev.location || ev.type);
                if (coords) {
                    const customIcon = L.divIcon({
                        className: 'custom-div-icon',
                        html: `<div class="pulse-marker" style="width:20px; height:20px;"></div>`,
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                    });
                    
                    const marker = L.marker(coords, {icon: customIcon})
                        .bindPopup(`<b>${ev.type || 'Einsatz'}</b><br>${ev.desc || ''}`)
                        .addTo(map);
                    markers[ev.id] = marker;
                }
            }
        }
    };

    // === 4. Data Polling ===
    let pollIntervalId = null;

    const fetchSystemInfo = async () => {
        try {
            const res = await fetch('/api/system_info');
            const data = await res.json();
            document.getElementById('os-stat').textContent = data.os;
            document.getElementById('os-stat').title = data.os;
            document.getElementById('cpu-ram-stat').textContent = `${data.cpu.toFixed(1)}% | ${data.ram_gb}GB (${data.ram_percent}%)`;
            document.getElementById('ip-stat').textContent = data.ip;
            
            const pingEl = document.getElementById('ping-stat');
            pingEl.textContent = data.internet;
            pingEl.className = data.internet === 'Online' ? 'text-sm font-bold text-neon-green' : 'text-sm font-bold text-fire-red';
        } catch (e) {}
    };

    const fetchKumpelData = async () => {
        const badge = document.getElementById('kumpel-status-badge');
        const container = document.getElementById('events-container');

        try {
            const histRes = await fetch('/api/kumpel/history');
            if (histRes.ok) {
                badge.textContent = "Verbunden";
                badge.className = "px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs rounded-full font-bold";
                const data = await histRes.json();
                const events = data.events || data || [];
                
                if (events.length === 0) {
                    container.innerHTML = `<div class="text-gray-500 text-center mt-10 italic">Keine aktuellen Meldungen</div>`;
                    updateMapMarkers([]);
                } else {
                    let html = '';
                    events.forEach(ev => {
                        let icon = 'fa-info-circle';
                        let colorClass = 'text-neon-green';
                        if(ev.status === 'ALARM' || ev.status === 'active') { icon = 'fa-fire'; colorClass = 'text-fire-red'; }
                        
                        html += `
                            <div class="event-card ${ev.status || 'INFO'} bg-gray-50 dark:bg-gray-900 p-4 rounded shadow-sm flex items-start border border-gray-200 dark:border-gray-800">
                                <div class="mt-1 mr-4 text-xl"><i class="fa-solid ${icon} ${colorClass}"></i></div>
                                <div class="flex-1">
                                    <div class="font-bold text-lg text-gray-800 dark:text-white">${ev.type || 'Einsatz'} - ${ev.desc || ''}</div>
                                    <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">Status: ${ev.status || 'Unbekannt'}</div>
                                </div>
                            </div>
                        `;
                    });
                    container.innerHTML = html;
                    updateMapMarkers(events);
                }
            } else {
                throw new Error("API not ok");
            }
        } catch (e) {
            badge.textContent = "Getrennt";
            badge.className = "px-2 py-1 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-xs rounded-full font-bold";
        }
    };

    const startPolling = () => {
        if(pollIntervalId) clearInterval(pollIntervalId);
        fetchSystemInfo();
        fetchKumpelData();
        pollIntervalId = setInterval(() => {
            fetchSystemInfo();
            fetchKumpelData();
        }, 5000);
    };

    // === 5. Actions & Forms ===
    
    // Kumpel Config
    const loadKumpelConfig = async () => {
        try {
            const res = await fetch('/api/kumpel/config');
            if(res.ok) {
                const data = await res.json();
                document.getElementById('kumpel-ip').value = data.ip || '127.0.0.1';
                document.getElementById('kumpel-port').value = data.port || '8122';
            }
        } catch(e) {}
    };

    const linkForm = document.getElementById('link-form');
    if(linkForm) {
        linkForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const config = {
                ip: document.getElementById('kumpel-ip').value,
                port: document.getElementById('kumpel-port').value,
                password: document.getElementById('kumpel-password').value
            };
            try {
                const res = await fetch('/api/kumpel/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config)
                });
                if(res.ok) showToast('Verknüpfungseinstellungen gespeichert', 'success');
            } catch(e) {
                showToast('Fehler beim Speichern', 'error');
            }
        });
    }

    const btnTestLink = document.getElementById('btn-test-link');
    if(btnTestLink) {
        btnTestLink.addEventListener('click', async () => {
            const resultSpan = document.getElementById('link-test-result');
            resultSpan.textContent = "Teste...";
            resultSpan.className = "text-sm font-bold ml-2 text-gray-500";
            
            document.getElementById('link-form').dispatchEvent(new Event('submit'));

            try {
                const res = await fetch('/api/kumpel/test', { method: 'POST' });
                const data = await res.json();
                if(data.success) {
                    resultSpan.textContent = "Erfolgreich!";
                    resultSpan.className = "text-sm font-bold ml-2 text-neon-green";
                    fetchKumpelData();
                } else {
                    resultSpan.textContent = "Fehler: " + (data.error || "Login fehlgeschlagen");
                    resultSpan.className = "text-sm font-bold ml-2 text-fire-red";
                }
            } catch(e) {
                resultSpan.textContent = "Verbindungsfehler";
                resultSpan.className = "text-sm font-bold ml-2 text-fire-red";
            }
        });
    }

    // Account
    const loadAccountConfig = async () => {
        try {
            const res = await fetch('/api/account');
            const data = await res.json();
            document.getElementById('acc-name').value = data.name || 'Admin';
            
            if (data.theme) {
                applyTheme(data.theme);
                localStorage.setItem('theme', data.theme);
            }
            
            if (data.avatar) {
                const avatarUrl = `/static/uploads/${data.avatar}?t=${new Date().getTime()}`;
                const hdAvatar = document.getElementById('header-avatar');
                const pvAvatar = document.getElementById('preview-avatar');
                if(hdAvatar) hdAvatar.src = avatarUrl;
                if(pvAvatar) pvAvatar.src = avatarUrl;
            }
        } catch(e) {}
    };

    const accForm = document.getElementById('account-form');
    if(accForm) {
        accForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const data = {
                name: document.getElementById('acc-name').value,
                password: document.getElementById('acc-password').value
            };
            try {
                const res = await fetch('/api/account', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                if(res.ok) {
                    showToast('Profil aktualisiert', 'success');
                    document.getElementById('header-user-name').textContent = data.name;
                    if(data.password) {
                        alert("Das Passwort wurde erfolgreich geändert.\n\nBitte starte das gesamte System (die install.bat Konsole) neu, damit alles einwandfrei und zu 100% funktioniert!");
                    }
                    document.getElementById('acc-password').value = '';
                }
            } catch(e) {
                showToast('Fehler beim Speichern', 'error');
            }
        });
    }

    // Avatar Upload
    const avatarInput = document.getElementById('avatar-input');
    const avatarForm = document.getElementById('avatar-form');
    if(avatarInput && avatarForm) {
        const avatarFilename = document.getElementById('avatar-filename');
        const btnUploadAvatar = document.getElementById('btn-upload-avatar');
        const previewAvatar = document.getElementById('preview-avatar');

        avatarInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                const file = e.target.files[0];
                avatarFilename.textContent = file.name;
                btnUploadAvatar.classList.remove('hidden');
                
                const reader = new FileReader();
                reader.onload = (ev) => { previewAvatar.src = ev.target.result; };
                reader.readAsDataURL(file);
            } else {
                avatarFilename.textContent = "Kein Bild ausgewählt";
                btnUploadAvatar.classList.add('hidden');
            }
        });

        avatarForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if(!avatarInput.files || avatarInput.files.length === 0) return;
            
            const formData = new FormData();
            formData.append('avatar', avatarInput.files[0]);

            try {
                const res = await fetch('/api/account/avatar', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                if(data.success) {
                    showToast('Bild erfolgreich hochgeladen', 'success');
                    const avatarUrl = `/static/uploads/${data.filename}?t=${new Date().getTime()}`;
                    document.getElementById('header-avatar').src = avatarUrl;
                    btnUploadAvatar.classList.add('hidden');
                } else {
                    showToast(data.error || 'Fehler beim Upload', 'error');
                }
            } catch(e) {
                showToast('Upload-Fehler', 'error');
            }
        });
    }

    // DB Management
    const dbBtns = document.querySelectorAll('.db-select-btn');
    dbBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            dbBtns.forEach(b => {
                b.classList.remove('bg-neon-green', 'text-black');
                b.classList.add('bg-gray-200', 'dark:bg-gray-800');
            });
            btn.classList.remove('bg-gray-200', 'dark:bg-gray-800');
            btn.classList.add('bg-neon-green', 'text-black');
            
            const table = btn.dataset.table;
            try {
                const res = await fetch(`/api/db/${table}`);
                const rows = await res.json();
                
                const thead = document.getElementById('db-thead');
                const tbody = document.getElementById('db-tbody');
                
                if(!rows || rows.length === 0) {
                    thead.innerHTML = '<tr><th class="p-3">Keine Einträge vorhanden</th></tr>';
                    tbody.innerHTML = '';
                    return;
                }
                
                const cols = Object.keys(rows[0]);
                thead.innerHTML = `<tr>${cols.map(c => `<th class="p-3 font-semibold uppercase tracking-wider">${c}</th>`).join('')}<th class="p-3">Aktion</th></tr>`;
                
                tbody.innerHTML = rows.map(r => `
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        ${cols.map(c => `<td class="p-3 max-w-xs truncate" title="${r[c]}">${r[c]}</td>`).join('')}
                        <td class="p-3">
                            <button class="text-red-500 hover:text-red-700 font-bold delete-row-btn" data-table="${table}" data-id="${r.id}"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    </tr>
                `).join('');
                
                document.querySelectorAll('.delete-row-btn').forEach(dBtn => {
                    dBtn.addEventListener('click', async (e) => {
                        const t = e.currentTarget.dataset.table;
                        const i = e.currentTarget.dataset.id;
                        if(confirm('Wirklich löschen?')) {
                            // Currently only implemented for users in backend, but conceptually possible
                            if(t === 'users') {
                                await fetch(`/api/db/users/${i}`, {method: 'DELETE'});
                                btn.click();
                            } else {
                                alert("DELETE Route für diese Tabelle noch nicht implementiert im Backend.");
                            }
                        }
                    });
                });
            } catch(e) {
                console.error(e);
            }
        });
    });

    // Rights Management Forms
    const groupForm = document.getElementById('group-form');
    if(groupForm) {
        groupForm.addEventListener('submit', async(e) => {
            e.preventDefault();
            const data = {
                group_name: document.getElementById('group-name').value,
                description: document.getElementById('group-desc').value
            };
            const res = await fetch('/api/db/groups', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
            if(res.ok) showToast('Gruppe erstellt', 'success');
            else showToast('Fehler', 'error');
        });
    }

    const inviteForm = document.getElementById('invite-form');
    if(inviteForm) {
        inviteForm.addEventListener('submit', async(e) => {
            e.preventDefault();
            const data = {
                email: document.getElementById('invite-email').value,
                role_id: 3, // default mitglied
                group_id: 1 // default hauptfeuerwache
            };
            const res = await fetch('/api/invitations', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
            if(res.ok) {
                const out = await res.json();
                const resDiv = document.getElementById('invite-result');
                resDiv.textContent = `Token: ${out.token}`;
                resDiv.classList.remove('hidden');
            }
        });
    }

    // === 6. Init ===
    const localTheme = localStorage.getItem('theme');
    if (localTheme) applyTheme(localTheme);
    else applyTheme('dark'); 
    
    loadKumpelConfig();
    loadAccountConfig();
    startPolling();
});
