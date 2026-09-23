/**
 * Tests for the TTS in-memory cache (key derivation + bounded eviction).
 * These do not call any real TTS provider and do not load axios.
 * Run with: node --test test/tts-cache.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { createTtsCache } = require('../lib/tts-cache');

test('keyFor is deterministic for the same text+voice', function () {
  const c = createTtsCache({ provider: 'elevenlabs' });
  assert.strictEqual(c.keyFor('hello', 'v1'), c.keyFor('hello', 'v1'));
});

test('keyFor differs by voice', function () {
  const c = createTtsCache({ provider: 'elevenlabs' });
  assert.notStrictEqual(c.keyFor('hello', 'v1'), c.keyFor('hello', 'v2'));
});

test('keyFor differs by text', function () {
  const c = createTtsCache({ provider: 'elevenlabs' });
  assert.notStrictEqual(c.keyFor('hello', 'v1'), c.keyFor('world', 'v1'));
});

test('keyFor handles null voice via default', function () {
  const c = createTtsCache({ provider: 'elevenlabs' });
  assert.ok(c.keyFor('hi', null).includes(':default:'));
});

test('get/set round-trip', function () {
  const c = createTtsCache({ provider: 'elevenlabs' });
  c.set('hello', 'v1', 'tts-1.mp3');
  assert.strictEqual(c.get('hello', 'v1'), 'tts-1.mp3');
});

test('remove deletes an entry', function () {
  const c = createTtsCache({ provider: 'elevenlabs' });
  c.set('hello', 'v1', 'tts-1.mp3');
  c.remove('hello', 'v1');
  assert.strictEqual(c.get('hello', 'v1'), undefined);
});

test('cache evicts oldest entries beyond maxSize', function () {
  const c = createTtsCache({ provider: 'elevenlabs', maxSize: 3 });
  c.set('a', 'v', 'f-a');
  c.set('b', 'v', 'f-b');
  c.set('c', 'v', 'f-c');
  assert.strictEqual(c.size, 3);
  // Inserting a 4th evicts the oldest ('a')
  c.set('d', 'v', 'f-d');
  assert.strictEqual(c.size, 3);
  assert.strictEqual(c.get('a', 'v'), undefined);
  assert.strictEqual(c.get('d', 'v'), 'f-d');
});

test('clear empties the cache', function () {
  const c = createTtsCache({ provider: 'elevenlabs' });
  c.set('a', 'v', 'f-a');
  c.clear();
  assert.strictEqual(c.size, 0);
});
