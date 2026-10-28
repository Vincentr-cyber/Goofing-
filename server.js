require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const crypto = require("crypto");

const apiRoutes = require("./api");
const { startHealthMonitor } = require("./healthMonitor");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

app.use(cors());
app.use(express.json({ limit: "10kb" }));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: "Too many requests, slow down" }
});
app.use("/api/", limiter);

// ===== ACCESS GATE =====
const VALID_ACCESS_KEYS = (process.env.ACCESS_KEYS || "XD2026,OTPLOCK,SECRETKEY").split(",");

const sessions = new Map();

function generateSessionToken() {
    return crypto.randomBytes(32).toString("hex");
}

app.post("/api/access/verify", (req, res) => {
    const { accessKey } = req.body;
    
    if (!accessKey) {
        return res.status(400).json({ error: "Access key required" });
    }
    
    const key = accessKey.trim().toUpperCase();
    
    if (VALID_ACCESS_KEYS.includes(key)) {
        const token = generateSessionToken();
        sessions.set(token, { 
            createdAt: Date.now(),
            accessKey: key 
        });
        
        const now = Date.now();
        for (const [t, s] of sessions.entries()) {
            if (now - s.createdAt > 24 * 60 * 60 * 1000) {
                sessions.delete(t);
            }
        }
        
        return res.json({ 
            success: true, 
            token,
            message: "Access granted" 
        });
    }
    
    return res.status(401).json({ error: "Invalid access key" });
});

function requireAccess(req, res, next) {
    const token = req.headers.authorization?.replace("Bearer ", "") || 
                  req.query.token || 
                  req.body.token;
    
    if (!token || !sessions.has(token)) {
        if (req.path === "/" || req.path === "/index.html") {
           return res.sendFile(path.join(__dirname, "access.html"));
        }
        return res.status(401).json({ error: "Unauthorized" });
    }
    
    req.sessionToken = token;
    next();
}

app.get("/", (req, res) => {
    const token = req.query.token || req.headers.authorization?.replace("Bearer ", "");

    if (token && sessions.has(token)) {
        return res.sendFile(path.join(__dirname, "index.html"));
    }

    res.sendFile(path.join(__dirname, "access.html"));
});

app.use("/api/lock", requireAccess);
app.use("/api/stop", requireAccess);
app.use("/api/status", requireAccess);
app.use("/api/history", requireAccess);
app.use("/api/voice", requireAccess);

app.use("/api", apiRoutes);

app.get("/health", (req, res) => {
    res.json({ 
        status: "ok", 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.get("/admin", (req, res) => {
    const expectedKey = process.env.ADMIN_KEY;
    const submittedKey = req.query.key;

    if (!expectedKey) {
        console.error("ADMIN_KEY is missing from Render");
        return res.status(500).send("Admin key is not configured.");
    }

    if (typeof submittedKey !== "string" || submittedKey !== expectedKey) {
        return res.status(403).send("Invalid admin key.");
    }

    res.sendFile(path.join(__dirname, "admin.html"));
});
app.use(express.static(__dirname, {
    index: false
}));

app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
    console.error("Server error:", err);
    res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
    console.log(`[SERVER] LONER TECH OTP LOCK running on port ${PORT}`);
    console.log(`[SERVER] Access gate: ENABLED`);
    console.log(`[SERVER] Valid access keys: ${VALID_ACCESS_KEYS.length} configured`);
    startHealthMonitor();
});

module.exports = app;
