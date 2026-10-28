const express = require("express");
const router = express.Router();
const otpService = require("../services/otpService");

router.post("/lock", async (req, res) => {
    try {
        const { number } = req.body;
        
        if (!number) {
            return res.status(400).json({ error: "Phone number required" });
        }
        
        const result = await otpService.startLock(number, req.sessionToken);
        
        if (result.alreadyLocked) {
            return res.status(409).json({ 
                error: "Lock already active",
                requestCount: result.requestCount 
            });
        }
        
        if (result.cooldown) {
            return res.status(429).json({ 
                error: "Number in cooldown period",
                retryAfter: result.retryAfter 
            });
        }
        
        res.status(202).json({ 
            success: true, 
            message: "Lock sequence initiated",
            number: result.number 
        });
        
    } catch (err) {
        console.error("Lock error:", err);
        res.status(500).json({ error: "Failed to start lock" });
    }
});

router.post("/stop", async (req, res) => {
    try {
        const { number } = req.body;
        
        if (!number) {
            return res.status(400).json({ error: "Phone number required" });
        }
        
        const result = await otpService.stopLock(number, req.sessionToken);
        res.json(result);
        
    } catch (err) {
        console.error("Stop error:", err);
        res.status(500).json({ error: "Failed to stop lock" });
    }
});

router.get("/status/:number", async (req, res) => {
    try {
        const { number } = req.params;
        const status = await otpService.getStatus(number, req.sessionToken);
        res.json(status);
        
    } catch (err) {
        console.error("Status error:", err);
        res.status(500).json({ error: "Failed to get status" });
    }
});

router.get("/history", async (req, res) => {
    try {
        const history = await otpService.getUserHistory(req.sessionToken);
        res.json({ history });
        
    } catch (err) {
        console.error("History error:", err);
        res.status(500).json({ error: "Failed to get history" });
    }
});

router.post("/voice", async (req, res) => {
    try {
        const { number } = req.body;
        
        if (!number) {
            return res.status(400).json({ error: "Phone number required" });
        }
        
        const result = await otpService.startVoiceSpam(number, req.sessionToken);
        
        if (result.cooldown) {
            return res.status(429).json({ 
                error: "Number in cooldown period",
                retryAfter: result.retryAfter 
            });
        }
        
        res.status(202).json({ 
            success: true, 
            message: "Voice call spam initiated",
            number: result.number 
        });
        
    } catch (err) {
        console.error("Voice spam error:", err);
        res.status(500).json({ error: "Failed to start voice spam" });
    }
});

router.post("/voice/stop", async (req, res) => {
    try {
        const { number } = req.body;
        const result = await otpService.stopVoiceSpam(number, req.sessionToken);
        res.json(result);
        
    } catch (err) {
        console.error("Stop voice error:", err);
        res.status(500).json({ error: "Failed to stop voice spam" });
    }
});

router.get("/voice/status/:number", async (req, res) => {
    try {
        const { number } = req.params;
        const status = await otpService.getVoiceStatus(number, req.sessionToken);
        res.json(status);
        
    } catch (err) {
        console.error("Voice status error:", err);
        res.status(500).json({ error: "Failed to get voice status" });
    }
});

router.get("/stats", async (req, res) => {
    try {
        const stats = await otpService.getStats();
        res.json(stats);
        
    } catch (err) {
        console.error("Stats error:", err);
        res.status(500).json({ error: "Failed to get stats" });
    }
});

module.exports = router;
