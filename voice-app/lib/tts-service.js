/**
 * Text-to-Speech Service
 * Supports ElevenLabs (cloud) and Kokoro-82M (local via Kokoro-FastAPI)
 * Controlled by TTS_PROVIDER env var: "elevenlabs" (default) or "kokoro"
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

const TTS_PROVIDER = (process.env.TTS_PROVIDER || 'elevenlabs').toLowerCase();

// ElevenLabs config
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';
const ELEVENLABS_MODEL = 'eleven_turbo_v2';

// Kokoro local config
const KOKORO_TTS_URL = process.env.KOKORO_TTS_URL || 'http://127.0.0.1:8880';

// Default voice IDs per provider
const DEFAULT_VOICES = {
  elevenlabs: 'JAgnJveGGUh4qy4kh6dF',  // Morpheus
  kokoro: 'af_heart'                     // American Female (heart)
};

const DEFAULT_VOICE_ID = DEFAULT_VOICES[TTS_PROVIDER] || DEFAULT_VOICES.elevenlabs;

// Audio output directory (set via setAudioDir)
let audioDir = path.join(__dirname, '../audio-temp');

/**
 * Set the audio output directory
 * @param {string} dir - Absolute path to audio directory
 */
function setAudioDir(dir) {
  audioDir = dir;

  // Create directory if it doesn't exist
  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
    logger.info('Created audio directory', { path: audioDir });
  }
}

/**
 * Generate unique filename for audio file
 * @param {string} text - Text being converted
 * @param {string} ext - File extension (mp3 or wav)
 * @returns {string} Filename (without path)
 */
function generateFilename(text, ext = 'mp3') {
  const hash = crypto.createHash('md5').update(text).digest('hex').substring(0, 8);
  const timestamp = Date.now();
  return `tts-${timestamp}-${hash}.${ext}`;
}

/**
 * Generate speech via ElevenLabs API
 * @param {string} text - Text to convert
 * @param {string} voiceId - ElevenLabs voice ID
 * @returns {Promise<{buffer: Buffer, ext: string}>} Audio buffer and extension
 */
async function generateElevenLabs(text, voiceId) {
  logger.info('Generating speech with ElevenLabs', {
    textLength: text.length,
    voiceId,
    model: ELEVENLABS_MODEL
  });

  const response = await axios({
    method: 'POST',
    url: `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`,
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY
    },
    data: {
      text,
      model_id: ELEVENLABS_MODEL,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true
      }
    },
    responseType: 'arraybuffer'
  });

  return { buffer: response.data, ext: 'mp3' };
}

/**
 * Generate speech via local Kokoro-82M (OpenAI-compatible endpoint)
 * @param {string} text - Text to convert
 * @param {string} voiceId - Kokoro voice ID
 * @returns {Promise<{buffer: Buffer, ext: string}>} Audio buffer and extension
 */
async function generateKokoro(text, voiceId) {
  logger.info('Generating speech with Kokoro-82M', {
    textLength: text.length,
    voiceId,
    endpoint: KOKORO_TTS_URL
  });

  // Kokoro-FastAPI implements the OpenAI /v1/audio/speech endpoint
  const response = await axios({
    method: 'POST',
    url: `${KOKORO_TTS_URL}/v1/audio/speech`,
    headers: {
      'Content-Type': 'application/json'
    },
    data: {
      model: 'kokoro',
      input: text,
      voice: voiceId,
      response_format: 'wav'
    },
    responseType: 'arraybuffer',
    timeout: 30000
  });

  return { buffer: response.data, ext: 'wav' };
}

/**
 * Convert text to speech
 * @param {string} text - Text to convert to speech
 * @param {string} voiceId - Voice ID (provider-specific)
 * @returns {Promise<string>} HTTP URL to audio file
 */
async function generateSpeech(text, voiceId = DEFAULT_VOICE_ID) {
  const startTime = Date.now();

  try {
    let result;

    if (TTS_PROVIDER === 'kokoro') {
      result = await generateKokoro(text, voiceId);
    } else {
      // Default: ElevenLabs
      if (!ELEVENLABS_API_KEY) {
        throw new Error('ELEVENLABS_API_KEY environment variable not set');
      }
      result = await generateElevenLabs(text, voiceId);
    }

    // Save audio file
    const filename = generateFilename(text, result.ext);
    const filepath = path.join(audioDir, filename);

    fs.writeFileSync(filepath, result.buffer);

    const latency = Date.now() - startTime;
    const fileSize = result.buffer.length;

    logger.info('Speech generation successful', {
      provider: TTS_PROVIDER,
      filename,
      fileSize,
      latency,
      textLength: text.length
    });

    // Return HTTP URL (served by the voice-app HTTP server)
    return `http://127.0.0.1:3000/audio-files/${filename}`;

  } catch (error) {
    const latency = Date.now() - startTime;

    logger.error('Speech generation failed', {
      provider: TTS_PROVIDER,
      error: error.message,
      latency,
      textLength: text?.length,
      responseStatus: error.response?.status,
      responseData: error.response?.data?.toString()
    });

    if (TTS_PROVIDER === 'kokoro') {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Kokoro TTS server not running — start it with docker compose');
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Kokoro TTS request timed out');
      }
    } else {
      if (error.response?.status === 401) {
        throw new Error('ElevenLabs API authentication failed — check API key');
      } else if (error.response?.status === 429) {
        throw new Error('ElevenLabs API rate limit exceeded');
      }
    }

    throw new Error(`TTS generation failed: ${error.message}`);
  }
}

/**
 * Check if TTS is configured and available
 * @returns {boolean} True if TTS provider is ready
 */
function isAvailable() {
  if (TTS_PROVIDER === 'kokoro') {
    // Kokoro is available if the URL is set (container may not be running yet)
    return !!KOKORO_TTS_URL;
  }
  return !!ELEVENLABS_API_KEY;
}

/**
 * Get the current TTS provider name
 * @returns {string} Provider identifier
 */
function getProvider() {
  return TTS_PROVIDER;
}

/**
 * Get available voices for the current provider
 * @returns {Promise<Array>} Array of voice objects
 */
async function getAvailableVoices() {
  if (TTS_PROVIDER === 'kokoro') {
    // Kokoro doesn't have a voices list endpoint; return known presets
    return [
      { voice_id: 'af_heart', name: 'American Female (heart)' },
      { voice_id: 'af_bella', name: 'American Female (bella)' },
      { voice_id: 'af_nicole', name: 'American Female (nicole)' },
      { voice_id: 'af_sarah', name: 'American Female (sarah)' },
      { voice_id: 'af_sky', name: 'American Female (sky)' },
      { voice_id: 'am_adam', name: 'American Male (adam)' },
      { voice_id: 'am_echo', name: 'American Male (echo)' },
      { voice_id: 'am_eric', name: 'American Male (eric)' },
      { voice_id: 'am_fenrir', name: 'American Male (fenrir)' },
      { voice_id: 'am_liam', name: 'American Male (liam)' },
      { voice_id: 'am_michael', name: 'American Male (michael)' },
      { voice_id: 'am_puck', name: 'American Male (puck)' },
      { voice_id: 'bf_emma', name: 'British Female (emma)' },
      { voice_id: 'bf_isabella', name: 'British Female (isabella)' },
      { voice_id: 'bm_george', name: 'British Male (george)' },
      { voice_id: 'bm_lewis', name: 'British Male (lewis)' },
    ];
  }

  // ElevenLabs: fetch from API
  try {
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY not set');
    }

    const response = await axios({
      method: 'GET',
      url: `${ELEVENLABS_API_URL}/voices`,
      headers: { 'xi-api-key': ELEVENLABS_API_KEY }
    });

    return response.data.voices;
  } catch (error) {
    logger.error('Failed to fetch ElevenLabs voices', { error: error.message });
    throw error;
  }
}

/**
 * Clean up old audio files (older than specified age)
 * @param {number} maxAgeMs - Maximum age in milliseconds (default: 1 hour)
 */
function cleanupOldFiles(maxAgeMs = 60 * 60 * 1000) {
  try {
    const now = Date.now();
    const files = fs.readdirSync(audioDir);

    let deletedCount = 0;
    files.forEach(file => {
      if (!file.startsWith('tts-') || (!file.endsWith('.mp3') && !file.endsWith('.wav'))) {
        return;
      }

      const filepath = path.join(audioDir, file);
      const stats = fs.statSync(filepath);
      const age = now - stats.mtimeMs;

      if (age > maxAgeMs) {
        fs.unlinkSync(filepath);
        deletedCount++;
      }
    });

    if (deletedCount > 0) {
      logger.info('Cleaned up old audio files', { deletedCount });
    }
  } catch (error) {
    logger.warn('Failed to cleanup old audio files', { error: error.message });
  }
}

// Initialize audio directory
setAudioDir(audioDir);

// Setup periodic cleanup (every 30 minutes)
setInterval(() => {
  cleanupOldFiles();
}, 30 * 60 * 1000);

module.exports = {
  generateSpeech,
  setAudioDir,
  cleanupOldFiles,
  getAvailableVoices,
  isAvailable,
  getProvider
};
