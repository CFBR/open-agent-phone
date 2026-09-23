/**
 * SIP Call Handler with Conversation Loop
 * v12: Device registry integration with proper method names
 */

const { runConversationLoop } = require('./conversation-loop');

// Default voice ID (Morpheus)
const DEFAULT_VOICE_ID = 'JAgnJveGGUh4qy4kh6dF';

function extractCallerId(req) {
  var from = req.get("From") || "";
  var match = from.match(/sip:([+\d]+)@/);
  if (match) return match[1];
  var numMatch = from.match(/<sip:(\d+)@/);
  if (numMatch) return numMatch[1];
  return "unknown";
}

/**
 * Extract dialed extension from SIP To header
 */
function extractDialedExtension(req) {
  var to = req.get("To") || "";
  var match = to.match(/sip:(\d+)@/);
  if (match) {
    return match[1];
  }
  return null;
}

/**
 * Build a device-specific greeting for inbound calls.
 */
function buildDeviceGreeting(deviceConfig) {
  if (deviceConfig && deviceConfig.name && deviceConfig.name !== 'Morpheus') {
    return "Hello! I'm " + deviceConfig.name + ". How can I help you today?";
  }
  return "Hello! I'm your server. How can I help you today?";
}

/**
 * Inbound conversation loop — delegates to the shared runConversationLoop so
 * inbound calls get the same features as outbound (DTMF # finalization,
 * call-active tracking, structured logger, configurable max turns). The
 * shared loop handles audio fork, transcription, Claude queries, and TTS.
 */
async function conversationLoop(endpoint, dialog, callUuid, options, deviceConfig) {
  const { ttsService, whisperClient, claudeBridge, wsPort, audioForkServer } = options;
  const deviceName = deviceConfig ? deviceConfig.name : 'Morpheus';
  const voiceId = (deviceConfig && deviceConfig.voiceId) ? deviceConfig.voiceId : DEFAULT_VOICE_ID;

  console.log('[' + new Date().toISOString() + '] CONVERSATION Starting (session: ' + callUuid + ', device: ' + deviceName + ', voice: ' + voiceId + ')...');

  try {
    await runConversationLoop(endpoint, dialog, callUuid, {
      audioForkServer: audioForkServer,
      whisperClient: whisperClient,
      claudeBridge: claudeBridge,
      ttsService: ttsService,
      wsPort: wsPort,
      deviceConfig: deviceConfig,
      greeting: buildDeviceGreeting(deviceConfig),
      skipGreeting: false,
      maxTurns: 20
    });
  } finally {
    // Inbound calls own their dialog: hang up when the loop exits.
    try { dialog.destroy(); } catch (e) {}
  }
}

/**
 * Strip video tracks from SDP (FreeSWITCH doesn't support H.261 and rejects with 488)
 * Keeps only audio tracks to ensure codec negotiation succeeds
 */
function stripVideoFromSdp(sdp) {
  if (!sdp) return sdp;

  const lines = sdp.split('\r\n');
  const result = [];
  let inVideoSection = false;

  for (const line of lines) {
    // Check if we're entering a video media section
    if (line.startsWith('m=video')) {
      inVideoSection = true;
      continue; // Skip the m=video line
    }

    // Check if we're entering a new media section (audio, etc.)
    if (line.startsWith('m=') && !line.startsWith('m=video')) {
      inVideoSection = false;
    }

    // Skip all lines in the video section
    if (inVideoSection) {
      continue;
    }

    result.push(line);
  }

  return result.join('\r\n');
}

/**
 * Handle incoming SIP INVITE
 */
async function handleInvite(req, res, options) {
  const { mediaServer, deviceRegistry } = options;

  const callerId = extractCallerId(req);
  const dialedExt = extractDialedExtension(req);

  // Look up device config using deviceRegistry.getWithVoiceId() (works with name OR extension)
  let deviceConfig = null;
  if (deviceRegistry && dialedExt) {
    deviceConfig = deviceRegistry.getWithVoiceId(dialedExt);
    if (deviceConfig) {
      console.log('[' + new Date().toISOString() + '] CALL Device matched: ' + deviceConfig.name + ' (ext ' + dialedExt + ')');
    } else {
      console.log('[' + new Date().toISOString() + '] CALL Unknown extension ' + dialedExt + ', using default');
      deviceConfig = deviceRegistry.getDefault();
    }
  }

  console.log('[' + new Date().toISOString() + '] CALL Incoming from: ' + callerId + ' to ext: ' + (dialedExt || 'unknown'));

  try {
    // Strip video from SDP to avoid FreeSWITCH 488 error with unsupported video codecs
    const originalSdp = req.body;
    const audioOnlySdp = stripVideoFromSdp(originalSdp);
    if (originalSdp !== audioOnlySdp) {
      console.log('[' + new Date().toISOString() + '] CALL Stripped video track from SDP');
    }

    const result = await mediaServer.connectCaller(req, res, { remoteSdp: audioOnlySdp });
    const { endpoint, dialog } = result;
    const callUuid = endpoint.uuid;

    console.log('[' + new Date().toISOString() + '] CALL Connected: ' + callUuid);

    dialog.on('destroy', function() {
      console.log('[' + new Date().toISOString() + '] CALL Ended');
      if (endpoint) endpoint.destroy().catch(function() {});
    });

    await conversationLoop(endpoint, dialog, callUuid, options, deviceConfig);
    return { endpoint: endpoint, dialog: dialog, callerId: callerId, callUuid: callUuid };

  } catch (error) {
    console.error('[' + new Date().toISOString() + '] CALL Error:', error.message);
    try { res.send(500); } catch (e) {}
    throw error;
  }
}

module.exports = {
  handleInvite: handleInvite,
  extractCallerId: extractCallerId,
  extractDialedExtension: extractDialedExtension
};
