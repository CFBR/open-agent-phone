/**
 * TTS voice resolution tests.
 * Run with: node --test test/tts-service.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const {
  resolveVoiceId,
  DEFAULT_VOICE_ID,
  buildOpenAIRequest,
  speechEndpoint,
  getGenericConfig,
} = require('../lib/tts-service');

test('resolveVoiceId keeps an explicit voice', () => {
  assert.strictEqual(resolveVoiceId('custom-voice'), 'custom-voice');
});

test('resolveVoiceId falls back for null and undefined', () => {
  assert.strictEqual(resolveVoiceId(null), DEFAULT_VOICE_ID);
  assert.strictEqual(resolveVoiceId(undefined), DEFAULT_VOICE_ID);
});

test('resolveVoiceId falls back for an empty string', () => {
  assert.strictEqual(resolveVoiceId(''), DEFAULT_VOICE_ID);
});

test('speechEndpoint appends /audio/speech when needed', () => {
  assert.strictEqual(
    speechEndpoint('https://api.openai.com/v1'),
    'https://api.openai.com/v1/audio/speech'
  );
  assert.strictEqual(
    speechEndpoint('https://example.test/v1/audio/speech'),
    'https://example.test/v1/audio/speech'
  );
  assert.strictEqual(speechEndpoint(''), '');
});

test('buildOpenAIRequest builds an OpenAI-compatible payload', () => {
  const request = buildOpenAIRequest({
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'test-key',
    model: 'tts-1',
    voice: 'alloy',
    format: 'mp3',
  }, 'hello');

  assert.strictEqual(request.url, 'https://api.openai.com/v1/audio/speech');
  assert.strictEqual(request.headers.Authorization, 'Bearer test-key');
  assert.deepStrictEqual(request.data, {
    model: 'tts-1',
    input: 'hello',
    voice: 'alloy',
    response_format: 'mp3',
  });
});

test('buildOpenAIRequest rejects missing base URL or model', () => {
  assert.throws(() => buildOpenAIRequest({ model: 'tts-1' }, 'hi'), /TTS_BASE_URL/);
  assert.throws(() => buildOpenAIRequest({ baseUrl: 'https://example.test/v1' }, 'hi'), /TTS_MODEL/);
});

test('getGenericConfig reads provider overrides from the environment', () => {
  const saved = {
    TTS_BASE_URL: process.env.TTS_BASE_URL,
    TTS_API_KEY: process.env.TTS_API_KEY,
    TTS_MODEL: process.env.TTS_MODEL,
    TTS_VOICE: process.env.TTS_VOICE,
    TTS_FORMAT: process.env.TTS_FORMAT,
  };

  process.env.TTS_BASE_URL = 'https://nano-gpt.example/v1';
  process.env.TTS_API_KEY = 'nano-key';
  process.env.TTS_MODEL = 'tts-model';
  process.env.TTS_VOICE = 'voice-1';
  process.env.TTS_FORMAT = 'wav';

  try {
    const config = getGenericConfig('nanogpt');
    assert.strictEqual(config.baseUrl, 'https://nano-gpt.example/v1');
    assert.strictEqual(config.apiKey, 'nano-key');
    assert.strictEqual(config.model, 'tts-model');
    assert.strictEqual(config.voice, 'voice-1');
    assert.strictEqual(config.format, 'wav');
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
