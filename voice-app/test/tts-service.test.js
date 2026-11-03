/**
 * TTS voice resolution tests.
 * Run with: node --test test/tts-service.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { resolveVoiceId, DEFAULT_VOICE_ID } = require('../lib/tts-service');

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
