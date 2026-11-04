/**
 * Voice Interface Application
 * Main entry point - v9 with Multi-Extension + Query API Support
 */

require("dotenv").config();
var Srf = require("drachtio-srf");
var Mrf = require("drachtio-fsmrf");

// Import application modules
var httpServerModule = require("./lib/http-server");
var createHttpServer = httpServerModule.createHttpServer;
var cleanupOldFiles = httpServerModule.cleanupOldFiles;
var audioUrls = require("./lib/audio-urls");
var AudioForkServer = require("./lib/audio-fork").AudioForkServer;
var sipHandler = require("./lib/sip-handler");
var handleInvite = sipHandler.handleInvite;
var whisperClient = require("./lib/whisper-client");
var claudeBridge = require("./lib/claude-bridge");
var ttsService = require("./lib/tts-service");
var metrics = require("./lib/metrics");
var rateLimit = require("./lib/rate-limit");
var createRateLimiter = rateLimit.createRateLimiter;
var createClientKeyGenerator = rateLimit.createClientKeyGenerator;

// Multi-extension support
var deviceRegistry = require("./lib/device-registry");
var MultiRegistrar = require("./lib/multi-registrar");

// Connection retry utility
var connectionRetry = require("./lib/connection-retry");
var connectWithRetry = connectionRetry.connectWithRetry;
var recovery = require("./lib/recovery");

// Import outbound calling routes
var outboundModule = require("./lib/outbound-routes");
var outboundRouter = outboundModule.router;
var setupOutboundRoutes = outboundModule.setupRoutes;
var setOutboundMediaServer = outboundModule.setMediaServer;

// Import query routes
var queryModule = require("./lib/query-routes");
var queryRouter = queryModule.router;
var setupQueryRoutes = queryModule.setupRoutes;

// Load device registry first
// deviceRegistry is a singleton, already instantiated

// Configuration
var config = {
  drachtio: {
    host: process.env.DRACHTIO_HOST || "drachtio",
    port: parseInt(process.env.DRACHTIO_PORT) || 9022,
    secret: process.env.DRACHTIO_SECRET || "cymru"
  },
  freeswitch: {
    host: process.env.FREESWITCH_HOST || "freeswitch",
    port: parseInt(process.env.FREESWITCH_PORT) || 8021,
    secret: process.env.FREESWITCH_SECRET || "JambonzR0ck$"
  },
  sip: {
    extension: process.env.SIP_EXTENSION || "9000",
    auth_id: process.env.SIP_AUTH_ID || "",
    password: process.env.SIP_AUTH_PASSWORD || process.env.SIP_PASSWORD || "",
    domain: process.env.SIP_DOMAIN || "",
    registrar: process.env.SIP_REGISTRAR || "",
    registrar_port: parseInt(process.env.SIP_REGISTRAR_PORT) || 5060,
    expiry: parseInt(process.env.SIP_EXPIRY) || 3600
  },
  external_ip: process.env.EXTERNAL_IP || "",
  http_host: process.env.HTTP_HOST || "127.0.0.1",
  http_port: parseInt(process.env.HTTP_PORT) || 3000,
  ws_port: parseInt(process.env.WS_PORT) || 3001,
  audio_dir: process.env.AUDIO_DIR || "/tmp/voice-audio"
};

// Required configuration. These used to have plausible-looking defaults
// (including someone else's SIP credentials), which made a misconfigured
// install look healthy while registering the wrong extension.
function getMissingConfig() {
  var missing = [];
  if (!config.sip.domain) missing.push("SIP_DOMAIN");
  if (!config.sip.registrar) missing.push("SIP_REGISTRAR");
  if (!config.external_ip) missing.push("EXTERNAL_IP");
  return missing;
}

var missingConfig = getMissingConfig();
if (missingConfig.length > 0) {
  console.error("\nMissing required configuration: " + missingConfig.join(", "));
  console.error('Run "claude-phone setup" or set these values in .env before starting.\n');
  process.exit(1);
}

// Initialize drachtio SRF
var srf = new Srf();
var mediaServer = null;
var httpServer = null;
var audioForkServer = null;
var registrar = null;
var drachtioConnected = false;
var freeswitchConnected = false;
var isReady = false;
var serversInitialized = false;
var shuttingDown = false;
var drachtioReconnectTimer = null;
var drachtioReconnectAttempt = 0;
var freeswitchRecovery = null;

var recoveryTimeoutMs = parseInt(process.env.RECOVERY_TIMEOUT_MS, 10);
if (isNaN(recoveryTimeoutMs)) recoveryTimeoutMs = 300000;
var readinessWatchdog = recovery.createReadinessWatchdog({
  timeoutMs: recoveryTimeoutMs,
  onTimeout: function() {
    console.error("[" + new Date().toISOString() + "] Voice interface did not recover in time, exiting for supervisor restart");
    process.exit(1);
  }
});

// Log startup
console.log("\n" + "=".repeat(64));
console.log("          Voice Interface Application Starting                 ");
console.log("       (with Multi-Extension + Query API Support)              ");
console.log("=".repeat(64));
console.log("\nConfiguration:");
console.log("  - drachtio:    " + config.drachtio.host + ":" + config.drachtio.port);
console.log("  - FreeSWITCH:  " + config.freeswitch.host + ":" + config.freeswitch.port);
console.log("  - SIP Domain:  " + config.sip.domain);
console.log("  - Registrar:   " + config.sip.registrar + ":" + config.sip.registrar_port);
console.log("  - External IP: " + config.external_ip);
console.log("  - HTTP Port:   " + config.http_port);
console.log("  - WS Port:     " + config.ws_port);
console.log("  - Audio Dir:   " + config.audio_dir);
console.log("  - Mix Type:    " + (process.env.AUDIO_FORK_MIXTYPE || "L") + " (capture direction)");
console.log("\n[DEVICES] Loaded " + Object.keys(deviceRegistry.getAllDevices()).length + " device extensions");
console.log("\nWaiting for connections...\n");

// Connect to drachtio, with reconnect support.
function connectDrachtio() {
  try {
    srf.connect({
      host: config.drachtio.host,
      port: config.drachtio.port,
      secret: config.drachtio.secret
    });
  } catch (err) {
    console.error("[" + new Date().toISOString() + "] DRACHTIO connect failed: " + err.message);
    scheduleDrachtioReconnect();
  }
}

function scheduleDrachtioReconnect() {
  if (shuttingDown || drachtioReconnectTimer) return;
  drachtioReconnectAttempt++;
  var delay = Math.min(30000, 1000 * Math.pow(2, Math.max(0, drachtioReconnectAttempt - 1)));
  console.error("[" + new Date().toISOString() + "] DRACHTIO reconnect attempt " + drachtioReconnectAttempt + " in " + delay + "ms");
  drachtioReconnectTimer = setTimeout(function() {
    drachtioReconnectTimer = null;
    if (!shuttingDown) connectDrachtio();
  }, delay);
  if (drachtioReconnectTimer.unref) drachtioReconnectTimer.unref();
}

/**
 * Rebuild registrations after a reconnect. A stopped registrar is discarded so
 * every connection gets a fresh set of refresh and retry timers.
 */
function startRegistrations(localAddress) {
  if (registrar) {
    registrar.stop();
    registrar = null;
  }

  registrar = new MultiRegistrar(srf, {
    domain: config.sip.domain,
    registrar: config.sip.registrar,
    registrar_port: config.sip.registrar_port,
    local_address: localAddress,
    local_port: parseInt(process.env.DRACHTIO_SIP_PORT) || 5060,
    expiry: config.sip.expiry
  });

  var registrationConfigs = deviceRegistry.getRegistrationConfigs();
  registrar.registerAll(registrationConfigs);
  if (Object.keys(registrationConfigs).length === 0) {
    console.warn("[DEVICES] No devices with SIP credentials configured. Run \"claude-phone device add\" to add one.");
  }
}

function handleDrachtioDown(reason) {
  if (shuttingDown) return;
  console.error("[" + new Date().toISOString() + "] DRACHTIO " + reason);
  drachtioConnected = false;
  isReady = false;

  if (registrar) {
    registrar.stop();
    registrar = null;
  }

  if (readinessWatchdog) readinessWatchdog.arm();
  scheduleDrachtioReconnect();
}

srf.on("connect", function(err, hostport) {
  if (err) {
    handleDrachtioDown("connect error: " + err.message);
    return;
  }

  console.log("[" + new Date().toISOString() + "] DRACHTIO Connected at " + hostport);
  drachtioConnected = true;
  drachtioReconnectAttempt = 0;
  if (drachtioReconnectTimer) {
    clearTimeout(drachtioReconnectTimer);
    drachtioReconnectTimer = null;
  }

  var localAddress = config.external_ip;
  if (hostport && hostport.length > 0) {
    var match = hostport[0].match(/\/([^:]+)/);
    if (match) localAddress = match[1];
  }
  console.log("[DRACHTIO] Local SIP address: " + localAddress);

  startRegistrations(localAddress);
  checkReadyState();
});

srf.on("error", function(err) {
  console.error("[" + new Date().toISOString() + "] DRACHTIO error: " + err.message);
  if (drachtioConnected || isReady) {
    handleDrachtioDown("error: " + err.message);
  } else {
    scheduleDrachtioReconnect();
  }
});

srf.on("disconnect", function() {
  handleDrachtioDown("disconnected");
});

connectDrachtio();

// Initialize FreeSWITCH MRF with retry logic
var mrf = new Mrf(srf);

// Define FreeSWITCH connection function
function connectToFreeswitch() {
  return mrf.connect({
    address: config.freeswitch.host,
    port: config.freeswitch.port,
    secret: config.freeswitch.secret
  });
}

function attachMediaServerHandlers(ms) {
  if (!ms || typeof ms.on !== "function") return;
  ms.on("error", function(err) {
    console.error("[" + new Date().toISOString() + "] FREESWITCH error: " + err.message);
    handleFreeswitchDown("error: " + err.message);
  });
  ms.on("disconnect", function() {
    handleFreeswitchDown("disconnected");
  });
}

function handleMediaServer(ms) {
  mediaServer = ms;
  freeswitchConnected = true;
  console.log("[" + new Date().toISOString() + "] FREESWITCH Ready for calls");

  if (serversInitialized) {
    setOutboundMediaServer(ms);
  }
  attachMediaServerHandlers(ms);
  checkReadyState();
}

function handleFreeswitchDown(reason) {
  if (shuttingDown) return;
  if (!freeswitchConnected && !isReady) return;

  console.error("[" + new Date().toISOString() + "] FREESWITCH " + reason);
  freeswitchConnected = false;
  isReady = false;
  mediaServer = null;

  if (serversInitialized) {
    setOutboundMediaServer(null);
  }
  if (readinessWatchdog) readinessWatchdog.arm();
  if (freeswitchRecovery) freeswitchRecovery.schedule();
}

if (mrf && typeof mrf.on === "function") {
  mrf.on("error", function(err) {
    console.error("[" + new Date().toISOString() + "] FREESWITCH MRF error: " + err.message);
    handleFreeswitchDown("mrf error: " + err.message);
  });
}

freeswitchRecovery = recovery.createReconnectController({
  connect: connectToFreeswitch,
  onConnected: handleMediaServer,
  onError: function(err, attempt) {
    console.error("[" + new Date().toISOString() + "] FREESWITCH reconnect attempt " + attempt + " failed: " + err.message);
  }
});

// Connect with exponential backoff retry
// Retry schedule: 1s, 2s, 3s, 5s, 5s, 5s, 10s, 10s, 10s, 10s (max 10 retries)
connectWithRetry(connectToFreeswitch, {
  maxRetries: 10,
  retryDelays: [1000, 2000, 3000, 5000, 5000, 5000, 10000, 10000, 10000, 10000],
  name: 'FREESWITCH'
})
.then(handleMediaServer)
.catch(function(err) {
  console.error("[" + new Date().toISOString() + "] FREESWITCH Connection failed permanently: " + err.message);
  console.error("[" + new Date().toISOString() + "] Please check:");
  console.error("  1. FreeSWITCH container is running: docker ps | grep freeswitch");
  console.error("  2. ESL port 8021 is accessible");
  console.error("  3. EXTERNAL_IP is set correctly in .env");
  process.exit(1);
});

// Initialize servers
function initializeServers() {
  var fs = require("fs");
  if (!fs.existsSync(config.audio_dir)) {
    fs.mkdirSync(config.audio_dir, { recursive: true });
  }

  // HTTP server for TTS audio
  audioUrls.setHttpPort(config.http_port);
  if (config.http_host) audioUrls.setHttpHost(config.http_host);
  httpServer = createHttpServer(config.audio_dir, config.http_port, {
    getHealthInfo: function() {
      return {
        drachtio: drachtioConnected,
        freeswitch: freeswitchConnected,
        ready: isReady,
        reconnecting: Boolean(drachtioReconnectTimer || (freeswitchRecovery && freeswitchRecovery.pending)),
        activeCalls: metrics.get('voice_active_calls'),
        devices: Object.keys(deviceRegistry.getAllDevices()).length,
        claudeApiUrl: process.env.CLAUDE_API_URL || 'http://localhost:3333',
        ttsProvider: ttsService.getProvider ? ttsService.getProvider() : undefined,
        sttProvider: process.env.STT_PROVIDER || 'openrouter'
      };
    }
  });
  if (httpServer.server && typeof httpServer.server.on === "function") {
    httpServer.server.on("error", function(err) {
      console.error("[" + new Date().toISOString() + "] HTTP server error: " + err.message);
      process.exit(1);
    });
  }
  console.log("[" + new Date().toISOString() + "] HTTP Server started on port " + config.http_port);

  // WebSocket server for audio fork
  audioForkServer = new AudioForkServer({ port: config.ws_port });
  audioForkServer.on("error", function(err) {
    console.error("[" + new Date().toISOString() + "] Audio fork server error: " + err.message);
    process.exit(1);
  });
  audioForkServer.start();
  audioForkServer.on("listening", function() {
    console.log("[" + new Date().toISOString() + "] WEBSOCKET Audio fork server started on port " + config.ws_port);
  });
  audioForkServer.on("session", function(session) {
    console.log("[AUDIO] New session for call " + session.callUuid);
  });

  // TTS service
  ttsService.setAudioDir(config.audio_dir);
  console.log("[" + new Date().toISOString() + "] TTS Service configured");

  // ========== API AUTH (optional shared secret) ==========
  var apiAuth = require("./lib/api-auth").createApiAuthMiddleware();
  if (require("./lib/api-auth").isAuthEnabled()) {
    console.log("[" + new Date().toISOString() + "] API token authentication ENABLED (VOICE_API_TOKEN set)");
  }
  httpServer.app.use("/api", apiAuth);
  // Uploaded audio is served without auth (FreeSWITCH must fetch it), but
  // accepting uploads from the whole network lets anyone fill the disk.
  httpServer.app.use("/audio", apiAuth);

  // Per-client rate limits for the expensive endpoints. Prefer the API token
  // fingerprint over the IP so rotating addresses does not reset the bucket.
  var clientKey = createClientKeyGenerator();
  var outboundLimiter = createRateLimiter({
    max: parseInt(process.env.OUTBOUND_RATE_LIMIT, 10) || 5,
    keyGenerator: clientKey
  });
  var queryLimiter = createRateLimiter({
    max: parseInt(process.env.QUERY_RATE_LIMIT, 10) || 30,
    keyGenerator: clientKey
  });
  httpServer.app.use("/api/outbound-call", outboundLimiter);
  httpServer.app.use("/api/query", queryLimiter);

  // ========== OUTBOUND CALLING ROUTES ==========
  setupOutboundRoutes({
    srf: srf,
    mediaServer: mediaServer,
    deviceRegistry: deviceRegistry,  // Required for device lookup
    audioForkServer: audioForkServer,
    whisperClient: whisperClient,
    claudeBridge: claudeBridge,
    ttsService: ttsService,
    wsPort: config.ws_port
  });

  httpServer.app.use("/api", outboundRouter);
  console.log("[" + new Date().toISOString() + "] OUTBOUND Calling API enabled");

  // ========== QUERY API ROUTES ==========
  setupQueryRoutes({
    claudeBridge: claudeBridge
  });

  httpServer.app.use("/api", queryRouter);
  console.log("[" + new Date().toISOString() + "] QUERY API enabled (/api/query, /api/devices)");

  // Finalize HTTP server
  httpServer.finalize();

  // Single periodic cleanup of generated TTS / uploaded audio files.
  // (http-server and tts-service no longer run their own loops to avoid
  // competing cleanup passes over the same directory.)
  var cleanupTimer = setInterval(function() {
    cleanupOldFiles(config.audio_dir, httpServerModule.FILE_MAX_AGE);
  }, httpServerModule.CLEANUP_INTERVAL);
  if (cleanupTimer.unref) cleanupTimer.unref();
}

// Register the SIP INVITE handler exactly once. Reconnects update readiness
// without creating a second HTTP server, WebSocket server, or INVITE handler.
function registerInviteHandler() {
  srf.invite(function(req, res) {
    handleInvite(req, res, {
      audioForkServer: audioForkServer,
      mediaServer: mediaServer,
      deviceRegistry: deviceRegistry,
      config: config,
      whisperClient: whisperClient,
      claudeBridge: claudeBridge,
      ttsService: ttsService,
      wsPort: config.ws_port,
      externalIp: config.external_ip
    }).catch(function(err) {
      console.error("[" + new Date().toISOString() + "] CALL Error: " + err.message);
    });
  });

  console.log("[" + new Date().toISOString() + "] SIP INVITE handler registered");
}

// Check ready state
function checkReadyState() {
  if (drachtioConnected && freeswitchConnected && !isReady) {
    isReady = true;
    if (readinessWatchdog) readinessWatchdog.disarm();
    console.log("\n[" + new Date().toISOString() + "] READY Voice interface is fully connected!");
    console.log("=".repeat(64) + "\n");

    if (!serversInitialized) {
      serversInitialized = true;
      initializeServers();
      registerInviteHandler();
    }

    console.log("[" + new Date().toISOString() + "] Multi-extension voice interface ready!");
  }
}

// Graceful shutdown
function shutdown(signal) {
  console.log("\n[" + new Date().toISOString() + "] Received " + signal + ", shutting down...");
  shuttingDown = true;
  if (drachtioReconnectTimer) {
    clearTimeout(drachtioReconnectTimer);
    drachtioReconnectTimer = null;
  }
  if (freeswitchRecovery) freeswitchRecovery.stop();
  if (readinessWatchdog) readinessWatchdog.disarm();
  if (registrar) registrar.stop();
  if (httpServer) httpServer.close();
  if (audioForkServer) audioForkServer.stop();
  if (mediaServer) mediaServer.disconnect();
  srf.disconnect();
  setTimeout(function() { process.exit(0); }, 1000);
}

process.on("SIGTERM", function() { shutdown("SIGTERM"); });
process.on("SIGINT", function() { shutdown("SIGINT"); });
