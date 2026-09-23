/**
 * Tests for the shared voice-response helpers.
 * Run with: node --test test/voice-response.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const {
  extractVoiceLine,
  isGoodbye,
  cleanForSpeech,
  getRandomThinkingPhrase,
  THINKING_PHRASES,
} = require('../lib/voice-response');

test('THINKING_PHRASES is a non-empty array of strings', function () {
  assert.ok(Array.isArray(THINKING_PHRASES));
  assert.ok(THINKING_PHRASES.length > 5);
  for (const p of THINKING_PHRASES) assert.ok(typeof p === 'string' && p.length > 0);
});

test('getRandomThinkingPhrase returns a phrase from the list', function () {
  const p = getRandomThinkingPhrase();
  assert.ok(THINKING_PHRASES.includes(p));
});

test('cleanForSpeech strips markdown', function () {
  assert.strictEqual(cleanForSpeech('**bold**'), 'bold');
  assert.strictEqual(cleanForSpeech('[text](http://x)'), 'text');
  assert.strictEqual(cleanForSpeech('[bracketed]'), 'bracketed');
  assert.strictEqual(cleanForSpeech('  spaced  '), 'spaced');
});

test('extractVoiceLine: VOICE_RESPONSE wins', function () {
  assert.strictEqual(
    extractVoiceLine('🗣️ VOICE_RESPONSE: Hi there!\n🎯 COMPLETED: done'),
    'Hi there!'
  );
});

test('extractVoiceLine: falls back to COMPLETED', function () {
  assert.strictEqual(extractVoiceLine('🎯 COMPLETED: all good'), 'all good');
});

test('extractVoiceLine: falls back to first sentence', function () {
  assert.strictEqual(extractVoiceLine('First sentence. Second.'), 'First sentence');
});

test('extractVoiceLine: handles empty input', function () {
  assert.strictEqual(extractVoiceLine(''), '');
});

test('extractVoiceLine: punctuation-only input falls through to truncate fallback', function () {
  // No sentence delimiter yields content, so the truncate fallback returns the input.
  assert.strictEqual(extractVoiceLine('.!?'), '.!?');
});

test('extractVoiceLine: truncate fallback for long text with no delimiters', function () {
  const long = 'a'.repeat(800);
  const out = extractVoiceLine(long);
  assert.strictEqual(out.length, 500);
});

test('isGoodbye: positive and negative cases', function () {
  assert.strictEqual(isGoodbye('goodbye'), true);
  assert.strictEqual(isGoodbye('bye'), true);
  assert.strictEqual(isGoodbye('hang up'), true);
  assert.strictEqual(isGoodbye('please hang up now'), true);
  assert.strictEqual(isGoodbye('hello'), false);
  assert.strictEqual(isGoodbye(''), false);
});
