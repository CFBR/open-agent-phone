/**
 * Audio fork token tests.
 * Run with: node --test test/audio-fork-auth.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const {
  createAudioForkToken,
  verifyAudioForkToken,
} = require('../lib/audio-fork');

const SECRET = 'test-secret';

test('accepts a valid token for the same call', () => {
  const token = createAudioForkToken('call-1', { now: 1000, ttlMs: 5000, secret: SECRET });
  assert.strictEqual(verifyAudioForkToken('call-1', token, { now: 2000, secret: SECRET }), true);
});

test('rejects an expired token', () => {
  const token = createAudioForkToken('call-1', { now: 1000, ttlMs: 1000, secret: SECRET });
  assert.strictEqual(verifyAudioForkToken('call-1', token, { now: 2500, secret: SECRET }), false);
});

test('rejects a token for a different call', () => {
  const token = createAudioForkToken('call-1', { now: 1000, ttlMs: 5000, secret: SECRET });
  assert.strictEqual(verifyAudioForkToken('call-2', token, { now: 2000, secret: SECRET }), false);
});

test('rejects a tampered signature', () => {
  const token = createAudioForkToken('call-1', { now: 1000, ttlMs: 5000, secret: SECRET });
  const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
  assert.strictEqual(verifyAudioForkToken('call-1', tampered, { now: 2000, secret: SECRET }), false);
});

test('rejects a token signed with a different secret', () => {
  const token = createAudioForkToken('call-1', { now: 1000, ttlMs: 5000, secret: SECRET });
  assert.strictEqual(verifyAudioForkToken('call-1', token, { now: 2000, secret: 'other' }), false);
});

test('rejects missing, empty, and malformed tokens', () => {
  assert.strictEqual(verifyAudioForkToken('call-1', null, { secret: SECRET }), false);
  assert.strictEqual(verifyAudioForkToken('call-1', '', { secret: SECRET }), false);
  assert.strictEqual(verifyAudioForkToken('call-1', 'not-a-token', { secret: SECRET }), false);
  assert.strictEqual(verifyAudioForkToken('call-1', 'abc.', { secret: SECRET }), false);
});
