// ===== LONER TECH OTP LOCK - Frontend Logic =====

// Access token from URL or localStorage
const ACCESS_TOKEN = localStorage.getItem('accessToken') || new URLSearchParams(window.location.search).get('token');

if (!ACCESS_TOKEN) {
    window.location.href = '/';
}

// Helper for authenticated requests
async function apiRequest(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ACCESS_TOKEN}`,
            ...options.headers
        }
    });
    
    if (res.status === 401) {
        localStorage.removeItem('accessToken');
        window.location.href = '/';
        return;
    }
    
    return res;
}

let currentLock = null;
let statusInterval = null;
let startTime = null;

// DOM Elements
const phoneInput = document.getElementById('phoneNumber');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusPanel = document.getElementById('statusPanel');
const statusValue = document.getElementById('statusValue');
const statusProgress = document.getElementById('statusProgress');
const requestCount = document.getElementById('requestCount');
const elapsedTime = document.getElementById('elapsedTime');
const targetNumber = document.getElementById('targetNumber');
const logTerminal = document.getElementById('logTerminal');
const historyList = document.getElementById('historyList');
const serverStatus = document.getElementById('serverStatus');
const voiceSpamToggle = document.getElementById('voiceSpamToggle');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    startBtn.addEventListener('click', startLock);
    stopBtn.addEventListener('click', stopLock);
    
    checkServerHealth();
    loadHistory();
    setInterval(checkServerHealth, 30000);
    
    phoneInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !startBtn.disabled) {
            startLock();
        }
    });
});

// Check server health
async function checkServerHealth() {
    try {
        const response = await fetch('/health');
        const data = await response.json();
        
        if (data.status === 'ok') {
            serverStatus.innerHTML = '<span class="pulse"></span><span>ONLINE</span>';
        }
    } catch (err) {
        serverStatus.innerHTML = '<span style="background: var(--error);"></span><span>OFFLINE</span>';
        serverStatus.style.color = 'var(--error)';
        serverStatus.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        serverStatus.style.background = 'rgba(239, 68, 68, 0.1)';
    }
}

// Start OTP Lock
async function startLock() {
    const number = phoneInput.value.replace(/\D/g, '');
    
    if (!number || number.length < 7) {
        log('Invalid number format', 'error');
        return;
    }
    
    startBtn.disabled = true;
    stopBtn.disabled = false;
    phoneInput.disabled = true;
    statusPanel.style.display = 'block';
    
    targetNumber.textContent = '+' + number;
    requestCount.textContent = '0';
    elapsedTime.textContent = '00:00';
    statusValue.textContent = 'INIT';
    statusValue.className = 'status-value running';
    statusProgress.className = 'status-progress';
    statusProgress.style.width = '0%';
    
    log(`Initializing lock on +${number}...`, 'system');
    
    try {
        const isVoice = voiceSpamToggle && voiceSpamToggle.checked;
        const endpoint = isVoice ? '/api/voice' : '/api/lock';
        
        const response = await apiRequest(endpoint, {
            method: 'POST',
            body: JSON.stringify({ number: number })
        });
        
        const data = await response.json();
        
        if (response.status === 202) {
            currentLock = number;
            startTime = Date.now();
            
            log(`${isVoice ? 'Voice spam' : 'Lock'} sequence initiated`, 'success');
            log(`Spamming ${isVoice ? 'voice calls' : 'registration requests'}...`, 'system');
            
            statusInterval = setInterval(() => updateStatus(number), 2000);
            startTimer();
            
        } else if (response.status === 409) {
            log(`Lock already active for this number`, 'warning');
            currentLock = number;
            statusInterval = setInterval(() => updateStatus(number), 2000);
            startTimer();
            
        } else if (response.status === 429) {
            log(`Number was recently locked. Retry after ${data.retryAfter}s`, 'warning');
            resetUI();
            
        } else {
            log(data.error || 'Failed to start lock', 'error');
            resetUI();
        }
        
    } catch (err) {
        log('Network error: ' + err.message, 'error');
        resetUI();
    }
}

// Stop OTP Lock
async function stopLock() {
    if (!currentLock) return;
    
    try {
        const isVoice = voiceSpamToggle && voiceSpamToggle.checked;
        const endpoint = isVoice ? '/api/voice/stop' : '/api/stop';
        
        const response = await apiRequest(endpoint, {
            method: 'POST',
            body: JSON.stringify({ number: currentLock })
        });
        
        const data = await response.json();
        
        if (data.success || data.stopped) {
            log('Lock sequence aborted by user', 'warning');
        }
        
    } catch (err) {
        log('Error stopping lock: ' + err.message, 'error');
    }
    
    cleanup();
}

// Update status from server
async function updateStatus(number) {
    try {
        const isVoice = voiceSpamToggle && voiceSpamToggle.checked;
        const endpoint = isVoice ? `/api/voice/status/${number}` : `/api/status/${number}`;
        
        const response = await apiRequest(endpoint);
        const data = await response.json();
        
        if (!data.active) {
            log('Lock process ended', 'system');
            cleanup();
            loadHistory();
            return;
        }
        
        const count = data.requestCount || data.callCount || 0;
        requestCount.textContent = count;
        
        if (data.locked) {
            statusValue.textContent = 'LOCKED';
            statusValue.className = 'status-value locked';
            statusProgress.className = 'status-progress locked';
            
            log(`TARGET ACQUIRED: Number is now locked!`, 'success');
            log(`Total requests: ${count}`, 'system');
            log(`Elapsed time: ${formatTime(data.elapsed)}`, 'system');
            
            playNotification();
            cleanup();
            loadHistory();
            
        } else if (data.active) {
            statusValue.textContent = 'RUNNING';
            statusValue.className = 'status-value running';
            
            const maxRequests = data.maxRequests || data.maxCalls || 50;
            const progress = Math.min((count / maxRequests) * 100, 95);
            statusProgress.style.width = progress + '%';
        }
        
    } catch (err) {
        console.error('Status update error:', err);
    }
}

// Timer display
function startTimer() {
    const timerInterval = setInterval(() => {
        if (!currentLock) {
            clearInterval(timerInterval);
            return;
        }
        
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        elapsedTime.textContent = formatTime(elapsed);
    }, 1000);
}

// Format seconds to MM:SS
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

// Add log entry
function log(message, type = 'system') {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerHTML = `
        <span class="log-time">[${time}]</span>
        <span class="log-msg ${type}">${message}</span>
    `;
    
    logTerminal.appendChild(line);
    logTerminal.scrollTop = logTerminal.scrollHeight;
    
    while (logTerminal.children.length > 50) {
        logTerminal.removeChild(logTerminal.firstChild);
    }
}

// Load history
async function loadHistory() {
    try {
        const response = await apiRequest('/api/history');
        const data = await response.json();
        
        if (data.history && data.history.length > 0) {
            historyList.innerHTML = data.history.map(item => {
                const type = item.type === 'voice' ? '📞' : '🔒';
                const count = item.requestCount || item.callCount || 0;
                const date = new Date(item.endTime || item.lockedAt).toLocaleString();
                return `
                    <div class="history-item">
                        <span class="history-number">${type} +${item.number}</span>
                        <span class="history-details">${count} requests</span>
                        <span class="history-time">${date}</span>
                    </div>
                `;
            }).join('');
        } else {
            historyList.innerHTML = '<div class="history-empty">No previous locks recorded</div>';
        }
        
    } catch (err) {
        console.error('History load error:', err);
    }
}

// Play notification sound
function playNotification() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {
        // Audio not supported
    }
}

// Cleanup
function cleanup() {
    currentLock = null;
    startTime = null;
    
    if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
    }
    
    startBtn.disabled = false;
    stopBtn.disabled = true;
    phoneInput.disabled = false;
}

// Reset UI
function resetUI() {
    cleanup();
    statusPanel.style.display = 'none';
}
