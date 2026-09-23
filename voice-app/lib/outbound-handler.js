/**
 * Outbound Call Handler
 * Core logic for initiating outbound SIP calls via drachtio
 * v2: Added voiceId support for device-specific TTS
 *
 * Uses Early Offer pattern:
 * 1. Create FreeSWITCH endpoint first to get local SDP
 * 2. Send INVITE with our SDP
 * 3. On answer, connect the endpoint with remote SDP
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');
const ttsService = require('./tts-service');

/**
 * Initiate an outbound call
 *
 * @param {Object} srf - drachtio SRF instance
 * @param {Object} mediaServer - FreeSWITCH media server
 * @param {Object} options - Call options
 * @param {string} options.to - Phone number in E.164 format (+15551234567)
 * @param {string} options.message - Message to play when answered
 * @param {string} [options.callerId] - Caller ID (defaults to DEFAULT_CALLER_ID env var)
 * @param {number} [options.timeoutSeconds=30] - Ring timeout in seconds
 * @returns {Promise<Object>} { callId, dialog, endpoint }
 */
async function initiateOutboundCall(srf, mediaServer, options) {
  const {
    to,
    callerId,
    timeoutSeconds = 30,
    deviceConfig = null
  } = options;

  const callId = uuidv4();
  const startTime = Date.now();

  try {
    logger.info('Initiating outbound call', {
      callId,
      to,
      callerId,
      timeout: timeoutSeconds
    });

    // STEP 1: Create FreeSWITCH endpoint first (Early Offer pattern)
    logger.info('Creating FreeSWITCH endpoint', { callId });
    const endpoint = await mediaServer.createEndpoint();

    // Get local SDP from FreeSWITCH
    const localSdp = endpoint.local.sdp;

    // Format SIP URI for 3CX
    // Remove '+' from E.164 format for SIP URI
    // Internal extensions: dial as-is. External (E.164 with +): add 9 prefix for PSTN
    const isExternal = to.startsWith('+');
    const phoneNumber = isExternal ? '9' + to.replace(/^\+1?/, '') : to;
    const sipTrunkHost = process.env.SIP_TRUNK_HOST || '10.70.7.50';
    const defaultCallerId = callerId || process.env.DEFAULT_CALLER_ID || '+15551234567';

    // SIP Authentication for 3CX extension registration
    const sipAuthUsername = process.env.SIP_AUTH_USERNAME;
    const sipAuthPassword = process.env.SIP_AUTH_PASSWORD;

    const sipUri = 'sip:' + phoneNumber + '@' + sipTrunkHost;

    logger.info('Dialing SIP URI', {
      callId,
      sipUri,
      from: defaultCallerId,
      hasAuth: !!(sipAuthUsername && sipAuthPassword)
    });

    // STEP 2: Create UAC (outbound call) with Early Offer
    // Use device extension and display name if available, otherwise fall back to callerId
    const fromExtension = deviceConfig ? deviceConfig.extension : defaultCallerId.replace('+', '');
    const displayName = deviceConfig ? deviceConfig.name : null;
    const fromHeader = displayName
      ? '"' + displayName + '" <sip:' + fromExtension + '@' + sipTrunkHost + '>'
      : '<sip:' + fromExtension + '@' + sipTrunkHost + '>';

    const uacOptions = {
      localSdp: localSdp,
      headers: {
        'From': fromHeader,
        'User-Agent': 'NetworkChuck-VoiceServer/1.0',
        'X-Call-ID': callId
      }
    };

    // Add SIP authentication - prefer device credentials, fall back to env vars
    const authUsername = deviceConfig ? deviceConfig.authId : sipAuthUsername;
    const authPassword = deviceConfig ? deviceConfig.password : sipAuthPassword;

    if (authUsername && authPassword) {
      uacOptions.auth = {
        username: authUsername,
        password: authPassword
      };
      logger.info('SIP authentication enabled', {
        callId,
        username: authUsername,
        device: deviceConfig ? deviceConfig.name : 'default'
      });
    }

    let isRinging = false;

    // Create the outbound call (returns dialog directly, not { uas, uac })
    const uac = await srf.createUAC(sipUri, uacOptions, {
      cbRequest: function(err, _req) {
        // Called when INVITE is sent
        if (err) {
          logger.error('INVITE send failed', { callId, error: err.message });
        } else {
          logger.info('INVITE sent successfully', { callId });
        }
      },
      cbProvisional: function(res) {
        // Called on provisional responses (180 Ringing, 183 Progress, etc.)
        logger.info('Provisional response received', {
          callId,
          status: res.status,
          reason: res.reason
        });

        if (res.status === 180) {
          isRinging = true;
          logger.info('Phone is ringing', { callId, to });
        }
      }
    });

    // STEP 3: Call was answered! Connect endpoint with remote SDP
    const latency = Date.now() - startTime;

    logger.info('Call answered', {
      callId,
      to,
      latency,
      isRinging
    });

    // Modify endpoint with remote SDP to complete media connection
    await endpoint.modify(uac.remote.sdp);

    logger.info('Media connection established', { callId });

    // Setup call cleanup on remote hangup
    uac.on('destroy', function() {
      logger.info('Remote party hung up', { callId });
      if (endpoint) {
        endpoint.destroy().catch(function(err) {
          logger.warn('Failed to destroy endpoint on hangup', {
            callId,
            error: err.message
          });
        });
      }
    });

    return {
      callId,
      dialog: uac,
      endpoint,
      isRinging,
      latency
    };

  } catch (error) {
    const latency = Date.now() - startTime;

    logger.error('Outbound call failed', {
      callId,
      to,
      error: error.message,
      latency
    });

    // Handle specific SIP error codes
    if (error.status) {
      const status = error.status;
      if (status === 486) {
        throw new Error('busy');
      } else if (status === 480 || status === 408) {
        throw new Error('no_answer');
      } else if (status === 404) {
        throw new Error('not_found');
      } else if (status === 503) {
        throw new Error('service_unavailable');
      } else if (status === 401 || status === 407) {
        throw new Error('auth_failed');
      }
    }

    throw error;
  }
}

/**
 * Play a TTS message to an active call
 *
 * @param {Object} endpoint - FreeSWITCH endpoint
 * @param {string} message - Text to convert to speech and play
 * @param {Object} [options] - Playback options
 * @param {string} [options.voiceId] - ElevenLabs voice ID for device-specific voice
 * @returns {Promise<void>}
 */
async function playMessage(endpoint, message, options) {
  options = options || {};
  var voiceId = options.voiceId || null;
  var startTime = Date.now();

  try {
    logger.info('Generating TTS for outbound call', {
      textLength: message.length,
      voiceId: voiceId || 'default'
    });

    // Generate TTS audio file with optional device voice
    var audioUrl = await ttsService.generateSpeech(message, voiceId);

    logger.info('Playing TTS to caller', { audioUrl: audioUrl });

    // Play the audio file via FreeSWITCH
    await endpoint.play(audioUrl);

    var duration = Date.now() - startTime;

    logger.info('TTS playback completed', {
      duration: duration,
      audioUrl: audioUrl
    });

  } catch (error) {
    logger.error('Failed to play message', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Hangup an active outbound call
 *
 * @param {Object} dialog - drachtio dialog (UAC)
 * @param {Object} endpoint - FreeSWITCH endpoint
 * @param {string} callId - Call UUID for logging
 */
async function hangupCall(dialog, endpoint, callId) {
  logger.info('Hanging up outbound call', { callId: callId });

  try {
    // Destroy SIP dialog
    if (dialog && !dialog.destroyed) {
      await dialog.destroy();
      logger.info('Dialog destroyed', { callId: callId });
    }
  } catch (error) {
    logger.warn('Failed to destroy dialog', {
      callId: callId,
      error: error.message
    });
  }

  try {
    // Destroy FreeSWITCH endpoint
    if (endpoint) {
      await endpoint.destroy();
      logger.info('Endpoint destroyed', { callId: callId });
    }
  } catch (error) {
    logger.warn('Failed to destroy endpoint', {
      callId: callId,
      error: error.message
    });
  }
}

module.exports = {
  initiateOutboundCall: initiateOutboundCall,
  playMessage: playMessage,
  hangupCall: hangupCall
};
