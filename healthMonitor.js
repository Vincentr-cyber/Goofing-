const axios = require("axios");

const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000;
const PROVIDER_TIMEOUT = 10000;

let isRunning = false;
let intervalId = null;
let lastCheck = null;
let providerStatus = new Map();

const providers = [
    { name: "Jumia", url: "https://api.jumia.com.ng" },
    { name: "Konga", url: "https://api.konga.com" },
    { name: "Paystack", url: "https://api.paystack.co" },
    { name: "Flutterwave", url: "https://api.flutterwave.com" },
    { name: "Slot", url: "https://api.slot.ng" },
    { name: "Glo", url: "https://api.gloworld.com" },
    { name: "9mobile", url: "https://api.9mobile.com.ng" },
    { name: "Airtel", url: "https://api.airtel.ng" }
];

async function checkProvider(provider) {
    const startTime = Date.now();
    
    try {
        await axios({
            method: "HEAD",
            url: provider.url,
            timeout: PROVIDER_TIMEOUT,
            validateStatus: () => true
        });
        
        const latency = Date.now() - startTime;
        
        providerStatus.set(provider.name, {
            status: "online",
            latency,
            lastCheck: Date.now()
        });
        
        return { name: provider.name, status: "online", latency };
        
    } catch (err) {
        providerStatus.set(provider.name, {
            status: "offline",
            error: err.message,
            lastCheck: Date.now()
        });
        
        return { name: provider.name, status: "offline", error: err.message };
    }
}

async function runHealthCheck() {
    console.log("[HEALTH] Running provider health check...");
    
    const results = await Promise.allSettled(
        providers.map(p => checkProvider(p))
    );
    
    const online = results.filter(r => r.status === "fulfilled" && r.value.status === "online").length;
    const offline = results.filter(r => r.status === "fulfilled" && r.value.status === "offline").length;
    
    console.log(`[HEALTH] Check complete: ${online} online, ${offline} offline`);
    
    for (const result of results) {
        if (result.status === "fulfilled" && result.value.status === "offline") {
            console.log(`[HEALTH] ⚠️ ${result.value.name} is offline: ${result.value.error}`);
        }
    }
    
    lastCheck = Date.now();
    
    return {
        timestamp: lastCheck,
        online,
        offline,
        total: providers.length,
        providers: results.map(r => r.status === "fulfilled" ? r.value : { name: "unknown", status: "error" })
    };
}

function startHealthMonitor() {
    if (isRunning) {
        console.log("[HEALTH] Monitor already running");
        return;
    }
    
    console.log("[HEALTH] Starting health monitor...");
    isRunning = true;
    
    runHealthCheck();
    
    intervalId = setInterval(runHealthCheck, HEALTH_CHECK_INTERVAL);
    
    console.log(`[HEALTH] Monitor started. Checking every ${HEALTH_CHECK_INTERVAL / 60000} minutes.`);
}

function stopHealthMonitor() {
    if (!isRunning) {
        return;
    }
    
    console.log("[HEALTH] Stopping health monitor...");
    
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    
    isRunning = false;
}

function getHealthStatus() {
    return {
        isRunning,
        lastCheck,
        providers: Object.fromEntries(providerStatus),
        summary: {
            total: providers.length,
            online: Array.from(providerStatus.values()).filter(p => p.status === "online").length,
            offline: Array.from(providerStatus.values()).filter(p => p.status === "offline").length
        }
    };
}

async function manualCheck() {
    return await runHealthCheck();
}

module.exports = {
    startHealthMonitor,
    stopHealthMonitor,
    getHealthStatus,
    manualCheck
};
