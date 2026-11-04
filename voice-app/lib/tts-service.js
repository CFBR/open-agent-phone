/**
 * Text-to-Speech Service
 *
 * Providers:
 * - elevenlabs: ElevenLabs cloud API
 * - kokoro: local Kokoro-FastAPI OpenAI-compatible endpoint
 * - openai: OpenAI or any OpenAI-compatible /audio/speech endpoint
 * - openrouter: OpenRouter's OpenAI-compatible endpoint
 * - nanogpt: Nano-GPT's OpenAI-compatible endpoint
 * - custom: any other OpenAI-compatible /audio/speech endpoint
 *
 * Controlled by TTS_PROVIDER.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');
const audioUrls = require('./audio-urls');
const metrics = require('./metrics');
const { createTtsCache } = require('./tts-cache');
const { withRetry } = require('./retry');

const TTS_PROVIDER = (process.env.TTS_PROVIDER || 'elevenlabs').toLowerCase();

// ElevenLabs config
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';
const ELEVENLABS_MODEL = 'eleven_turbo_v2';

// Kokoro local config
const KOKORO_TTS_URL = process.env.KOKORO_TTS_URL || 'http://127.0.0.1:8880';

const GENERIC_PROVIDERS = new Set(['openai', 'openrouter', 'nanogpt', 'custom']);

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function speechEndpoint(baseUrl) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) return '';
  if (/\/audio\/speech$/i.test(base)) return base;
  return `${base}/audio/speech`;
}

/**
 * Resolve configuration for an OpenAI-compatible TTS provider.
 * @param {string} [provider]
 * @returns {{baseUrl: string, apiKey: string, model: string, voice: string, format: string}}
 */
function getGenericConfig(provider = TTS_PROVIDER) {
  const name = String(provider || '').toLowerCase();
  const common = {
    baseUrl: normalizeBaseUrl(process.env.TTS_BASE_URL),
    apiKey: process.env.TTS_API_KEY || '',
    model: process.env.TTS_MODEL || '',
    voice: process.env.TTS_VOICE || '',
    format: (process.env.TTS_FORMAT || 'mp3').toLowerCase(),
  };

  switch (name) {
    case 'openai':
      return {
        ...common,
        baseUrl: common.baseUrl || 'https://api.openai.com/v1',
        apiKey: common.apiKey || process.env.OPENAI_API_KEY || '',
        model: common.model || 'tts-1',
        voice: common.voice || 'alloy',
      };
    case 'openrouter':
      return {
        ...common,
        baseUrl: common.baseUrl || 'https://openrouter.ai/api/v1',
        apiKey: common.apiKey || process.env.OPENROUTER_API_KEY || '',
        model: common.model,
        voice: common.voice || 'alloy',
      };
    case 'nanogpt':
      return {
        ...common,
        baseUrl: common.baseUrl || process.env.NANOGPT_TTS_URL || '',
        apiKey: common.apiKey || process.env.NANOGPT_API_KEY || '',
        model: common.model,
        voice: common.voice || 'alloy',
      };
    case 'custom':
      return {
        ...common,
        apiKey: common.apiKey || process.env.CUSTOM_TTS_API_KEY || '',
        voice: common.voice || 'alloy',
      };
    default:
      return common;
  }
}

// Default voice IDs per provider
const DEFAULT_VOICES = {
  elevenlabs: process.env.ELEVENLABS_VOICE_ID || 'JAgnJveGGUh4qy4kh6dF',  // Morpheus
  kokoro: process.env.KOKORO_VOICE || 'af_heart',                         // American Female (heart)
  openai: getGenericConfig('openai').voice,
  openrouter: getGenericConfig('openrouter').voice,
  nanogpt: getGenericConfig('nanogpt').voice,
  custom: getGenericConfig('custom').voice,
};

const DEFAULT_VOICE_ID = DEFAULT_VOICES[TTS_PROVIDER] || DEFAULT_VOICES.elevenlabs;

/**
 * Resolve a possibly-null voice ID. Callers pass `null` when a device has no
 * configured voice; default parameters do not apply to null, so normalise here.
 * @param {string|null|undefined} voiceId
 * @returns {string}
 */
function resolveVoiceId(voiceId) {
  return voiceId || DEFAULT_VOICE_ID;
}

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
 * In-memory TTS cache keyed by provider+voice+text hash.
 *
 * Repeated phrases (greetings, thinking phrases, "I didn't hear anything", etc.)
 * are re-synthesized on every call because the filename includes Date.now(). The
 * cache skips the API call for identical text+voice and reuses the existing file.
 * Entries are validated against disk (the periodic cleanup may have removed the
 * file); stale entries are regenerated.
 */
const TTS_CACHE_MAX = parseInt(process.env.TTS_CACHE_MAX, 10) || 500;
const ttsCache = createTtsCache({ provider: TTS_PROVIDER, maxSize: TTS_CACHE_MAX });

function fileExists(filepath) {
  try {
    fs.accessSync(filepath);
    return true;
  } catch {
    return false;
  }
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
    responseType: 'arraybuffer',
    timeout: 30000
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
 * Build an OpenAI-compatible /audio/speech request.
 * @param {Object} config
 * @param {string} config.baseUrl
 * @param {string} [config.apiKey]
 * @param {string} config.model
 * @param {string} [config.voice]
 * @param {string} [config.format]
 * @param {string} text
 * @returns {{url: string, headers: Object, data: Object}}
 */
function buildOpenAIRequest(config, text) {
  if (!config || !config.baseUrl) {
    throw new Error('TTS_BASE_URL is required for this provider');
  }
  if (!config.model) {
    throw new Error('TTS_MODEL is required for this provider');
  }

  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  const format = config.format === 'wav' ? 'wav' : 'mp3';
  return {
    url: speechEndpoint(config.baseUrl),
    headers,
    data: {
      model: config.model,
      input: text,
      voice: config.voice || 'alloy',
      response_format: format,
    },
  };
}

/**
 * Generate speech via any OpenAI-compatible /audio/speech endpoint.
 * @param {string} text
 * @param {string} voiceId
 * @returns {Promise<{buffer: Buffer, ext: string}>}
 */
async function generateOpenAICompatible(text, voiceId) {
  const config = getGenericConfig();
  const request = buildOpenAIRequest({ ...config, voice: resolveVoiceId(voiceId) }, text);

  logger.info('Generating speech with OpenAI-compatible TTS', {
    provider: TTS_PROVIDER,
    endpoint: request.url,
    model: config.model,
    voice: request.data.voice,
    format: request.data.response_format
  });

  const response = await axios({
    method: 'POST',
    url: request.url,
    headers: request.headers,
    data: request.data,
    responseType: 'arraybuffer',
    timeout: 30000
  });

  return {
    buffer: response.data,
    ext: request.data.response_format === 'wav' ? 'wav' : 'mp3'
  };
}

/**
 * Convert text to speech
 * @param {string} text - Text to convert to speech
 * @param {string} voiceId - Voice ID (provider-specific)
 * @returns {Promise<string>} HTTP URL to audio file
 */
async function generateSpeech(text, voiceId) {
  const startTime = Date.now();
  const resolvedVoiceId = resolveVoiceId(voiceId);
  metrics.inc('voice_tts_requests_total', 1, { provider: TTS_PROVIDER });

  // Cache lookup: reuse an existing file for identical text+voice instead of
  // hitting the TTS provider again. Files may have been cleaned up, so verify.
  const cachedFilename = ttsCache.get(text, resolvedVoiceId);
  if (cachedFilename) {
    const cachedPath = path.join(audioDir, cachedFilename);
    if (fileExists(cachedPath)) {
      metrics.inc('voice_tts_cache_hits_total', 1, { provider: TTS_PROVIDER });
      logger.info('Speech cache hit', { filename: cachedFilename, textLength: text.length });
      return audioUrls.audioFileUrl(cachedFilename);
    }
    // File was cleaned up; drop the stale entry and regenerate.
    ttsCache.remove(text, resolvedVoiceId);
  }

  try {
    let result;

    if (TTS_PROVIDER === 'kokoro') {
      result = await withRetry(() => generateKokoro(text, resolvedVoiceId), { name: 'tts-kokoro' });
    } else if (TTS_PROVIDER === 'elevenlabs') {
      if (!ELEVENLABS_API_KEY) {
        throw new Error('ELEVENLABS_API_KEY environment variable not set');
      }
      result = await withRetry(() => generateElevenLabs(text, resolvedVoiceId), { name: 'tts-elevenlabs' });
    } else if (GENERIC_PROVIDERS.has(TTS_PROVIDER)) {
      result = await withRetry(
        () => generateOpenAICompatible(text, resolvedVoiceId),
        { name: `tts-${TTS_PROVIDER}` }
      );
    } else {
      throw new Error(
        `Unknown TTS_PROVIDER "${TTS_PROVIDER}". Use elevenlabs, kokoro, openai, openrouter, nanogpt, or custom.`
      );
    }

    // Save audio file
    const filename = generateFilename(text, result.ext);
    const filepath = path.join(audioDir, filename);

    fs.writeFileSync(filepath, result.buffer);

    // Store in cache (bounded; evicts oldest on overflow)
    ttsCache.set(text, resolvedVoiceId, filename);

    const latency = Date.now() - startTime;
    const fileSize = result.buffer.length;

    metrics.inc('voice_tts_success_total', 1, { provider: TTS_PROVIDER });
    logger.info('Speech generation successful', {
      provider: TTS_PROVIDER,
      filename,
      fileSize,
      latency,
      textLength: text.length,
      cache: 'miss'
    });

    // Return HTTP URL (served by the voice-app HTTP server)
    return audioUrls.audioFileUrl(filename);

  } catch (error) {
    const latency = Date.now() - startTime;

    metrics.inc('voice_tts_failures_total', 1, { provider: TTS_PROVIDER });
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
        throw new Error('Kokoro TTS server not running. Start it with docker compose');
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Kokoro TTS request timed out');
      }
    } else if (TTS_PROVIDER === 'elevenlabs') {
      if (error.response?.status === 401) {
        throw new Error('ElevenLabs API authentication failed. Check the API key');
      } else if (error.response?.status === 429) {
        throw new Error('ElevenLabs API rate limit exceeded');
      }
    } else {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        throw new Error(`${TTS_PROVIDER} TTS authentication failed. Check TTS_API_KEY`);
      } else if (status === 404) {
        throw new Error(`${TTS_PROVIDER} TTS endpoint or model not found. Check TTS_BASE_URL and TTS_MODEL`);
      } else if (status === 429) {
        throw new Error(`${TTS_PROVIDER} TTS rate limit exceeded`);
      } else if (error.code === 'ECONNREFUSED') {
        throw new Error(`${TTS_PROVIDER} TTS server not reachable. Check TTS_BASE_URL`);
      } else if (error.code === 'ECONNABORTED') {
        throw new Error(`${TTS_PROVIDER} TTS request timed out`);
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
  if (TTS_PROVIDER === 'elevenlabs') {
    return !!ELEVENLABS_API_KEY;
  }
  if (GENERIC_PROVIDERS.has(TTS_PROVIDER)) {
    const config = getGenericConfig();
    return !!config.baseUrl && !!config.model;
  }
  return false;
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

  if (GENERIC_PROVIDERS.has(TTS_PROVIDER)) {
    const configured = (process.env.TTS_VOICES || '')
      .split(',')
      .map((voice) => voice.trim())
      .filter(Boolean);
    const voices = configured.length
      ? configured
      : [getGenericConfig().voice || 'alloy'];
    return voices.map((voice) => ({ voice_id: voice, name: `${voice} (default)` }));
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

// NOTE: Periodic audio-file cleanup is owned centrally by index.js (via
// http-server.cleanupOldFiles) so there is a single cleanup loop. The
// cleanupOldFiles function below is still exported for manual/test use.

module.exports = {
  generateSpeech,
  setAudioDir,
  cleanupOldFiles,
  getAvailableVoices,
  isAvailable,
  getProvider,
  resolveVoiceId,
  getGenericConfig,
  buildOpenAIRequest,
  speechEndpoint,
  GENERIC_PROVIDERS,
  DEFAULT_VOICES,
  DEFAULT_VOICE_ID,
  // Exposed for testing / cache introspection
  ttsCache,
  TTS_CACHE_MAX
};
