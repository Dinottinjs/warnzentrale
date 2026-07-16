document.addEventListener('DOMContentLoaded', () => {
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
            // Remove active classes
            tabBtns.forEach(b => {
                b.classList.remove('active', 'border-neon-green', 'text-white');
                b.classList.add('border-transparent', 'text-gray-400');
            });
            tabContents.forEach(c => c.classList.add('hidden'));

            // Add active class to clicked
            btn.classList.remove('border-transparent', 'text-gray-400');
            btn.classList.add('active', 'border-neon-green', 'text-white');
            
            const tabId = `tab-${btn.dataset.tab}`;
            document.getElementById(tabId).classList.remove('hidden');
        });
    });

    // Form elements for settings
    const modeToggle = document.getElementById('mode-toggle');
    const modeLabel = document.getElementById('mode-label');
    const apiSettingsSec = document.getElementById('api-settings-section');
    
    const netType = document.getElementById('net-type');
    const netMethod = document.getElementById('net-method');
    const wlanSettings = document.getElementById('wlan-settings');
    const staticSettings = document.getElementById('static-ip-settings');

    const togglePasswordBtn = document.getElementById('toggle-password');
    const apiKeyInput = document.getElementById('api-key');

    let pollIntervalId = null;
    let currentPollSeconds = 5;

    // Load Settings
    const loadSettings = async () => {
        try {
            const res = await fetch('/api/settings');
            const config = await res.json();
            
            // Populate mode
            const isLive = config.mode === 'live';
            modeToggle.checked = isLive;
            updateModeUI(isLive);
            
            // Populate API settings
            document.getElementById('api-url').value = config.api_url || '';
            document.getElementById('api-key').value = config.api_key || '';
            document.getElementById('poll-interval').value = config.poll_interval || 5;
            
            // Populate network
            if(config.network) {
                netType.value = config.network.type || 'LAN';
                netMethod.value = config.network.method || 'DHCP';
                document.getElementById('net-ssid').value = config.network.ssid || '';
                document.getElementById('net-password').value = config.network.password || '';
                document.getElementById('net-ip').value = config.network.ip || '';
                document.getElementById('net-subnet').value = config.network.subnet || '';
                document.getElementById('net-gateway').value = config.network.gateway || '';
            }
            
            updateNetworkUI();
            
            // Setup polling interval
            currentPollSeconds = parseInt(config.poll_interval) || 5;
            startPolling();

        } catch (e) {
            showToast('Fehler beim Laden der Einstellungen', 'error');
        }
    };

    const updateModeUI = (isLive) => {
        if(isLive) {
            modeLabel.textContent = "Live-API Modus";
            apiSettingsSec.classList.remove('opacity-50', 'pointer-events-none');
            document.getElementById('test-mode-indicator').classList.add('hidden');
        } else {
            modeLabel.textContent = "Test-Modus (Simulator)";
            apiSettingsSec.classList.add('opacity-50', 'pointer-events-none');
            document.getElementById('test-mode-indicator').classList.remove('hidden');
        }
    };

    const updateNetworkUI = () => {
        wlanSettings.classList.toggle('hidden', netType.value !== 'WLAN');
        staticSettings.classList.toggle('hidden', netMethod.value !== 'Static');
    };

    modeToggle.addEventListener('change', (e) => updateModeUI(e.target.checked));
    netType.addEventListener('change', updateNetworkUI);
    netMethod.addEventListener('change', updateNetworkUI);

    togglePasswordBtn.addEventListener('click', () => {
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            togglePasswordBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
        } else {
            apiKeyInput.type = 'password';
            togglePasswordBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
        }
    });

    // Save Settings
    document.getElementById('settings-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const config = {
            mode: modeToggle.checked ? 'live' : 'test',
            api_url: document.getElementById('api-url').value,
            api_key: document.getElementById('api-key').value,
            poll_interval: parseInt(document.getElementById('poll-interval').value) || 5,
            network: {
                type: netType.value,
                method: netMethod.value,
                ssid: document.getElementById('net-ssid').value,
                password: document.getElementById('net-password').value,
                ip: document.getElementById('net-ip').value,
                subnet: document.getElementById('net-subnet').value,
                gateway: document.getElementById('net-gateway').value
            }
        };

        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            if(res.ok) {
                showToast('Einstellungen erfolgreich gespeichert', 'success');
                currentPollSeconds = config.poll_interval;
                startPolling(); // Restart polling with new mode/interval
                updateModeUI(config.mode === 'live');
            } else {
                showToast('Fehler beim Speichern', 'error');
            }
        } catch (e) {
            showToast('Verbindungsfehler', 'error');
        }
    });

    // Test Connection
    document.getElementById('test-connection-btn').addEventListener('click', async () => {
        const url = document.getElementById('api-url').value;
        const key = document.getElementById('api-key').value;
        const resultSpan = document.getElementById('test-connection-result');
        
        resultSpan.textContent = "Teste...";
        resultSpan.className = "ml-4 text-sm font-bold text-gray-400";

        try {
            const res = await fetch('/api/test-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_url: url, api_key: key })
            });
            const data = await res.json();
            
            if(data.success) {
                resultSpan.textContent = "Erfolgreich!";
                resultSpan.className = "ml-4 text-sm font-bold text-neon-green";
            } else {
                resultSpan.textContent = data.message;
                resultSpan.className = "ml-4 text-sm font-bold text-fire-red";
            }
        } catch (e) {
            resultSpan.textContent = "Verbindungsfehler";
            resultSpan.className = "ml-4 text-sm font-bold text-fire-red";
        }
    });

    // System Status Fetching (CPU, RAM)
    const fetchSystemStatus = async () => {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();
            document.getElementById('cpu-stat').textContent = `${data.cpu}%`;
            document.getElementById('ram-stat').textContent = `${data.ram}%`;
            document.getElementById('net-stat').textContent = data.network;
        } catch (e) {
            console.error("Could not fetch system status");
        }
    };

    // Live Data Fetching
    const fetchLiveData = async () => {
        try {
            const res = await fetch('/api/live-data');
            const data = await res.json();
            
            // Update global status
            const statusEl = document.getElementById('system-status');
            statusEl.textContent = data.status || 'UNBEKANNT';
            
            if (data.status === 'ALARM') {
                statusEl.className = 'text-lg font-bold text-fire-red uppercase mt-1 glow-red';
            } else if (data.status === 'WARNUNG') {
                statusEl.className = 'text-lg font-bold text-warning-yellow uppercase mt-1';
            } else if (data.status === 'BEREITSCHAFT') {
                statusEl.className = 'text-lg font-bold text-neon-green uppercase mt-1 glow-green';
            } else {
                statusEl.className = 'text-lg font-bold text-gray-500 uppercase mt-1';
            }

            // Error handling
            if (data.status === 'ERROR') {
                document.getElementById('events-container').innerHTML = `
                    <div class="bg-red-900/50 border border-red-500 p-4 rounded text-red-200">
                        <i class="fa-solid fa-triangle-exclamation mr-2"></i> ${data.error}
                    </div>
                `;
                return;
            }

            // Render Events
            const container = document.getElementById('events-container');
            if (!data.events || data.events.length === 0) {
                container.innerHTML = `<div class="text-gray-500 text-center mt-10 italic">Keine aktuellen Meldungen</div>`;
                return;
            }

            let html = '';
            data.events.forEach(ev => {
                let icon = 'fa-info-circle';
                let extraClasses = '';
                if(ev.status === 'ALARM') {
                    icon = 'fa-fire';
                    extraClasses = 'alarm-pulse';
                } else if(ev.status === 'WARNUNG') {
                    icon = 'fa-bolt';
                }

                html += `
                    <div class="event-card ${ev.status} ${extraClasses} bg-gray-900 p-4 rounded flex items-start">
                        <div class="mt-1 mr-4 text-xl">
                            <i class="fa-solid ${icon} ${ev.status==='ALARM'?'text-fire-red':(ev.status==='WARNUNG'?'text-warning-yellow':'text-neon-green')}"></i>
                        </div>
                        <div>
                            <div class="font-bold text-lg text-white">${ev.type} - ${ev.desc}</div>
                            <div class="text-sm text-gray-400 mt-1">Status: <span class="font-semibold ${ev.status==='ALARM'?'text-fire-red':(ev.status==='WARNUNG'?'text-warning-yellow':'text-neon-green')}">${ev.status}</span></div>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;

        } catch (e) {
            console.error("Could not fetch live data");
        }
    };

    // Polling Manager
    const startPolling = () => {
        if(pollIntervalId) clearInterval(pollIntervalId);
        
        // Immediate fetch
        fetchSystemStatus();
        fetchLiveData();

        pollIntervalId = setInterval(() => {
            fetchSystemStatus();
            fetchLiveData();
        }, currentPollSeconds * 1000);
    };

    // Toast Notification System
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
        
        // Animate in
        requestAnimationFrame(() => {
            toast.classList.remove('translate-y-10', 'opacity-0');
        });
        
        // Remove after 3s
        setTimeout(() => {
            toast.classList.add('opacity-0');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };

    // Init
    loadSettings();
});
