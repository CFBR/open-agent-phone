/**
 * Outbound Call API Routes
 * Express routes for initiating and managing outbound calls
 * v3: Added context parameter for structured data to Claude
 * Supports both announce (one-way) and conversation (two-way) modes
 */

const express = require('express');
const router = express.Router();
const logger = require('./logger');
const metrics = require('./metrics');
const { validateWebhookUrl } = require('./url-safety');
const { OutboundSession, getSession, getAllSessions } = require('./outbound-session');
const { initiateOutboundCall, playMessage, hangupCall } = require('./outbound-handler');
const { runConversationLoop } = require('./conversation-loop');

// Dependencies injected via setupRoutes()
var srf = null;
var mediaServer = null;
var deviceRegistry = null;
var audioForkServer = null;
var whisperClient = null;
var claudeBridge = null;
var ttsService = null;
var wsPort = 3001;

/**
 * Validate phone number format
 */
function isValidPhoneNumber(phoneNumber) {
  if (typeof phoneNumber !== 'string') return false;
  var e164Regex = /^\+[1-9]\d{1,14}$/;
  var dialStringRegex = /^\d{1,15}$/;
  return e164Regex.test(phoneNumber) || dialStringRegex.test(phoneNumber);
}

/**
 * Validate outbound call request
 */
function validateRequest(body) {
  if (!body) {
    return { valid: false, error: 'Request body is required' };
  }

  if (!body.to) {
    return { valid: false, error: 'Field "to" is required' };
  }

  if (!isValidPhoneNumber(body.to)) {
    return { valid: false, error: 'Field "to" must be a valid phone number (e.g. +15551234567 or extension 5755)' };
  }

  if (!body.message) {
    return { valid: false, error: 'Field "message" is required' };
  }

  if (typeof body.message !== 'string' || body.message.trim().length === 0) {
    return { valid: false, error: 'Field "message" must be a non-empty string' };
  }

  if (body.message.length > 1000) {
    return { valid: false, error: 'Field "message" must be 1000 characters or less' };
  }

  if (body.callerId && !isValidPhoneNumber(body.callerId)) {
    return { valid: false, error: 'Field "callerId" must be a valid E.164 phone number if provided' };
  }

  if (body.mode && !['announce', 'conversation'].includes(body.mode)) {
    return { valid: false, error: 'Field "mode" must be either "announce" or "conversation"' };
  }

  if (body.device !== undefined && typeof body.device !== 'string') {
    return { valid: false, error: 'Field "device" must be a string (extension number or device name)' };
  }

  // Optional: 'context' validation (string or object)
  if (body.context !== undefined) {
    if (typeof body.context !== 'string' && typeof body.context !== 'object') {
      return { valid: false, error: 'Field "context" must be a string or object' };
    }
  }

  // Optional: webhook URL. Validate it here so malformed, non-HTTP, or private
  // targets cannot reach fetch() later.
  if (body.webhookUrl !== undefined) {
    const result = validateWebhookUrl(body.webhookUrl, {
      allowPrivate: process.env.ALLOW_PRIVATE_WEBHOOKS === '1'
    });
    if (!result.ok) {
      return { valid: false, error: `Field "webhookUrl" ${result.error}` };
    }
  }

  if (body.timeoutSeconds !== undefined) {
    var timeout = Number(body.timeoutSeconds);
    if (!Number.isInteger(timeout) || timeout < 5 || timeout > 120) {
      return { valid: false, error: 'Field "timeoutSeconds" must be an integer between 5 and 120' };
    }
  }

  return { valid: true };
}

/**
 * POST /api/outbound-call
 * Initiate an outbound call
 *
 * Body parameters:
 *   - to: Phone number (required)
 *   - message: Initial message to play (required) - what the device SAYS
 *   - context: Background data for Claude (optional) - what the device KNOWS
 *   - mode: 'announce' or 'conversation' (default: announce)
 *   - device: Device extension or name for voice/personality (optional)
 *   - callerId: Caller ID (optional)
 *   - timeoutSeconds: Ring timeout (optional, default: 30)
 */
router.post('/outbound-call', async function(req, res) {
  var startTime = Date.now();

  try {
    // Validate request
    var validation = validateRequest(req.body);
    if (!validation.valid) {
      logger.warn('Invalid outbound call request', {
        error: validation.error,
        body: req.body
      });

      return res.status(400).json({
        success: false,
        error: 'validation_failed',
        message: validation.error
      });
    }

    // Extract parameters
    var to = req.body.to;
    var message = req.body.message;
    var context = req.body.context || null;  // NEW: structured context for Claude
    var mode = req.body.mode || 'announce';
    var deviceParam = req.body.device;
    var callerId = req.body.callerId;
    var timeoutSeconds = req.body.timeoutSeconds
      || parseInt(process.env.OUTBOUND_RING_TIMEOUT, 10)
      || 30;
    var webhookUrl = req.body.webhookUrl;

    // Look up device configuration
    var deviceConfig = null;
    if (deviceParam && deviceRegistry) {
      // Use getWithVoiceId() which resolves voiceId based on TTS provider
      deviceConfig = deviceRegistry.getWithVoiceId(deviceParam);

      if (deviceConfig) {
        logger.info('Device found for outbound call', {
          device: deviceConfig.name,
          extension: deviceConfig.extension,
          voiceId: deviceConfig.voiceId || 'default'
        });
      } else {
        // An explicit but unknown device should still use the default identity
        // and voice rather than falling through to a null voice ID.
        deviceConfig = deviceRegistry.getDefault();
        logger.warn('Device not found, using default', {
          requested: deviceParam,
          device: deviceConfig ? deviceConfig.name : 'none'
        });
      }
    }

    // Check if infrastructure is available
    if (!srf || !mediaServer) {
      logger.error('Infrastructure not ready', {
        srf: !!srf,
        mediaServer: !!mediaServer
      });

      return res.status(503).json({
        success: false,
        error: 'service_unavailable',
        message: 'Voice infrastructure is not ready'
      });
    }

    // For conversation mode, check additional dependencies
    if (mode === 'conversation') {
      if (!audioForkServer || !whisperClient || !claudeBridge || !ttsService) {
        logger.error('Conversation mode dependencies not ready', {
          audioForkServer: !!audioForkServer,
          whisperClient: !!whisperClient,
          claudeBridge: !!claudeBridge,
          ttsService: !!ttsService
        });

        return res.status(503).json({
          success: false,
          error: 'service_unavailable',
          message: 'Conversation mode dependencies not ready'
        });
      }
    }

    // Create session
    var session = new OutboundSession(null, {
      to: to,
      message: message,
      mode: mode,
      callerId: callerId,
      webhookUrl: webhookUrl,
      device: deviceConfig ? deviceConfig.name : null
    });

    var callId = session.callId;
    metrics.inc('voice_outbound_calls_total', 1, { mode: mode });

    logger.info('Processing outbound call request', {
      callId: callId,
      to: to,
      mode: mode,
      device: deviceConfig ? deviceConfig.name : 'default',
      messageLength: message.length,
      hasContext: !!context
    });

    // Return immediately with callId
    res.json({
      success: true,
      callId: callId,
      status: 'queued',
      message: 'Call initiated',
      device: deviceConfig ? deviceConfig.name : null
    });

    // Continue asynchronously
    (async function() {
      try {
        session.transition('DIALING');

        var result = await initiateOutboundCall(srf, mediaServer, {
          to: to,
          message: message,
          callerId: callerId,
          timeoutSeconds: timeoutSeconds,
          deviceConfig: deviceConfig  // Pass device for From header display name
        });

        var dialog = result.dialog;
        var endpoint = result.endpoint;

        session.setDialog(dialog);
        session.setEndpoint(endpoint);
        session.transition('PLAYING');

        // Play the initial message with device voice
        var voiceId = (deviceConfig && deviceConfig.voiceId) ? deviceConfig.voiceId : null;
        await playMessage(endpoint, message, { voiceId: voiceId });

        if (mode === 'announce') {
          await hangupCall(dialog, endpoint, callId);
          session.transition('COMPLETED', 'announce_complete');

        } else if (mode === 'conversation') {
          logger.info('Entering conversation mode', {
            callId: callId,
            device: deviceConfig ? deviceConfig.name : 'default',
            hasContext: !!context
          });
          session.transition('CONVERSING');

          try {
            await runConversationLoop(endpoint, dialog, callId, {
              audioForkServer: audioForkServer,
              whisperClient: whisperClient,
              claudeBridge: claudeBridge,
              ttsService: ttsService,
              wsPort: wsPort,
              deviceConfig: deviceConfig,
              initialContext: message,
              context: context,           // NEW: pass structured context
              skipGreeting: true
            });

            await hangupCall(dialog, endpoint, callId);
            session.transition('COMPLETED', 'conversation_complete');

          } catch (convError) {
            logger.error('Conversation loop error', {
              callId: callId,
              error: convError.message
            });
            await hangupCall(dialog, endpoint, callId);
            session.transition('COMPLETED', 'conversation_error');
          }
        }

      } catch (error) {
        metrics.inc('voice_outbound_failures_total', 1, { mode: mode });
        logger.error('Outbound call failed', {
          callId: callId,
          error: error.message,
          elapsed: Date.now() - startTime
        });

        // A call that was answered before the failure still owns a dialog and
        // a FreeSWITCH endpoint. Release them before reporting FAILED.
        try {
          await hangupCall(session.dialog, session.endpoint, callId);
        } catch (hangupError) {
          logger.warn('Cleanup after failed outbound call failed', {
            callId: callId,
            error: hangupError.message
          });
        }

        var reason = 'error';
        if (error.message === 'busy') reason = 'busy';
        else if (error.message === 'no_answer') reason = 'no_answer';
        else if (error.message === 'not_found') reason = 'not_found';
        else if (error.message === 'service_unavailable') reason = 'service_unavailable';

        session.transition('FAILED', reason);
      }
    })();

  } catch (error) {
    logger.error('Outbound call endpoint error', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'internal_error',
      message: 'An internal error occurred'
    });
  }
});

/**
 * GET /api/call/:callId
 */
router.get('/call/:callId', function(req, res) {
  var callId = req.params.callId;
  var session = getSession(callId);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'not_found',
      message: 'Call not found or expired'
    });
  }

  res.json({
    success: true,
    data: session.getInfo()
  });
});

/**
 * GET /api/calls
 */
router.get('/calls', function(req, res) {
  var sessions = getAllSessions();

  res.json({
    success: true,
    count: sessions.length,
    calls: sessions.map(function(s) { return s.getInfo(); })
  });
});

/**
 * POST /api/call/:callId/hangup
 */
router.post('/call/:callId/hangup', async function(req, res) {
  var callId = req.params.callId;
  var session = getSession(callId);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'not_found',
      message: 'Call not found or expired'
    });
  }

  if (session.state === 'COMPLETED' || session.state === 'FAILED') {
    return res.status(400).json({
      success: false,
      error: 'already_ended',
      message: 'Call has already ended'
    });
  }

  try {
    await session.hangup();

    res.json({
      success: true,
      message: 'Call hangup initiated',
      callId: callId
    });
  } catch (error) {
    logger.error('Failed to hangup call', {
      callId: callId,
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: 'hangup_failed',
      message: error.message
    });
  }
});

/**
 * Setup routes with dependencies
 */
function setupRoutes(deps) {
  srf = deps.srf;
  mediaServer = deps.mediaServer;
  deviceRegistry = deps.deviceRegistry || null;
  audioForkServer = deps.audioForkServer || null;
  whisperClient = deps.whisperClient || null;
  claudeBridge = deps.claudeBridge || null;
  ttsService = deps.ttsService || null;
  wsPort = deps.wsPort || 3001;

  var conversationReady = !!(audioForkServer && whisperClient && claudeBridge && ttsService);

  logger.info('Outbound routes initialized', {
    srf: !!srf,
    mediaServer: !!mediaServer,
    deviceRegistry: !!deviceRegistry,
    conversationMode: conversationReady ? 'enabled' : 'disabled'
  });
}

/**
 * Replace the media server used by outbound routes after a reconnect.
 * @param {Object|null} server - FreeSWITCH media server
 */
function setMediaServer(server) {
  mediaServer = server || null;
}

module.exports = {
  router: router,
  setupRoutes: setupRoutes,
  setMediaServer: setMediaServer
};
