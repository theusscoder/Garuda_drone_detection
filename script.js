// ═══════════════════════════════════════════════════════════════
//  GARUDA — LIVE BACKEND INTEGRATION
//  Connects to FastAPI WebSocket at ws://localhost:8000/ws
//  Receives real detections, photos, coordinates
// ═══════════════════════════════════════════════════════════════

// ── WEBSOCKET CONNECTION ────────────────────────────────────────
let ws = null;
let wsConnected = false;
let reconnectTimer = null;
let detectionCount = 0;
let photoCount = 0;
let confidenceTotal = 0;

function connectWebSocket() {
    // Connect to the FastAPI backend
    ws = new WebSocket(`ws://${window.location.hostname}:8000/ws`);

    ws.onopen = () => {
        wsConnected = true;
        console.log('GARUDA BACKEND CONNECTED');
        updateSystemStatus(true);
        clearTimeout(reconnectTimer);
        addEventLog('SYSTEM', 'Backend connection established', 'system');
    };

    ws.onclose = () => {
        wsConnected = false;
        updateSystemStatus(false);
        addEventLog('SYSTEM', 'Connection lost — retrying in 3s', 'alert');
        // Auto-reconnect
        reconnectTimer = setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = () => {
        wsConnected = false;
        updateSystemStatus(false);
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleBackendMessage(data);
        } catch (e) {
            console.error('Parse error:', e);
        }
    };
}

// ── MESSAGE HANDLER ─────────────────────────────────────────────
function handleBackendMessage(data) {
    switch (data.type) {

        case 'detection':
            handleDetection(data);
            break;

        case 'rf_detection':
            handleRFDetection(data);
            break;

        case 'mmwave_detection':
            handleMmWave(data);
            break;

        case 'visual_lock':
            handleVisualLock(data);
            break;

        case 'threat_classified':
            handleThreatClassified(data);
            break;

        case 'system_status':
            handleSystemStatus(data);
            break;

        case 'gps_update':
            handleGPSUpdate(data);
            break;

        case 'system_event':
            addEventLog('SYS', data.event, 'system');
            break;

        default:
            break;
    }
}

// ── DETECTION HANDLER (from simple detector.py) ─────────────────
// This handles the basic object detection from the starter pipeline
function handleDetection(data) {
    detectionCount++;
    confidenceTotal += data.confidence;

    // Update coords display with detection info
    const coordsEl = document.getElementById('coords');
    if (coordsEl) {
        coordsEl.innerText = `OBJECT: ${data.object.toUpperCase()} | CONF: ${data.confidence}%`;
    }

    // Update altitude with bbox info
    const altEl = document.getElementById('altitude');
    if (altEl && data.bbox) {
        const size = Math.round(Math.sqrt(
            (data.bbox.x2 - data.bbox.x1) * (data.bbox.y2 - data.bbox.y1)
        ));
        altEl.innerText = `BBOX: ${size}px`;
    }

    // Show weapon lock when detected
    const lockEl = document.querySelector('.stat-group.highlight .value');
    if (lockEl) {
        lockEl.innerText = 'CONFIRMED';
        lockEl.style.color = 'var(--acc-green)';
    }

    // Show photo if captured
    if (data.photo) {
        photoCount++;
        showDetectionPhoto(data);
        addEventLog('CAPTURE', `Photo saved — ${data.object} @ ${data.confidence}%`, 'detection');
    } else {
        addEventLog('DETECT', `${data.object.toUpperCase()} — ${data.confidence}% confidence`, 'detection');
    }

    // Add radar blip for detected object
    addRadarTarget(data);

    // Update stats panel
    updateStatsPanel(data);
}

// ── RF DETECTION ────────────────────────────────────────────────
function handleRFDetection(data) {
    addEventLog('RF', `Node ${data.node_id || 'A'} — Signal ${data.signal_strength || '--'}dBm — ${data.protocol || 'UNKNOWN'}`, 'rf');

    const coordsEl = document.getElementById('coords');
    if (coordsEl && data.gps) {
        coordsEl.innerText = `LAT: ${data.gps.lat.toFixed(4)} | LON: ${data.gps.lng.toFixed(4)}`;
    }
}

// ── MMWAVE ──────────────────────────────────────────────────────
function handleMmWave(data) {
    const altEl = document.getElementById('altitude');
    if (altEl) {
        altEl.innerText = `${data.range}m @ ${data.velocity}m/s`;
    }
    addEventLog('RADAR', `${data.classification} — ${data.range}m — ${data.velocity}m/s`, 'radar');
}

// ── VISUAL LOCK ─────────────────────────────────────────────────
function handleVisualLock(data) {
    addEventLog('VISION', `LOCK — ${data.drone_class} — ${(data.confidence * 100).toFixed(0)}% — ${data.distance_m}m`, 'detection');

    const altEl = document.getElementById('altitude');
    if (altEl) altEl.innerText = `${data.distance_m}m`;

    if (data.photo_url) {
        showPhotoFromUrl(`http://localhost:8000/photos/${data.photo_url}`, data);
    }
}

// ── THREAT CLASSIFIED ───────────────────────────────────────────
function handleThreatClassified(data) {
    const lockEl = document.querySelector('.stat-group.highlight .value');
    if (lockEl) {
        const colors = { LOW: '#059669', MEDIUM: '#F59E0B', HIGH: '#DC2626', STANDBY: '#4A5568' };
        lockEl.innerText = data.level === 'STANDBY' ? 'STANDBY' : `THREAT: ${data.level}`;
        lockEl.style.color = colors[data.level] || '#059669';
    }

    if (data.level === 'HIGH') {
        document.body.classList.add('red-alert');
        setTimeout(() => document.body.classList.remove('red-alert'), 2000);
    }

    addEventLog('THREAT', `${data.level} — ${data.action || ''} — Score: ${data.threat_score || 0}/100`, data.level === 'HIGH' ? 'alert' : 'system');
}

// ── SYSTEM STATUS ────────────────────────────────────────────────
function handleSystemStatus(data) {
    // Update turret angles if displayed
    const coordsEl = document.getElementById('coords');
    if (coordsEl && data.turret_pan !== undefined) {
        coordsEl.innerText = `PAN: ${data.turret_pan}° | TILT: ${data.turret_tilt}°`;
    }
}

// ── GPS UPDATE ───────────────────────────────────────────────────
function handleGPSUpdate(data) {
    if (data.garuda_position) {
        const coordsEl = document.getElementById('coords');
        if (coordsEl) {
            coordsEl.innerText = `LAT: ${data.garuda_position.lat.toFixed(4)} | LON: ${data.garuda_position.lng.toFixed(4)}`;
        }
    }
}

// ── SHOW DETECTION PHOTO ────────────────────────────────────────
function showDetectionPhoto(data) {
    // Photo comes from backend at /photos/filename
    const photoUrl = `http://localhost:8000/photos/${data.photo}`;
    showPhotoFromUrl(photoUrl, data);
}

function showPhotoFromUrl(url, data) {
    // Find or create photo display area
    let photoSection = document.getElementById('liveDetectionPhoto');

    if (!photoSection) {
        // Create a photo display section dynamically if not in HTML
        photoSection = document.createElement('div');
        photoSection.id = 'liveDetectionPhoto';
        photoSection.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 300px;
            background: rgba(0,0,0,0.9);
            border: 1px solid #0EA5E9;
            padding: 12px;
            z-index: 9999;
            font-family: var(--font-mono, 'Space Mono', monospace);
            box-shadow: 0 0 20px rgba(14, 165, 233, 0.3);
        `;
        document.body.appendChild(photoSection);
    }

    const timestamp = data.timestamp || new Date().toLocaleTimeString();
    const objName = data.object || data.drone_class || 'TARGET';
    const conf = data.confidence || (data.confidence_raw * 100) || '--';

    photoSection.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="color:#0EA5E9; font-size:11px; letter-spacing:2px;">LATEST CAPTURE</span>
            <span style="color:#4A5568; font-size:10px;">${timestamp}</span>
        </div>
        <img src="${url}" 
             style="width:100%; border:1px solid #1E2D45; display:block;"
             onerror="this.style.display='none'"
             alt="Detection capture">
        <div style="margin-top:8px; display:flex; justify-content:space-between; font-size:11px;">
            <span style="color:#10B981; font-weight:bold;">${objName.toUpperCase()}</span>
            <span style="color:#D4A017;">${conf}% CONF</span>
        </div>
        <div style="margin-top:6px; height:4px; background:#1E2D45; border-radius:2px;">
            <div style="height:100%; width:${conf}%; background:#10B981; border-radius:2px; transition:width 0.3s;"></div>
        </div>
    `;
}

// ── UPDATE STATS PANEL ──────────────────────────────────────────
function updateStatsPanel(data) {
    // Update the telemetry stats with real detection data
    const avgConf = detectionCount > 0 ? Math.round(confidenceTotal / detectionCount) : 0;

    // If there's a stats display in the page, update it
    const statsEls = document.querySelectorAll('.stat-group .value');
    if (statsEls.length >= 2) {
        // Don't override coords and altitude — those are updated elsewhere
    }
}

// ── STATUS UPDATE ────────────────────────────────────────────────
function updateSystemStatus(connected) {
    const statusText = document.querySelector('.status-text');
    const pulse = document.querySelector('.pulse');

    if (statusText) {
        statusText.innerText = connected
            ? 'SYSTEM STATUS: ACTIVE — BACKEND CONNECTED'
            : 'SYSTEM STATUS: SEARCHING FOR BACKEND...';
    }

    if (pulse) {
        pulse.style.backgroundColor = connected ? 'var(--acc-green)' : '#DC2626';
        pulse.style.boxShadow = connected
            ? '0 0 10px var(--acc-green)'
            : '0 0 10px #DC2626';
    }
}

// ── EVENT LOG ────────────────────────────────────────────────────
// Creates a scrolling event log visible on the page
let eventLogEl = null;

function initEventLog() {
    eventLogEl = document.createElement('div');
    eventLogEl.id = 'garudaEventLog';
    eventLogEl.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        width: 380px;
        max-height: 200px;
        overflow-y: auto;
        background: rgba(10, 14, 26, 0.95);
        border: 1px solid #1E2D45;
        border-top: 2px solid #D4A017;
        padding: 8px;
        z-index: 9998;
        font-family: 'Space Mono', monospace;
        font-size: 10px;
    `;
    document.body.appendChild(eventLogEl);
}

const eventColors = {
    detection: '#10B981',
    alert: '#DC2626',
    system: '#0EA5E9',
    rf: '#F59E0B',
    radar: '#8B5CF6',
    capture: '#EC4899'
};

function addEventLog(source, message, type = 'system') {
    if (!eventLogEl) initEventLog();

    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const color = eventColors[type] || '#C5D0E0';

    const entry = document.createElement('div');
    entry.style.cssText = `
        display: flex;
        gap: 6px;
        padding: 3px 4px;
        border-left: 2px solid ${color};
        background: rgba(255,255,255,0.02);
        margin-bottom: 2px;
        animation: fadeIn 0.2s ease;
    `;
    entry.innerHTML = `
        <span style="color:#4A5568; min-width:60px;">${time}</span>
        <span style="color:${color}; font-weight:bold; min-width:60px;">[${source}]</span>
        <span style="color:#C5D0E0; flex:1;">${message}</span>
    `;

    eventLogEl.insertBefore(entry, eventLogEl.firstChild);

    // Keep only last 30 entries
    while (eventLogEl.children.length > 30) {
        eventLogEl.removeChild(eventLogEl.lastChild);
    }
}

// ── RADAR ────────────────────────────────────────────────────────
const canvas = document.getElementById('radarCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;

// Live targets from backend replace static ones
let liveTargets = [];

// Static demo targets shown before backend connects
const demoTargets = [
    { x: 0.2, y: 0.3, size: 4, alpha: 1, label: 'DEMO_01' },
    { x: 0.6, y: 0.7, size: 6, alpha: 0.8, label: 'DEMO_02' },
    { x: 0.8, y: 0.2, size: 3, alpha: 0.5, label: 'DEMO_03' }
];

function addRadarTarget(data) {
    // Convert detection to radar position
    // Use bbox center as approximate position on radar
    const target = {
        x: data.bbox ? (data.bbox.x1 + data.bbox.x2) / 2 / 1280 : Math.random() * 0.8 + 0.1,
        y: data.bbox ? (data.bbox.y1 + data.bbox.y2) / 2 / 720 : Math.random() * 0.8 + 0.1,
        size: 6,
        alpha: 1,
        label: data.object ? data.object.toUpperCase() : 'TARGET',
        timestamp: Date.now()
    };

    // Remove old targets older than 5 seconds
    liveTargets = liveTargets.filter(t => Date.now() - t.timestamp < 5000);
    liveTargets.push(target);
}

function initRadar() {
    if (!canvas) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
}

function drawRadar() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = 'rgba(241, 245, 249, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Concentric circles
    ctx.strokeStyle = 'rgba(14, 165, 233, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 5; i++) {
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2, (canvas.height / 5) * i, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Crosshair
    ctx.strokeStyle = 'rgba(14, 165, 233, 0.2)';
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();

    // Draw targets — live if connected, demo if not
    const targets = wsConnected && liveTargets.length > 0 ? liveTargets : demoTargets;

    targets.forEach((target, i) => {
        const x = target.x * canvas.width;
        const y = target.y * canvas.height;
        const alpha = target.alpha || 1;

        // Pulsing ring
        ctx.strokeStyle = `rgba(16, 185, 129, ${alpha * 0.4})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, target.size * 2.5, 0, Math.PI * 2);
        ctx.stroke();

        // Target dot
        ctx.fillStyle = wsConnected
            ? `rgba(220, 38, 38, ${alpha})`      // Red for live targets
            : `rgba(16, 185, 129, ${alpha})`;     // Green for demo
        ctx.beginPath();
        ctx.arc(x, y, target.size, 0, Math.PI * 2);
        ctx.fill();

        // Label
        ctx.font = '9px Space Mono';
        ctx.fillStyle = `rgba(74, 85, 104, ${alpha})`;
        ctx.fillText(target.label || `TRGT_0${i + 1}`, x + 10, y - 8);

        // Slow drift for demo targets only
        if (!wsConnected) {
            target.x += (Math.random() - 0.5) * 0.001;
            target.y += (Math.random() - 0.5) * 0.001;
            target.x = Math.max(0.05, Math.min(0.95, target.x));
            target.y = Math.max(0.05, Math.min(0.95, target.y));
        }
    });

    // Status text on radar
    ctx.font = '9px Space Mono';
    ctx.fillStyle = wsConnected ? 'rgba(16, 185, 129, 0.7)' : 'rgba(220, 38, 38, 0.7)';
    ctx.fillText(wsConnected ? '● LIVE FEED' : '○ DEMO MODE', 8, 16);

    requestAnimationFrame(drawRadar);
}

// ── TELEMETRY UPDATES ────────────────────────────────────────────
// Only runs fake updates when NOT connected to backend
function updateTelemetry() {
    if (wsConnected) return; // Backend handles updates when connected

    const coordsEl = document.getElementById('coords');
    const altitudeEl = document.getElementById('altitude');

    setInterval(() => {
        if (wsConnected) return; // Stop fake updates if backend connects

        const lat = (28.6139 + (Math.random() - 0.5) * 0.01).toFixed(4);
        const lon = (77.2090 + (Math.random() - 0.5) * 0.01).toFixed(4);
        const alt = (40 + Math.random() * 5).toFixed(1);

        if (coordsEl) coordsEl.innerText = `LAT: ${lat} | LON: ${lon}`;
        if (altitudeEl) altitudeEl.innerText = `${alt}m`;
    }, 2000);
}

// ── KILL SWITCH ──────────────────────────────────────────────────
const killSwitch = document.getElementById('killSwitch');
let isAlertActive = false;

if (killSwitch) {
    killSwitch.addEventListener('click', () => {
        isAlertActive = !isAlertActive;
        if (isAlertActive) {
            document.body.classList.add('red-alert');
            killSwitch.innerText = 'RESET SYSTEM';

            // Send abort command to backend if connected
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ABORT', timestamp: new Date().toISOString() }));
            }

            addEventLog('OVERRIDE', 'Manual kill-switch activated', 'alert');
        } else {
            document.body.classList.remove('red-alert');
            killSwitch.innerText = 'INITIATE KILL-SWITCH';
            addEventLog('OVERRIDE', 'System reset to standby', 'system');
        }
    });
}

// ── SCROLL ───────────────────────────────────────────────────────
function scrollToSection(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
}

window.addEventListener('scroll', () => {
    const chakra = document.querySelector('.chakra-overlay');
    if (chakra) {
        const rotation = window.scrollY * 0.2;
        chakra.style.transform = `translateY(-50%) rotate(${rotation}deg)`;
    }
});

// ── LIVE FEED (Phone/Webcam) ─────────────────────────────────────
const webcam = document.getElementById('webcam');
const startFeedBtn = document.getElementById('startFeed');
const feedTimestamp = document.getElementById('feedTimestamp');
let stream = null;

async function initCamera() {
    try {
        if (!stream) {
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'environment' // Back camera on phone
                },
                audio: false
            });
            webcam.srcObject = stream;
            startFeedBtn.innerText = 'TERMINATE LINK';
            startFeedBtn.classList.remove('btn-primary');
            startFeedBtn.classList.add('btn-danger');
            addEventLog('FEED', 'Camera link established', 'system');
        } else {
            stopCamera();
        }
    } catch (err) {
        console.error('Camera access denied:', err);
        addEventLog('ERROR', 'Camera permission denied', 'alert');
        alert('CRITICAL ERROR: Unable to establish neural link. Please check camera permissions.');
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        webcam.srcObject = null;
        stream = null;
        startFeedBtn.innerText = 'INITIALIZE NEURAL LINK';
        startFeedBtn.classList.remove('btn-danger');
        startFeedBtn.classList.add('btn-primary');
        addEventLog('FEED', 'Camera link terminated', 'system');
    }
}

if (startFeedBtn) {
    startFeedBtn.addEventListener('click', initCamera);
}

// ── TIMESTAMP ────────────────────────────────────────────────────
function updateTimestamp() {
    const now = new Date();
    const ts = now.toISOString().replace('T', ' ').slice(0, 19);
    if (feedTimestamp) feedTimestamp.innerText = ts;
}

setInterval(updateTimestamp, 1000);

// ── PARTICLES ────────────────────────────────────────────────────
const pCanvas = document.getElementById('particleCanvas');
const pCtx = pCanvas ? pCanvas.getContext('2d') : null;
let particles = [];
let mouse = { x: null, y: null, radius: 150 };

function initParticles() {
    if (!pCanvas || !pCtx) return;
    pCanvas.width = window.innerWidth;
    pCanvas.height = window.innerHeight;
    particles = [];
    const count = (pCanvas.width * pCanvas.height) / 9000;
    for (let i = 0; i < count; i++) {
        particles.push(new Particle());
    }
}

class Particle {
    constructor() {
        this.x = Math.random() * pCanvas.width;
        this.y = Math.random() * pCanvas.height;
        this.size = Math.random() * 2 + 1;
        this.baseX = this.x;
        this.baseY = this.y;
        this.density = (Math.random() * 30) + 1;
        const colors = ['#FF9933', '#CCCCCC', '#138808'];
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
    }

    draw() {
        if (!pCtx) return;
        pCtx.fillStyle = this.color;
        pCtx.beginPath();
        pCtx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        pCtx.closePath();
        pCtx.fill();
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < 0) this.x = pCanvas.width;
        if (this.x > pCanvas.width) this.x = 0;
        if (this.y < 0) this.y = pCanvas.height;
        if (this.y > pCanvas.height) this.y = 0;

        if (mouse.x != null) {
            let dx = mouse.x - this.x;
            let dy = mouse.y - this.y;
            let distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < mouse.radius) {
                let force = (mouse.radius - distance) / mouse.radius;
                this.x -= (dx / distance) * force * this.density;
                this.y -= (dy / distance) * force * this.density;
            }
        }
    }
}

function animateParticles() {
    if (!pCtx || !pCanvas) return;
    pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
    for (let i = 0; i < particles.length; i++) {
        particles[i].draw();
        particles[i].update();
    }
    requestAnimationFrame(animateParticles);
}

window.addEventListener('mousemove', (e) => { mouse.x = e.x; mouse.y = e.y; });
window.addEventListener('mouseout', () => { mouse.x = null; mouse.y = null; });
window.addEventListener('resize', () => { initParticles(); initRadar(); });

// ── ADD FADE-IN ANIMATION ────────────────────────────────────────
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; transform: translateX(-4px); }
        to   { opacity: 1; transform: translateX(0); }
    }
`;
document.head.appendChild(style);

// ── INITIALISE EVERYTHING ────────────────────────────────────────
window.addEventListener('resize', initRadar);
initRadar();
drawRadar();
updateTelemetry();
updateTimestamp();
initParticles();
animateParticles();
initEventLog();

// Connect to backend last
// Small delay so page renders first
setTimeout(connectWebSocket, 500);

console.log('%cGARUDA SYSTEM INITIALISED', 'color: #FF9933; font-size: 16px; font-weight: bold;');
console.log('%cConnecting to backend at ws://localhost:8000/ws', 'color: #0EA5E9; font-size: 12px;');
