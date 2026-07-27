/**
 * OpenRouter Whisper API Client for Speech-to-Text
 * Uses OpenRouter's OpenAI-compatible endpoint for Whisper
 * Converts audio buffers (L16 PCM from FreeSWITCH) to text
 */

const OpenAI = require("openai");
const WaveFile = require("wavefile").WaveFile;
const fs = require("fs");
const path = require("path");

// Lazy-initialized OpenRouter client
let openai = null;

function getOpenAIClient() {
  if (!openai) {
    if (!process.env.OPENROUTER_API_KEY) {
      console.warn("[WHISPER] OPENROUTER_API_KEY not set - STT will not work");
      return null;
    }
    openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/theNetworkChuck/claude-phone",
        "X-Title": "Claude Phone"
      }
    });
  }
  return openai;
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
 * Transcribe audio using OpenAI Whisper API
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

  const client = getOpenAIClient();
  if (!client) {
    throw new Error("OpenRouter API key not configured");
  }

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
    const transcription = await client.audio.transcriptions.create({
      file: fs.createReadStream(tempFile),
      model: "openai/whisper-1",
      language: language,
      response_format: "text"
    });

    const timestamp = new Date().toISOString();
    console.log("[" + timestamp + "] WHISPER Transcribed: " + transcription.substring(0, 100) + (transcription.length > 100 ? "..." : ""));

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
 * Check if Whisper API is configured and available
 * @returns {boolean} True if API key is set
 */
function isAvailable() {
  return !!process.env.OPENROUTER_API_KEY;
}

module.exports = {
  transcribe,
  pcmToWav,
  isAvailable
};
