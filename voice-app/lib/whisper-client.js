/**
 * OpenRouter Whisper API Client for Speech-to-Text
 * Uses OpenRouter's OpenAI-compatible endpoint for Whisper
 * Supports multiple STT providers: openrouter (default), local (faster-whisper), custom
 * Converts audio buffers (L16 PCM from FreeSWITCH) to text
 */

const OpenAI = require("openai");
const WaveFile = require("wavefile").WaveFile;
const fs = require("fs");
const path = require("path");

// Lazy-initialized clients
let openaiClient = null;
let localClient = null;
let customClient = null;

const STT_PROVIDER = (process.env.STT_PROVIDER || 'openrouter').toLowerCase();
const LOCAL_WHISPER_URL = process.env.LOCAL_WHISPER_URL || 'http://localhost:7000';
const CUSTOM_STT_URL = process.env.CUSTOM_STT_URL || '';
const CUSTOM_STT_API_KEY = process.env.CUSTOM_STT_API_KEY || '';

function getOpenAIClient() {
  if (!openaiClient) {
    if (!process.env.OPENROUTER_API_KEY) {
      console.warn("[WHISPER] OPENROUTER_API_KEY not set - OpenRouter STT will not work");
      return null;
    }
    openaiClient = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/theNetworkChuck/claude-phone",
        "X-Title": "Claude Phone"
      }
    });
  }
  return openaiClient;
}

function getLocalClient() {
  if (!localClient) {
    localClient = new OpenAI({
      baseURL: LOCAL_WHISPER_URL,
      apiKey: 'local',  // faster-whisper accepts any key
    });
  }
  return localClient;
}

function getCustomClient() {
  if (!customClient) {
    if (!CUSTOM_STT_URL) {
      console.warn("[WHISPER] CUSTOM_STT_URL not set - Custom STT will not work");
      return null;
    }
    customClient = new OpenAI({
      baseURL: CUSTOM_STT_URL,
      apiKey: CUSTOM_STT_API_KEY,
    });
  }
  return customClient;
}

/**
 * Convert L16 PCM buffer to WAV format for Whisper API
 * @param {Buffer} pcmBuffer - Raw L16 PCM audio data
 * @param {number} sampleRate - Sample rate (default: 8000 Hz for telephony)
 * @returns {Buffer} WAV file buffer
 */
function pcmToWav(pcmBuffer, sampleRate = 8000) {
  const wav = new WaveFile();

  // Convert Buffer to Int16Array for wavefile library
  const samples = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 2);

  // Create WAV from raw PCM data
  wav.fromScratch(1, sampleRate, "16", samples);

  return Buffer.from(wav.toBuffer());
}

/**
 * Transcribe audio using configured STT provider
 * @param {Buffer} audioBuffer - Audio data (either WAV or raw PCM)
 * @param {Object} options - Transcription options
 * @param {string} options.format - Input format: "wav" or "pcm" (default: "pcm")
 * @param {number} options.sampleRate - Sample rate for PCM (default: 8000)
 * @param {string} options.language - Language code (default: "en")
 * @returns {Promise<string>} Transcribed text
 */
async function transcribe(audioBuffer, options = {}) {
  const {
    format = "pcm",
    sampleRate = 8000,
    language = "en"
  } = options;

  // Convert PCM to WAV if needed
  let wavBuffer;
  if (format === "pcm") {
    wavBuffer = pcmToWav(audioBuffer, sampleRate);
  } else {
    wavBuffer = audioBuffer;
  }

  // Write to temp file (Whisper API requires a file)
  const tempFile = path.join("/tmp", "whisper-" + Date.now() + ".wav");
  fs.writeFileSync(tempFile, wavBuffer);

  try {
    let transcription;
    
    if (STT_PROVIDER === 'local') {
      const client = getLocalClient();
      if (!client) {
        throw new Error("Local Whisper (faster-whisper) not configured - LOCAL_WHISPER_URL not set");
      }
      transcription = await client.audio.transcriptions.create({
        file: fs.createReadStream(tempFile),
        model: "whisper-1",
        language: language,
        response_format: "text"
      });
    } else if (STT_PROVIDER === 'custom') {
      const client = getCustomClient();
      if (!client) {
        throw new Error("Custom STT not configured - CUSTOM_STT_URL not set");
      }
      transcription = await client.audio.transcriptions.create({
        file: fs.createReadStream(tempFile),
        model: "whisper-1",
        language: language,
        response_format: "text"
      });
    } else {
      // Default: OpenRouter
      const client = getOpenAIClient();
      if (!client) {
        throw new Error("OpenRouter API key not configured");
      }
      transcription = await client.audio.transcriptions.create({
        file: fs.createReadStream(tempFile),
        model: "openai/whisper-1",
        language: language,
        response_format: "text"
      });
    }

    const timestamp = new Date().toISOString();
    console.log("[" + timestamp + "] WHISPER Transcribed (" + STT_PROVIDER + "): " + transcription.substring(0, 100) + (transcription.length > 100 ? "..." : ""));

    return transcription;
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tempFile);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Check if STT is configured and available
 * @returns {boolean} True if any provider is configured
 */
function isAvailable() {
  if (STT_PROVIDER === 'local') {
    return !!LOCAL_WHISPER_URL;
  }
  if (STT_PROVIDER === 'custom') {
    return !!CUSTOM_STT_URL;
  }
  return !!process.env.OPENROUTER_API_KEY;
}

module.exports = {
  transcribe,
  pcmToWav,
  isAvailable
};
