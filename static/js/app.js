document.addEventListener('DOMContentLoaded', () => {
    // === 1. System & UI Basics ===
    
    // Clock setup
    const updateClock = () => {
        const now = new Date();
        document.getElementById('clock').textContent = now.toLocaleTimeString('de-DE');
    };
    setInterval(updateClock, 1000);
    updateClock();

    // Function to check and enforce permissions live
    window.checkPermissionsLive = async () => {
        try {
            const res = await fetch('/api/users/me/permissions');
            if (res.ok) {
                const data = await res.json();
                window.CURRENT_PERMISSIONS = data.permissions;
                const perms = data.permissions;
                
                // Update UI visibility based on data-req-perm
                document.querySelectorAll('[data-req-perm]').forEach(el => {
                    const reqPerms = el.getAttribute('data-req-perm').split(',');
                    const hasPerm = perms.all || reqPerms.some(p => perms[p]);
                    if (hasPerm) {
                        el.classList.remove('hidden');
                    } else {
                        el.classList.add('hidden');
                        // If this is a tab button and it's active, kick user to dashboard
                        if (el.classList.contains('active') && el.classList.contains('tab-btn')) {
                            document.querySelector('.tab-btn[data-tab="dashboard"]').click();
                            showToast('Dir wurden die Berechtigungen für diesen Bereich entzogen.', 'warning');
                        }
                    }
                });
            }
        } catch (e) {
            console.error('Failed to update live permissions', e);
        }
    };

    // Initialize UI with CURRENT_PERMISSIONS (injected in HTML)
    const initPermissionsUI = () => {
        const perms = window.CURRENT_PERMISSIONS || {};
        document.querySelectorAll('[data-req-perm]').forEach(el => {
            const reqPerms = el.getAttribute('data-req-perm').split(',');
            const hasPerm = perms.all || reqPerms.some(p => perms[p]);
            if (hasPerm) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });
    };
    initPermissionsUI();

    // Load groups into the new-mission dropdown (runs on page load and on modal open)
    const loadGroupsForMissionModal = async () => {
        const sel = document.getElementById('new-mission-group');
        if (!sel) return;
        try {
            const res = await fetch('/api/groups');
            if (!res.ok) return;
            const groups = await res.json();
            if (!Array.isArray(groups) || groups.length === 0) {
                sel.innerHTML = '<option value="">Keine Gruppen vorhanden</option>';
                return;
            }
            sel.innerHTML = groups.map(g =>
                `<option value="${g.id}" data-color="${g.color || '#e11d48'}">${g.group_name}</option>`
            ).join('');
        } catch (e) {
            console.error('Gruppen konnten nicht geladen werden', e);
        }
    };
    loadGroupsForMissionModal(); // pre-load on page ready

    // Also reload every time ANY "Neuer Einsatz" button opens the modal
    document.addEventListener('click', (e) => {
        if (e.target.closest && e.target.closest('[onclick*="modal-new-mission"]')) {
            loadGroupsForMissionModal();
        }
    });

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

    let lastToastMessage = '';
    let lastToastTime = 0;
    const showToast = (message, type = 'info') => {
        const now = Date.now();
        if (message === lastToastMessage && now - lastToastTime < 3000) {
            return; // Silent cooldown
        }
        lastToastMessage = message;
        lastToastTime = now;
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

    // === 2.b Font Size Management ===
    const fontSlider = document.getElementById('font-size-slider');
    const fontLabel = document.getElementById('font-size-label');
    
    const applyFontSize = (val) => {
        document.documentElement.style.fontSize = `${val}%`;
        if (fontLabel) fontLabel.textContent = `${val}%`;
        if (fontSlider && fontSlider.value != val) fontSlider.value = val;
    };

    const savedFontSize = localStorage.getItem('globalFontSize');
    if (savedFontSize) {
        applyFontSize(savedFontSize);
    }

    if (fontSlider) {
        fontSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            applyFontSize(val);
            localStorage.setItem('globalFontSize', val);
        });
    }

    // === 3. Map & Geocoding ===
    let map = null;
    let markers = {};
    const geoCache = JSON.parse(localStorage.getItem('geoCache') || '{}');
    const initMap = () => {
        if(document.getElementById('map')) {
            const austriaBounds = L.latLngBounds(
                [46.3, 9.4], // South West
                [49.1, 17.2] // North East
            );
            map = L.map('map', {
                center: [47.5162, 14.5501],
                zoom: 7,
                minZoom: 6,
                maxBounds: austriaBounds,
                maxBoundsViscosity: 0.8
            });
            window._leafletMap = map; // exposed for expand/collapse invalidation
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(map);

            // Fetch Austria boundary to grey out the rest of the world
            fetch('https://nominatim.openstreetmap.org/search?country=Austria&polygon_geojson=1&format=json')
                .then(res => res.json())
                .then(data => {
                    if(data && data[0] && data[0].geojson) {
                        const worldCoords = [
                            [90, -180], [90, 180], [-90, 180], [-90, -180], [90, -180]
                        ];
                        let coords = [worldCoords];
                        
                        const geojsonCoords = data[0].geojson.coordinates;
                        if (data[0].geojson.type === 'Polygon') {
                            coords.push(geojsonCoords[0].map(c => [c[1], c[0]]));
                        } else if (data[0].geojson.type === 'MultiPolygon') {
                            geojsonCoords.forEach(poly => {
                                coords.push(poly[0].map(c => [c[1], c[0]]));
                            });
                        }
                        
                        L.polygon(coords, {
                            color: 'transparent',
                            fillColor: '#000',
                            fillOpacity: 0.65,
                            fillRule: 'evenodd'
                        }).addTo(map);
                    }
                })
                .catch(err => console.error('Error fetching Austria boundary', err));

            setTimeout(() => {
                if (map) map.invalidateSize();
            }, 500);
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

    let missionLines = {};
    let missionMarkersLocal = {};
    const centralLocation = [47.5162, 14.5501]; // Default Center

    const drawMissionsOnMap = (missions) => {
        if (!map) return;
        
        const currentIds = missions.map(m => m.id);
        
        // Remove old lines and markers
        for (let id in missionLines) {
            if (!currentIds.includes(parseInt(id))) {
                map.removeLayer(missionLines[id]);
                delete missionLines[id];
            }
        }
        for (let id in missionMarkersLocal) {
            if (!currentIds.includes(parseInt(id))) {
                map.removeLayer(missionMarkersLocal[id]);
                delete missionMarkersLocal[id];
            }
        }

        for (let m of missions) {
            // Visibility Check
            let isVisible = false;
            if (window.currentRole === 'Admin') {
                isVisible = true;
            } else if (window.currentGroupId && window.currentGroupId == m.group_id) {
                isVisible = true;
            }

            if (isVisible && m.lat && m.lng && m.status === 'active') {
                const targetCoords = [m.lat, m.lng];
                
                // Draw Marker
                if (!missionMarkersLocal[m.id]) {
                    const markerColor = m.color_code || '#e11d48';
                    const html = `<div style="width:24px; height:24px; background-color:${markerColor}; border-radius:50%; border:3px solid white; box-shadow: 0 0 10px ${markerColor};"></div>`;
                    const icon = L.divIcon({ className: 'mission-div-icon', html, iconSize:[24,24], iconAnchor:[12,12] });
                    const marker = L.marker(targetCoords, {icon}).bindPopup(`<b>${m.title}</b><br>${m.address || ''}`).addTo(map);
                    missionMarkersLocal[m.id] = marker;
                }

                // Draw Line
                if (!missionLines[m.id]) {
                    const lineColor = m.color_code || '#e11d48';
                    const polyline = L.polyline([centralLocation, targetCoords], {
                        color: lineColor,
                        weight: 4,
                        opacity: 0.8,
                        dashArray: '10, 10'
                    }).addTo(map);
                    missionLines[m.id] = polyline;
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
            
            const osIcon = document.getElementById('os-icon');
            if (osIcon) {
                if (data.os.toLowerCase().includes('windows')) {
                    osIcon.className = 'fa-brands fa-windows text-blue-600 dark:text-blue-400 text-xl';
                } else if (data.os.toLowerCase().includes('mac')) {
                    osIcon.className = 'fa-brands fa-apple text-gray-800 dark:text-gray-200 text-xl';
                } else {
                    osIcon.className = 'fa-brands fa-linux text-yellow-600 dark:text-yellow-400 text-xl';
                }
            }
            
            document.getElementById('cpu-ram-stat').textContent = `${data.cpu.toFixed(1)}% | ${data.ram_used_gb} GB / ${data.ram_total_gb} GB (${data.ram_percent}%)`;
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
                description: document.getElementById('group-desc').value,
                color: document.getElementById('group-color')?.value || '#e11d48'
            };
            const res = await fetch('/api/db/groups', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
            if(res.ok) {
                showToast('Gruppe erstellt', 'success');
                if(typeof loadGroupsManagement === 'function') loadGroupsManagement();
            } else {
                showToast('Fehler beim Erstellen der Gruppe', 'error');
            }
        });
    }

    window.deleteUser = async (id) => {
        if (!confirm('Dieses Mitglied wirklich löschen?')) return;
        try {
            const res = await fetch(`/api/db/users/${id}`, { method: 'DELETE' });
            if(res.ok) {
                showToast('Mitglied gelöscht', 'success');
            } else {
                showToast('Fehler beim Löschen', 'error');
            }
        } catch(e) {
            console.error(e);
        }
    };

    window.openEditMemberModal = async (id) => {
        const user = window.allUsers.find(u => u.id === id);
        if (!user) return;
        document.getElementById('edit-member-id').value = user.id;
        document.getElementById('edit-member-firstname').value = user.first_name || '';
        document.getElementById('edit-member-lastname').value = user.last_name || '';
        document.getElementById('edit-member-username').value = user.username || '';
        document.getElementById('edit-member-group').value = user.group_id || '';
        
        try {
            const rolesRes = await fetch('/api/db/roles');
            if (rolesRes.ok) {
                const roles = await rolesRes.json();
                const roleSelect = document.getElementById('edit-member-role');
                if (roleSelect) {
                    roleSelect.innerHTML = '';
                    roles.forEach(r => {
                        const opt = document.createElement('option');
                        opt.value = r.id;
                        opt.textContent = r.role_name;
                        roleSelect.appendChild(opt);
                    });
                    roleSelect.value = user.role_id || '';
                }
            }
        } catch(e) {}
        
        document.getElementById('edit-member-modal').classList.remove('hidden');
    };

    window.closeModal = (modalId) => {
        document.getElementById(modalId).classList.add('hidden');
    };

    // Form handlers
    const createUserForm = document.getElementById('create-user-form');
    if (createUserForm) {
        createUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const first_name = document.getElementById('new-user-firstname').value;
            const last_name = document.getElementById('new-user-lastname').value;
            const group_id = document.getElementById('new-user-group').value || null;
            
            try {
                const res = await fetch('/api/users', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({first_name, last_name, group_id})
                });
                const data = await res.json();
                if(data.success) {
                    createUserForm.reset();
                    document.getElementById('new-member-username').textContent = data.username;
                    const tokenLink = window.location.origin + '/invite/' + data.token;
                    document.getElementById('new-member-token').value = tokenLink;
                    document.getElementById('new-member-modal').classList.remove('hidden');
                } else {
                    showToast(data.error || 'Fehler beim Erstellen', 'error');
                }
            } catch(err) {
                console.error(err);
                showToast('Verbindungsfehler', 'error');
            }
        });
    }

    const editMemberForm = document.getElementById('edit-member-form');
    if (editMemberForm) {
        editMemberForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('edit-member-id').value;
            const payload = {
                first_name: document.getElementById('edit-member-firstname').value,
                last_name: document.getElementById('edit-member-lastname').value,
                username: document.getElementById('edit-member-username').value,
                group_id: document.getElementById('edit-member-group').value || null,
                role_id: document.getElementById('edit-member-role') ? document.getElementById('edit-member-role').value : null
            };
            try {
                const res = await fetch(`/api/db/users/${id}`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });
                if(res.ok) {
                    showToast('Mitglied aktualisiert', 'success');
                    closeModal('edit-member-modal');
                } else {
                    showToast('Fehler beim Aktualisieren', 'error');
                }
            } catch(err) {
                console.error(err);
            }
        });
    }

    window.copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Kopiert!', 'success');
        });
    };

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

    // === 5.5 Socket.IO & Owner Tab ===
    let socket;
    if (typeof io !== 'undefined') {
        socket = io();

        socket.on('permissions_updated', () => {
            checkPermissionsLive();
            if (typeof window.loadRolesMatrix === 'function') {
                window.loadRolesMatrix();
            }
        });

        socket.on('users_update', async () => {
            checkPermissionsLive();
            if (typeof window.loadGroupsManagement === 'function') {
                window.loadGroupsManagement();
            }
            
            // Fetch current user details to update top right header
            try {
                const res = await fetch('/api/users');
                if (res.ok) {
                    const users = await res.json();
                    const me = users.find(u => u.id === window.currentUserId);
                    if (me) {
                        const nameEl = document.getElementById('header-user-name');
                        if (nameEl && nameEl.textContent !== me.username) {
                            nameEl.textContent = me.username;
                        }
                        // Fetch roles to get role name
                        const rolesRes = await fetch('/api/db/roles');
                        if (rolesRes.ok) {
                            const roles = await rolesRes.json();
                            const myRole = roles.find(r => r.id === me.role_id);
                            if (myRole) {
                                const roleEl = document.getElementById('header-user-role');
                                if (roleEl && roleEl.textContent !== myRole.role_name) {
                                    roleEl.textContent = myRole.role_name;
                                    window.currentRole = myRole.role_name;
                                }
                            }
                        }
                    }
                }
            } catch(e) {
                console.error('Failed to update current user info', e);
            }
        });

        socket.on('server_message', (data) => {
            showToast(data.msg, data.type === 'error' ? 'error' : 'success');
        });

        socket.on('logs_data', (logs) => {
            const viewer = document.getElementById('log-viewer');
            if (viewer) {
                viewer.innerHTML = logs.map(l => {
                    const color = l.level === 'ERROR' ? 'text-red-500' : (l.level === 'WARNING' ? 'text-yellow-500' : 'text-green-400');
                    return `<span class="text-gray-500">[${l.timestamp}]</span> <span class="${color} font-bold">${l.level}</span> ${l.message}`;
                }).join('\n');
                viewer.scrollTop = viewer.scrollHeight;
            }
        });

        socket.on('sys_stats', (stats) => {
            const cpuRamEl = document.getElementById('cpu-ram-stat');
            if(cpuRamEl) {
                cpuRamEl.textContent = `${stats.cpu}% | ${stats.ram_used_gb} GB / ${stats.ram_total_gb} GB (${stats.ram_percent}%)`;
            }
        });

        socket.on('missions_update', () => {
            if (document.querySelector('.tab-btn[data-tab="missions"]')?.classList.contains('active')) {
                loadMissions();
            }
        });

        socket.on('vehicles_update', () => {
            if (document.querySelector('.tab-btn[data-tab="missions"]')?.classList.contains('active')) {
                loadVehicles();
            }
        });

        // Listen to live mission log updates
        socket.on('mission_logs_update', (data) => {
            if (window.currentOpenMissionId === data.mission_id) {
                loadMissionLogs(data.mission_id);
            }
        });

        window.revealToken = async (btn, token) => {
            if (!token) {
                showToast('Kein Token vorhanden', 'info');
                return;
            }
            
            // If already showing token, hide it
            if (btn.dataset.showing === 'true') {
                btn.innerHTML = '<i class="fa-solid fa-key"></i>';
                btn.dataset.showing = 'false';
                btn.classList.replace('bg-gray-500', 'bg-blue-600');
                btn.classList.replace('hover:bg-gray-600', 'hover:bg-blue-700');
                return;
            }

            const pwd = prompt("Bitte Admin-Passwort eingeben, um den Token anzuzeigen:");
            if (!pwd) return;

            try {
                const res = await fetch('/api/verify_password', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({password: pwd})
                });
                const data = await res.json();
                if (data.success) {
                    const tokenLink = window.location.origin + '/invite/' + token;
                    // Show it inline on the button
                    btn.innerHTML = `<span class="font-mono">${tokenLink}</span> <i class="fa-solid fa-eye-slash ml-1"></i>`;
                    btn.dataset.showing = 'true';
                    btn.classList.replace('bg-blue-600', 'bg-gray-500');
                    btn.classList.replace('hover:bg-blue-700', 'hover:bg-gray-600');
                } else {
                    showToast(data.error || 'Falsches Passwort', 'error');
                }
            } catch (e) {
                showToast('Verbindungsfehler', 'error');
            }
        };

        const btnRestart = document.getElementById('btn-system-restart');
        if (btnRestart) {
            btnRestart.addEventListener('click', () => {
                if (confirm('Wirklich das Backend neu starten?')) socket.emit('system_action', {action: 'restart'});
            });
        }
        
        const btnShutdown = document.getElementById('btn-system-shutdown');
        if (btnShutdown) {
            btnShutdown.addEventListener('click', () => {
                if (confirm('Wirklich herunterfahren? Das Dashboard ist danach offline!')) socket.emit('system_action', {action: 'shutdown'});
            });
        }

        const btnLogs = document.getElementById('btn-refresh-logs');
        if (btnLogs) {
            btnLogs.addEventListener('click', () => socket.emit('get_logs'));
        }
    }

    const loadPermissionsMatrix = async () => {
        try {
            const res = await fetch('/api/db/roles');
            const roles = await res.json();
            
            const head = document.getElementById('perm-matrix-head');
            const body = document.getElementById('perm-matrix-body');
            if (!head || !body) return;

            const ALL_PERMISSIONS = {
                "all": "Vollzugriff (Gott-Modus)",
                "trigger_alarm": "Alarm auslösen",
                "manage_users": "Nutzer verwalten",
                "view_only": "Nur Lesen",
                "manage_missions": "Einsätze verwalten",
                "edit_log": "Einsatz-Protokoll bearbeiten",
                "manage_groups": "Gruppen verwalten",
                "manage_vehicles": "Fahrzeuge/Ausrüstung verwalten",
                "manage_settings": "Einstellungen verwalten",
                "manage_roles": "Rechte-Matrix verwalten",
                "manage_system": "Systemsteuerung (Neustart/Shutdown)"
            };

            const permKeys = Object.keys(ALL_PERMISSIONS);

            head.innerHTML = '<th class="p-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">Funktion</th>' + 
                             roles.map(r => `<th class="p-4 border-b border-gray-200 dark:border-gray-700"><span class="rank-badge">${r.role_name}</span></th>`).join('');

            body.innerHTML = permKeys.map(key => {
                return `
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <td class="p-4 text-left font-semibold text-gray-700 dark:text-gray-300">${ALL_PERMISSIONS[key]}</td>
                        ${roles.map(r => {
                            let perms = {};
                            try { perms = JSON.parse(r.permissions); } catch(e){}
                            const isChecked = perms[key] === true ? 'checked' : '';
                            return `
                                <td class="p-4">
                                    <label class="switch">
                                        <input type="checkbox" data-role-id="${r.id}" data-perm-key="${key}" ${isChecked} onchange="updatePerm(this)">
                                        <span class="slider"></span>
                                    </label>
                                </td>
                            `;
                        }).join('')}
                    </tr>
                `;
            }).join('');
        } catch(e) { console.error(e); }
    };

    window.updatePerm = async (checkbox) => {
        const roleId = parseInt(checkbox.dataset.roleId);
        const permKey = checkbox.dataset.permKey;
        const isChecked = checkbox.checked;

        const res = await fetch('/api/db/roles');
        const roles = await res.json();
        const role = roles.find(r => r.id === roleId);
        let perms = {};
        try { perms = JSON.parse(role.permissions); } catch(e){}
        
        perms[permKey] = isChecked;

        if (socket) {
            socket.emit('update_permissions', {
                role_id: roleId,
                permissions: perms
            });
        }
    };

    // Load extra data on tab switch
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (e.currentTarget.dataset.tab === 'owner') {
                loadPermissionsMatrix();
                if (socket) socket.emit('get_logs');
            }
        });
    });

    const loadSystemConfig = async () => {
        try {
            const res = await fetch('/api/db/settings');
            const data = await res.json();
            
            let port = 5000, domain = '', mode = 'lan', ssid = '';
            data.forEach(item => {
                if(item.key === 'port') port = item.value;
                if(item.key === 'local_domain') domain = item.value;
                if(item.key === 'network_mode') mode = item.value;
                if(item.key === 'wifi_ssid') ssid = item.value;
            });
            
            const sysPort = document.getElementById('sys-port');
            const sysDomain = document.getElementById('sys-domain');
            if(sysPort) sysPort.value = port;
            if(sysDomain) sysDomain.value = domain;
            
            // Set radio button and toggle config
            const modeRadios = document.getElementsByName('network_mode');
            if(modeRadios.length > 0) {
                modeRadios.forEach(r => {
                    if(r.value === mode) r.checked = true;
                });
                toggleWifiConfig(mode);
            }
        } catch(e) {}
    };

    const loadSecurityConfig = async () => {
        try {
            const res = await fetch('/api/system/security');
            const data = await res.json();
            const secTimeout = document.getElementById('sec-timeout');
            const secMaintenance = document.getElementById('sec-maintenance');
            if(secTimeout) secTimeout.value = data.session_timeout;
            if(secMaintenance) secMaintenance.checked = (data.maintenance_mode === '1');
        } catch(e) {}
    };

    window.toggleWifiConfig = (mode) => {
        const container = document.getElementById('wifi-config-container');
        if(!container) return;
        if(mode === 'wlan') container.classList.remove('hidden');
        else container.classList.add('hidden');
    };

    const networkForm = document.getElementById('network-form');
    if(networkForm) {
        networkForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const mode = document.querySelector('input[name="network_mode"]:checked').value;
            const data = {
                port: document.getElementById('sys-port').value,
                local_domain: document.getElementById('sys-domain').value,
                network_mode: mode
            };
            try {
                const res = await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                if(res.ok) {
                    showToast('Systemkonfiguration gespeichert.', 'success');
                    alert('Falls du den Port geändert hast, musst du das Backend (via Systemsteuerung oder Konsole) neu starten, damit die Änderung wirksam wird.');
                }
            } catch(e) {
                showToast('Fehler beim Speichern', 'error');
            }
        });
    }

    const securityForm = document.getElementById('security-form');
    if(securityForm) {
        securityForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const data = {
                session_timeout: document.getElementById('sec-timeout').value,
                maintenance_mode: document.getElementById('sec-maintenance').checked ? '1' : '0'
            };
            try {
                const res = await fetch('/api/system/security', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                if(res.ok) {
                    showToast('Sicherheitseinstellungen gespeichert.', 'success');
                } else {
                    showToast('Fehler beim Speichern', 'error');
                }
            } catch(e) {
                showToast('Verbindungsfehler', 'error');
            }
        });
    }

    const btnSystemUpdate = document.getElementById('btn-system-update');
    if(btnSystemUpdate) {
        btnSystemUpdate.addEventListener('click', async () => {
            const btnText = btnSystemUpdate.innerText;
            btnSystemUpdate.disabled = true;
            btnSystemUpdate.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Update läuft...';
            try {
                const res = await fetch('/api/system/update', { method: 'POST' });
                const data = await res.json();
                if(res.ok && data.status === 'up_to_date') {
                    showToast('Das System ist bereits auf dem neuesten Stand.', 'success');
                } else if(res.ok) {
                    showToast('Update erfolgreich! Das System startet nun neu.', 'success');
                    setTimeout(() => window.location.reload(), 4000); // Reload after 4s
                } else {
                    showToast('Fehler beim Update: ' + (data.error || 'Unbekannt'), 'error');
                }
            } catch(e) {
                showToast('Verbindungsfehler beim Update.', 'error');
            } finally {
                btnSystemUpdate.disabled = false;
                btnSystemUpdate.innerText = btnText;
            }
        });
    }

    const btnScanWifi = document.getElementById('btn-scan-wifi');
    if(btnScanWifi) {
        btnScanWifi.addEventListener('click', async () => {
            btnScanWifi.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Suche...';
            try {
                const res = await fetch('/api/network/wifi/scan');
                const data = await res.json();
                const select = document.getElementById('wifi-ssid');
                select.innerHTML = '';
                if(data.networks && data.networks.length > 0) {
                    data.networks.forEach(n => {
                        select.innerHTML += `<option value="${n}">${n}</option>`;
                    });
                } else {
                    select.innerHTML = '<option value="">Keine Netzwerke gefunden</option>';
                }
            } catch(e) {
                showToast('Fehler beim WLAN Scan', 'error');
            }
            btnScanWifi.innerHTML = '<i class="fa-solid fa-rotate mr-1"></i> Suchen';
        });
    }

    const btnConnectWifi = document.getElementById('btn-connect-wifi');
    if(btnConnectWifi) {
        btnConnectWifi.addEventListener('click', async () => {
            const ssid = document.getElementById('wifi-ssid').value;
            const password = document.getElementById('wifi-password').value;
            if(!ssid) return alert("Bitte wähle ein Netzwerk aus.");
            
            btnConnectWifi.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Verbinde...';
            try {
                const res = await fetch('/api/network/wifi/connect', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ssid, password})
                });
                const data = await res.json();
                if(data.success) {
                    showToast(data.msg, 'success');
                    // Save SSID to settings
                    await fetch('/api/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({wifi_ssid: ssid})
                    });
                } else {
                    showToast(data.error || 'Verbindung fehlgeschlagen', 'error');
                }
            } catch(e) {
                showToast('Netzwerkfehler', 'error');
            }
            btnConnectWifi.innerHTML = '<i class="fa-solid fa-wifi mr-2"></i> Mit WLAN verbinden';
        });
    }

    // === 5.6 Missions & Vehicles Logic ===
    window.currentOpenMissionId = null;

    window.loadMissions = async () => {
        try {
            const res = await fetch('/api/missions');
            const missions = await res.json();
            const list = document.getElementById('missions-list');
            if(!list) return;

            if(missions.length === 0) {
                list.innerHTML = '<div class="text-center text-gray-500 py-4">Keine aktiven Einsätze.</div>';
                return;
            }

            list.innerHTML = missions.map(m => `
                <div class="p-3 border border-gray-200 dark:border-gray-700 rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" onclick="openMissionDetail(${m.id})" style="border-left: 4px solid ${m.color_code}">
                    <div class="font-bold truncate">${m.title}</div>
                    <div class="text-xs text-gray-500 mt-1">${m.group_name || 'Keine Gruppe'} • ${new Date(m.created_at).toLocaleString()}</div>
                    ${m.status === 'completed' ? '<span class="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">Abgeschlossen</span>' : '<span class="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">Aktiv</span>'}
                </div>
            `).join('');
            
            // Populate group select in new mission modal
            const gRes = await fetch('/api/groups');
            const groups = await gRes.json();
            const gSelect = document.getElementById('new-mission-group');
            if(gSelect) {
                gSelect.innerHTML = groups.map(g => `<option value="${g.id}" data-color="${g.color || '#e11d48'}">${g.group_name}</option>`).join('');
            }
            
            drawMissionsOnMap(missions);
        } catch(e) {
            console.error(e);
        }
    };

    window.loadVehicles = async () => {
        try {
            const res = await fetch('/api/vehicles');
            const vehicles = await res.json();
            
            // Global overview table
            const tbody = document.getElementById('global-vehicles-tbody');
            if(tbody) {
                tbody.innerHTML = vehicles.map(v => `
                    <tr>
                        <td class="p-3 font-bold">${v.name}</td>
                        <td class="p-3">${v.type || '-'}</td>
                        <td class="p-3">
                            <select class="bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 p-1 rounded cursor-pointer outline-none" onchange="updateVehicleStatus(${v.id}, this.value)">
                                <option value="available" ${v.status === 'available' ? 'selected' : ''}>Verfügbar (Frei)</option>
                                <option value="deployed" ${v.status === 'deployed' ? 'selected' : ''}>Im Einsatz</option>
                                <option value="maintenance" ${v.status === 'maintenance' ? 'selected' : ''}>Wartung / Defekt</option>
                            </select>
                        </td>
                        <td class="p-3">${v.current_mission_id ? `Einsatz #${v.current_mission_id}` : '-'}</td>
                        <td class="p-3 text-right">
                            <button onclick="deleteVehicle(${v.id})" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    </tr>
                `).join('');
            }

            // Also update the select dropdown in mission detail view
            if(window.currentOpenMissionId) {
                const select = document.getElementById('assign-vehicle-select');
                if(select) {
                    const availableVehicles = vehicles.filter(v => !v.current_mission_id && v.status === 'available');
                    select.innerHTML = '<option value="">Fahrzeug wählen...</option>' + availableVehicles.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
                }

                // Update the list of vehicles currently assigned to this mission
                const assignedList = document.getElementById('mission-vehicles-list');
                if(assignedList) {
                    const assignedVehicles = vehicles.filter(v => v.current_mission_id === window.currentOpenMissionId);
                    if(assignedVehicles.length === 0) {
                        assignedList.innerHTML = '<div class="text-xs text-gray-500">Keine Fahrzeuge zugewiesen.</div>';
                    } else {
                        assignedList.innerHTML = assignedVehicles.map(v => {
                            let equipHtml = '';
                            if (v.equipment_list) {
                                const items = v.equipment_list.split(',').map(i => i.trim()).filter(i => i);
                                let state = {};
                                try { state = JSON.parse(v.checklist_state || '{}'); } catch(e){}
                                
                                equipHtml = `<div class="mt-2 pt-2 border-t border-gray-300 dark:border-gray-600 text-sm">
                                    <div class="font-semibold mb-1 text-gray-600 dark:text-gray-400">Ausrüstungs-Checkliste:</div>
                                    <div class="space-y-1 pl-2">
                                        ${items.map(item => `
                                            <label class="flex items-center space-x-2 cursor-pointer">
                                                <input type="checkbox" onchange="toggleVehicleChecklist(${v.id}, '${item}', this.checked)" ${state[item] ? 'checked' : ''} class="rounded text-neon-green focus:ring-neon-green bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700">
                                                <span class="${state[item] ? 'line-through text-gray-400' : ''}">${item}</span>
                                            </label>
                                        `).join('')}
                                    </div>
                                </div>`;
                            }
                            
                            return `
                                <div class="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 mb-2">
                                    <div class="flex justify-between items-center">
                                        <span class="text-md font-bold"><i class="fa-solid fa-truck text-red-500 mr-2"></i>${v.name}</span>
                                        <button onclick="unassignVehicle(${v.id})" class="text-xs bg-red-600 hover:bg-red-500 transition-colors text-white px-3 py-1.5 rounded-lg shadow">Abziehen</button>
                                    </div>
                                    ${equipHtml}
                                </div>
                            `;
                        }).join('');
                    }
                }
            }
        } catch(e) {
            console.error(e);
        }
    };

    window.loadMissionLogs = async (missionId) => {
        try {
            const res = await fetch(`/api/missions/${missionId}/logs`);
            const logs = await res.json();
            const container = document.getElementById('mission-logs-container');
            if(container) {
                container.innerHTML = logs.map(l => `
                    <div>
                        <span class="text-gray-500 dark:text-gray-400">[${new Date(l.timestamp).toLocaleTimeString()}]</span>
                        <span class="text-blue-500 font-bold">${l.username || 'System'}:</span>
                        <span>${l.log_text}</span>
                    </div>
                `).join('');
                container.scrollTop = container.scrollHeight;
            }
        } catch(e) {
            console.error(e);
        }
    };

    window.openMissionDetail = async (id) => {
        window.currentOpenMissionId = id;
        document.getElementById('mission-detail-placeholder').classList.add('hidden');
        document.getElementById('mission-detail-view').classList.remove('hidden');
        
        try {
            const res = await fetch('/api/missions');
            const missions = await res.json();
            const mission = missions.find(m => m.id === id);
            
            if(mission) {
                document.getElementById('mission-detail-title').textContent = `Einsatz: ${mission.title}`;
                document.getElementById('mission-detail-desc').textContent = mission.description || 'Keine Beschreibung vorhanden.';
                
                const btnComplete = document.getElementById('btn-complete-mission');
                const btnDelete = document.getElementById('btn-delete-mission');
                
                btnComplete.classList.remove('hidden');
                btnDelete.classList.remove('hidden');
                
                btnComplete.onclick = async () => {
                    if(!confirm('Diesen Einsatz wirklich abschließen?')) return;
                    try {
                        const res = await fetch(`/api/missions/${id}`, {
                            method: 'PUT',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({...mission, status: 'completed'})
                        });
                        if (res.ok) {
                            showToast('Einsatz abgeschlossen', 'success');
                            document.getElementById('mission-detail-placeholder').classList.remove('hidden');
                            document.getElementById('mission-detail-view').classList.add('hidden');
                            window.currentOpenMissionId = null;
                            if(typeof loadMissions === 'function') loadMissions();
                        } else {
                            showToast('Fehler beim Abschließen', 'error');
                        }
                    } catch(e) {
                        console.error(e);
                        showToast('Verbindungsfehler', 'error');
                    }
                };

                btnDelete.onclick = async () => {
                    if(confirm('Diesen Einsatz wirklich löschen?')) {
                        try {
                            const res = await fetch(`/api/missions/${id}`, { method: 'DELETE' });
                            if (res.ok) {
                                showToast('Einsatz gelöscht', 'success');
                                document.getElementById('mission-detail-placeholder').classList.remove('hidden');
                                document.getElementById('mission-detail-view').classList.add('hidden');
                                window.currentOpenMissionId = null;
                                if(typeof loadMissions === 'function') loadMissions();
                            } else {
                                showToast('Fehler beim Löschen', 'error');
                            }
                        } catch(e) {
                            console.error(e);
                            showToast('Verbindungsfehler', 'error');
                        }
                    }
                };

                loadVehicles();
                loadMissionLogs(id);
            }
        } catch(e) {}
    };

    const newMissionForm = document.getElementById('new-mission-form');
    if(newMissionForm) {
        newMissionForm.addEventListener('submit', async(e) => {
            e.preventDefault();
            const groupSelect = document.getElementById('new-mission-group');
            const selectedOption = groupSelect.options[groupSelect.selectedIndex];
            const plz = document.getElementById('new-mission-plz').value.trim();
            const city = document.getElementById('new-mission-city').value.trim();
            const street = document.getElementById('new-mission-street').value.trim();
            const hnr = document.getElementById('new-mission-hnr').value.trim();
            
            const address = `${street} ${hnr}, ${plz} ${city}`;
            
            let lat = null;
            let lng = null;

            if (address) {
                try {
                    const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=at`);
                    const geoData = await geoRes.json();
                    if (geoData && geoData.length > 0) {
                        lat = parseFloat(geoData[0].lat);
                        lng = parseFloat(geoData[0].lon);
                    }
                } catch(e) {
                    console.error("Geocoding fehlgeschlagen:", e);
                }
            }
            
            const data = {
                title: document.getElementById('new-mission-title').value,
                description: document.getElementById('new-mission-desc').value,
                address: address,
                lat: lat,
                lng: lng,
                group_id: selectedOption ? selectedOption.value : null,
                color_code: selectedOption ? selectedOption.dataset.color : '#e11d48'
            };
            
            const res = await fetch('/api/missions', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
            if(res.ok) {
                const out = await res.json();
                document.getElementById('modal-new-mission').classList.add('hidden');
                newMissionForm.reset();
                showToast('Einsatz erstellt', 'success');
                openMissionDetail(out.mission_id);
            }
        });
    }

    const newVehicleForm = document.getElementById('new-vehicle-form');
    if(newVehicleForm) {
        newVehicleForm.addEventListener('submit', async(e) => {
            e.preventDefault();
            const data = {
                name: document.getElementById('new-vehicle-name').value,
                type: document.getElementById('new-vehicle-type').value,
                equipment_list: document.getElementById('new-vehicle-equip').value
            };
            const res = await fetch('/api/vehicles', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
            if(res.ok) {
                document.getElementById('modal-new-vehicle').classList.add('hidden');
                newVehicleForm.reset();
                showToast('Fahrzeug hinzugefügt', 'success');
            }
        });
    }

    window.updateVehicleStatus = async (id, status) => {
        await fetch(`/api/vehicles/${id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({status})
        });
    };

    window.deleteVehicle = async (id) => {
        if(confirm('Fahrzeug wirklich löschen?')) {
            await fetch(`/api/vehicles/${id}`, { method: 'DELETE' });
        }
    };

    const assignVehicleBtn = document.getElementById('btn-assign-vehicle');
    if(assignVehicleBtn) {
        assignVehicleBtn.addEventListener('click', async() => {
            const vId = document.getElementById('assign-vehicle-select').value;
            if(!vId || !window.currentOpenMissionId) return;
            
            await fetch(`/api/vehicles/${vId}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({current_mission_id: window.currentOpenMissionId, status: 'deployed'})
            });
            
            // Log entry
            await fetch(`/api/missions/${window.currentOpenMissionId}/logs`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({log_text: `Fahrzeug zugewiesen.`})
            });
        });
    }

    window.unassignVehicle = async (id) => {
        await fetch(`/api/vehicles/${id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({current_mission_id: null, status: 'available'})
        });
        
        if(window.currentOpenMissionId) {
            await fetch(`/api/missions/${window.currentOpenMissionId}/logs`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({log_text: `Fahrzeug abgezogen.`})
            });
        }
    };

    window.toggleVehicleChecklist = async (id, item, checked) => {
        try {
            const res = await fetch('/api/vehicles');
            const vehicles = await res.json();
            const v = vehicles.find(x => x.id === id);
            if (!v) return;

            let state = {};
            try { state = JSON.parse(v.checklist_state || '{}'); } catch(e){}
            state[item] = checked;

            await fetch(`/api/vehicles/${id}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({checklist_state: JSON.stringify(state)})
            });
        } catch(e) {
            console.error('Fehler beim Speichern der Checkliste', e);
        }
    };

    const logForm = document.getElementById('mission-log-form');
    if(logForm) {
        logForm.addEventListener('submit', async(e) => {
            e.preventDefault();
            const input = document.getElementById('mission-log-input');
            if(!input.value.trim() || !window.currentOpenMissionId) return;
            
            await fetch(`/api/missions/${window.currentOpenMissionId}/logs`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({log_text: input.value.trim()})
            });
            input.value = '';
        });
    }

    window.loadGroupsManagement = async () => {
        try {
            const res = await fetch('/api/groups');
            const groups = await res.json();
            
            const resUsers = await fetch('/api/users');
            const users = await resUsers.json();
            window.allUsers = users; // Cache for edit modal

            // Render Members List
            const membersListBody = document.getElementById('members-management-list');
            if (membersListBody) {
                membersListBody.innerHTML = users.map(u => {
                    const dateStr = u.created_at ? new Date(u.created_at).toLocaleString('de-DE') : 'Unbekannt';
                    return `
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td class="px-4 py-3 border-b dark:border-gray-700 font-bold">${u.first_name || ''} ${u.last_name || ''}</td>
                        <td class="px-4 py-3 border-b dark:border-gray-700">${u.username}</td>
                        <td class="px-4 py-3 border-b dark:border-gray-700"><span class="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs">${u.role_name || 'Unbekannt'}</span></td>
                        <td class="px-4 py-3 border-b dark:border-gray-700">${u.group_name || '-'}</td>
                        <td class="px-4 py-3 border-b dark:border-gray-700 text-xs text-gray-500">${dateStr}</td>
                        <td class="px-4 py-3 border-b dark:border-gray-700 text-right space-x-2">
                            ${window.currentRole === 'Admin' ? `<button onclick="revealToken(this, '${u.invite_token || ''}')" class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors" title="Token anzeigen"><i class="fa-solid fa-key"></i></button>` : ''}
                            <button onclick="openEditMemberModal(${u.id})" class="px-3 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-xs rounded transition-colors" title="Bearbeiten"><i class="fa-solid fa-pen"></i></button>
                            <button onclick="deleteUser(${u.id})" class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors" title="Löschen"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    </tr>
                    `;
                }).join('');
            }

            // Populate group dropdowns
            const createGroupSelect = document.getElementById('new-user-group');
            if (createGroupSelect) {
                createGroupSelect.innerHTML = '<option value="">(Keine Gruppe)</option>' + groups.map(g => `<option value="${g.id}">${g.group_name}</option>`).join('');
            }
            const editGroupSelect = document.getElementById('edit-member-group');
            if (editGroupSelect) {
                editGroupSelect.innerHTML = '<option value="">(Keine Gruppe)</option>' + groups.map(g => `<option value="${g.id}">${g.group_name}</option>`).join('');
            }

            const grid = document.getElementById('groups-management-grid');
            if(grid) {
                grid.innerHTML = groups.map(g => {
                    let membersHtml = '';
                    if (users) {
                        const groupMembers = users.filter(u => u.group_id === g.id);
                        const otherUsers = users.filter(u => u.group_id !== g.id);
                        
                        let memberList = groupMembers.map(u => `
                            <div class="flex justify-between items-center bg-gray-100 dark:bg-gray-700/50 p-2 rounded mb-1 border border-gray-200 dark:border-gray-700">
                                <span class="text-sm font-semibold text-gray-800 dark:text-gray-200" title="${u.first_name || ''} ${u.last_name || ''}">${u.username}</span>
                                <div class="flex space-x-2">
                                    <button onclick="openEditMemberModal(${u.id})" class="text-xs text-blue-500 hover:text-blue-700"><i class="fa-solid fa-pen"></i></button>
                                    <button onclick="removeUserFromGroup(${u.id})" class="text-xs text-red-500 hover:text-red-700"><i class="fa-solid fa-user-minus"></i></button>
                                    <button onclick="deleteUser(${u.id})" class="text-xs text-red-700 hover:text-red-900"><i class="fa-solid fa-trash"></i></button>
                                </div>
                            </div>
                        `).join('');
                        
                        if (groupMembers.length === 0) {
                            memberList = `<div class="text-xs text-gray-500 italic mb-2">Keine Mitglieder in dieser Gruppe.</div>`;
                        }

                        let addDropdown = `<select id="add-user-${g.id}" class="w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded p-1 text-sm outline-none mb-2">
                            <option value="">+ Mitglied hinzufügen...</option>
                            ${otherUsers.map(u => `<option value="${u.id}">${u.username}</option>`).join('')}
                        </select>
                        <button onclick="addUserToGroup(${g.id})" class="w-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors text-sm font-semibold py-1 rounded">Hinzufügen</button>`;

                        membersHtml = `
                            <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                <label class="text-xs text-gray-500 uppercase font-bold tracking-wider block mb-2">Mitglieder</label>
                                <div class="mb-3 max-h-32 overflow-y-auto pr-1 space-y-1">
                                    ${memberList}
                                </div>
                                ${addDropdown}
                            </div>
                        `;
                    }

                    return `
                    <div class="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-md hover:shadow-lg transition-shadow relative overflow-hidden flex flex-col h-full">
                        <div class="absolute top-0 left-0 w-2 h-full" style="background-color: ${g.color || '#e11d48'}"></div>
                        <div class="pl-4 flex-1">
                            <label class="text-xs text-gray-500 uppercase font-bold tracking-wider block mb-1">Name</label>
                            <input type="text" id="g-name-${g.id}" value="${g.group_name}" class="bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded p-2 w-full text-lg font-bold mb-4 focus:border-neon-green outline-none transition-colors">
                            
                            <label class="text-xs text-gray-500 uppercase font-bold tracking-wider block mb-1">Beschreibung</label>
                            <input type="text" id="g-desc-${g.id}" value="${g.description || ''}" class="bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded p-2 w-full mb-4 focus:border-neon-green outline-none transition-colors">
                            
                            <div class="flex items-center space-x-3">
                                <label class="text-sm font-bold text-gray-700 dark:text-gray-300">Farbe:</label>
                                <input type="color" id="g-color-${g.id}" value="${g.color || '#e11d48'}" class="h-10 w-16 cursor-pointer bg-transparent border-0 p-0 rounded">
                            </div>
                            
                            ${membersHtml}
                        </div>
                        <div class="pl-4 mt-auto flex space-x-2 pt-4 border-t border-gray-100 dark:border-gray-700 mt-4">
                            <button onclick="updateGroup(${g.id})" class="flex-1 bg-blue-600 hover:bg-blue-500 hover:-translate-y-0.5 text-white py-2 rounded text-sm font-bold shadow transition-all"><i class="fa-solid fa-save mr-2"></i>Speichern</button>
                            <button onclick="deleteGroup(${g.id})" class="flex-1 bg-red-600 hover:bg-red-500 hover:-translate-y-0.5 text-white py-2 rounded text-sm font-bold shadow transition-all"><i class="fa-solid fa-trash mr-2"></i>Löschen</button>
                        </div>
                    </div>
                `}).join('');
                
                // Add an "Ungruppiert" card for users without a group
                const unassignedUsers = users.filter(u => !u.group_id);
                if (unassignedUsers.length > 0) {
                    let unassignedList = unassignedUsers.map(u => `
                        <div class="flex justify-between items-center bg-gray-100 dark:bg-gray-700/50 p-2 rounded mb-1 border border-gray-200 dark:border-gray-700">
                            <span class="text-sm font-semibold text-gray-800 dark:text-gray-200" title="${u.first_name || ''} ${u.last_name || ''}">${u.username}</span>
                            <div class="flex space-x-2">
                                <button onclick="openEditMemberModal(${u.id})" class="text-xs text-blue-500 hover:text-blue-700"><i class="fa-solid fa-pen"></i></button>
                                <button onclick="deleteUser(${u.id})" class="text-xs text-red-700 hover:text-red-900"><i class="fa-solid fa-trash"></i></button>
                            </div>
                        </div>
                    `).join('');
                    
                    grid.innerHTML += `
                    <div class="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-md relative overflow-hidden flex flex-col">
                        <div class="absolute top-0 left-0 w-2 h-full bg-gray-400"></div>
                        <div class="pl-4 flex-1">
                            <label class="text-xs text-gray-500 uppercase font-bold tracking-wider block mb-1">Ungruppiert</label>
                            <div class="text-lg font-bold mb-4 text-gray-600 dark:text-gray-400">Mitglieder ohne Gruppe</div>
                            <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                <label class="text-xs text-gray-500 uppercase font-bold tracking-wider block mb-2">Mitglieder</label>
                                <div class="mb-3 max-h-32 overflow-y-auto pr-1 space-y-1">
                                    ${unassignedList}
                                </div>
                            </div>
                        </div>
                    </div>`;
                }
            }
        } catch(e) {
            console.error(e);
        }
    };

    window.updateGroup = async (id) => {
        const name = document.getElementById(`g-name-${id}`).value;
        const desc = document.getElementById(`g-desc-${id}`).value;
        const color = document.getElementById(`g-color-${id}`).value;
        
        const res = await fetch(`/api/db/groups/${id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({group_name: name, description: desc, color: color})
        });
        if(res.ok) {
            showToast('Gruppe gespeichert', 'success');
            loadGroupsManagement();
            loadMissions(); // reload to reflect color changes if any
        }
    };

    window.deleteGroup = async (id) => {
        if(confirm('Gruppe wirklich löschen?')) {
            await fetch(`/api/db/groups/${id}`, { method: 'DELETE' });
            loadGroupsManagement();
        }
    };

    window.removeUserFromGroup = async (userId) => {
        if (confirm('Benutzer aus dieser Gruppe entfernen? (Wird der Standardgruppe 1 zugewiesen)')) {
            await fetch(`/api/users/${userId}/group`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({group_id: 1})
            });
            loadGroupsManagement();
        }
    };

    window.addUserToGroup = async (groupId) => {
        const select = document.getElementById(`add-user-${groupId}`);
        const userId = select.value;
        if (!userId) return;
        
        await fetch(`/api/users/${userId}/group`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({group_id: groupId})
        });
        loadGroupsManagement();
    };

    // Initialize these new tabs if they are active
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if(btn.dataset.tab === 'missions') {
                loadMissions();
                loadVehicles();
            } else if(btn.dataset.tab === 'rights') {
                if(typeof loadGroupsManagement === 'function') loadGroupsManagement();
            }
        });
    });

    // === 6. Init ===
    const localTheme = localStorage.getItem('theme');
    if (localTheme) applyTheme(localTheme);
    else applyTheme('dark'); 
    
    loadKumpelConfig();
    loadAccountConfig();
    loadSystemConfig();
    loadSecurityConfig();
    
    // Initial data load for dropdowns and views
    if (typeof loadGroupsManagement === 'function') loadGroupsManagement();
    if (typeof loadMissions === 'function') loadMissions();
    if (typeof loadVehicles === 'function') loadVehicles();
    
    startPolling();
});
