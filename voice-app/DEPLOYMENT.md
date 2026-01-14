# Outbound Calling Deployment Guide

**Target Server:** sippycup (10.70.7.81)
**Installation Path:** ~/voice-interface/voice-app/
**Date:** December 19, 2025

---

## Files Created

The following files have been created locally and need to be deployed to the server:

### New Files (lib/)
```
lib/outbound-handler.js    - Core outbound SIP logic using srf.createUAC()
lib/outbound-session.js    - State machine for call lifecycle tracking
lib/outbound-routes.js     - Express API routes for /api/outbound-call
lib/logger.js              - Logging utility (if not already present on server)
```

---

## Deployment Steps

### Step 1: Copy Files to Server

From your local machine:

```bash
# Navigate to local packages directory
cd "/Users/networkchuck/secondbrain/mac_studio/1 - Projects/508 - Call Your Server - Voice Interface via 3CX/packages/voice-app"

# Copy new lib files to server
scp lib/outbound-handler.js networkchuck@10.70.7.81:~/voice-interface/voice-app/lib/
scp lib/outbound-session.js networkchuck@10.70.7.81:~/voice-interface/voice-app/lib/
scp lib/outbound-routes.js networkchuck@10.70.7.81:~/voice-interface/voice-app/lib/

# Copy logger.js only if it doesn't already exist on server
scp lib/logger.js networkchuck@10.70.7.81:~/voice-interface/voice-app/lib/
```

### Step 2: SSH to Server

```bash
ssh networkchuck@10.70.7.81
cd ~/voice-interface/voice-app
```

### Step 3: Verify Existing HTTP Server

Check if the server already has an HTTP server running:

```bash
# Check existing index.js
cat index.js | grep -i "express\|http"
cat lib/http-server.js | head -20
```

**IMPORTANT:** The server appears to already have `lib/http-server.js`. We need to integrate with it, not replace it.

### Step 4: Modify Existing HTTP Server

The server already has `lib/http-server.js` which serves audio files. We need to add our API routes to it.

**Option A: Modify lib/http-server.js**

Add this to the existing `lib/http-server.js` after the Express app is created:

```javascript
// Add to lib/http-server.js (after app creation, before server start)

// Import outbound routes
const { router: outboundRouter, setupRoutes } = require('./outbound-routes');

// Function to register outbound routes (call this after SRF/media server are ready)
function registerOutboundRoutes(srf, mediaServer) {
  setupRoutes({ srf, mediaServer });
  app.use('/api', outboundRouter);
  console.log('[HTTP] Outbound calling routes registered');
}

module.exports = {
  // ... existing exports ...
  registerOutboundRoutes  // Add this export
};
```

**Option B: Modify index.js Directly**

If http-server.js is not modifiable, add to `index.js` after HTTP server is started:

```javascript
// Add after HTTP server is initialized in index.js

// Setup outbound calling routes
const { router: outboundRouter, setupRoutes } = require('./lib/outbound-routes');
setupRoutes({ srf, mediaServer });
app.use('/api', outboundRouter);
console.log('[HTTP] Outbound calling API routes registered at /api/outbound-call');
```

### Step 5: Add Environment Variables

Edit `.env` file on the server:

```bash
nano ~/voice-interface/.env
```

Add these variables:

```bash
# ===== Outbound Calling Configuration =====

# 3CX/SIP trunk for outbound calls
SIP_TRUNK_HOST=10.70.7.50          # 3CX server IP
SIP_TRUNK_PORT=5060                # SIP port

# Default caller ID (must be registered with 3CX)
DEFAULT_CALLER_ID=+15551234567     # CHANGE THIS to your actual number

# HTTP API port (should match existing HTTP_PORT)
HTTP_PORT=3000

# Outbound call limits
MAX_CONVERSATION_TURNS=3
OUTBOUND_RING_TIMEOUT=30
```

**CRITICAL:** Update `DEFAULT_CALLER_ID` with a number registered in your 3CX system.

### Step 6: Restart Docker Services

```bash
cd ~/voice-interface
docker-compose restart
```

Monitor logs to ensure clean startup:

```bash
docker-compose logs -f voice-app
```

Look for:
- `[HTTP] Outbound calling routes registered` or similar message
- No errors about missing modules or failed routes

### Step 7: Test the API

From another machine on the network:

```bash
# Health check
curl http://10.70.7.81:3000/api/calls

# Test outbound call (REPLACE PHONE NUMBER)
curl -X POST http://10.70.7.81:3000/api/outbound-call \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+15551234567",
    "message": "Hello from your server! This is a test call.",
    "mode": "announce"
  }'
```

Expected response:
```json
{
  "success": true,
  "callId": "abc123-uuid-here",
  "status": "queued",
  "message": "Call initiated"
}
```

### Step 8: Check Call Status

Use the callId from the previous response:

```bash
curl http://10.70.7.81:3000/api/call/abc123-uuid-here
```

---

## Integration Notes

### Existing Index.js Structure

Based on the server code, the current architecture is:

```
index.js
├── drachtio SRF (srf)
├── FreeSWITCH Media Server (mediaServer)
├── HTTP Server (lib/http-server.js)
├── AudioForkServer (lib/audio-fork.js)
└── Inbound SIP Handler (lib/sip-handler.js)
```

### Where to Add Outbound Routes

The cleanest integration point is:

1. **After both `srf` and `mediaServer` are connected and ready**
2. **In the `initializeServers()` function or similar**

Look for where HTTP server is started, and add outbound route registration there.

Example integration in index.js:

```javascript
// After mediaServer connects and HTTP server starts
function initializeServers() {
  // ... existing code ...

  httpServer = createHttpServer(config.http_port, config.audio_dir);

  // Register outbound routes AFTER HTTP server is created
  const { router: outboundRouter, setupRoutes } = require('./lib/outbound-routes');
  setupRoutes({ srf, mediaServer });
  httpServer.app.use('/api', outboundRouter);

  console.log('[HTTP] Outbound calling enabled');
}
```

---

## API Endpoints

Once deployed, the following endpoints will be available:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | /api/outbound-call | Initiate an outbound call |
| GET | /api/call/:callId | Get status of specific call |
| GET | /api/calls | List all active calls |
| POST | /api/call/:callId/hangup | Manually hangup a call |

### Request Example

```bash
curl -X POST http://10.70.7.81:3000/api/outbound-call \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+15551234567",
    "message": "Your backup job has completed successfully.",
    "mode": "announce",
    "callerId": "+15559876543",
    "webhookUrl": "https://n8n.example.com/webhook/call-complete"
  }'
```

---

## Troubleshooting

### Call Fails with "service_unavailable"

- Check that drachtio and FreeSWITCH are connected
- Verify `srf` and `mediaServer` objects are available in routes
- Check Docker logs: `docker-compose logs -f`

### Call Fails with "no_answer"

- Verify phone number is correct and reachable
- Check SIP_TRUNK_HOST is pointing to 3CX
- Verify 3CX is configured to route outbound calls

### Call Connects but No Audio

- Check EXTERNAL_IP environment variable matches server IP
- Verify RTP ports (20000-20100) are open in firewall
- Check FreeSWITCH logs: `docker-compose logs -f freeswitch`

### 404 on /api/outbound-call

- Routes not registered - check HTTP server setup
- Verify `app.use('/api', outboundRouter)` is called
- Check index.js integration

---

## File Locations Reference

### On Server (10.70.7.81)
```
~/voice-interface/
├── docker-compose.yml
├── .env
└── voice-app/
    ├── index.js              # Main entry point (MODIFY THIS)
    ├── package.json
    └── lib/
        ├── http-server.js    # Existing HTTP server (MODIFY THIS)
        ├── sip-handler.js    # Existing inbound handler
        ├── tts-service.js    # Existing TTS service
        ├── claude-bridge.js  # Existing Claude bridge
        ├── outbound-handler.js    # NEW
        ├── outbound-session.js    # NEW
        └── outbound-routes.js     # NEW
```

### On Local Machine
```
/Users/networkchuck/secondbrain/mac_studio/1 - Projects/508.../packages/voice-app/
├── lib/
│   ├── outbound-handler.js
│   ├── outbound-session.js
│   ├── outbound-routes.js
│   └── logger.js
└── DEPLOYMENT.md (this file)
```

---

## Next Steps After Deployment

1. **Test basic announce mode** - Single message playback
2. **Integrate with n8n** - Create webhook workflow to trigger calls
3. **Connect to Home Assistant** - Server status alerts via voice calls
4. **Implement conversation mode** - Future enhancement for bidirectional calls
5. **Add authentication** - API key or IP whitelist for production

---

## The Grand Payoff: Server Calls Chuck

Once deployed, create this n8n workflow for THE GRAND PAYOFF:

```
Home Assistant Alert
    ↓
n8n Webhook Trigger
    ↓
HTTP Request: POST /api/outbound-call
    {
      "to": "+1CHUCKSNUMBER",
      "message": "Alert: Your NAS storage is at 95 percent. The Plex media folder is using the most space."
    }
    ↓
Chuck's Phone Rings ON CAMERA 📞
```

**This is the moment that makes the video.**

---

*Deployment guide created December 19, 2025*
*For Video 508 - Call Your Server - Voice Interface via 3CX*
