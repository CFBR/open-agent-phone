/**
 * Tests for audio-urls.js (HTTP base URL configuration for FreeSWITCH fetches).
 * Run with: node --test test/audio-urls.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const audioUrls = require('../lib/audio-urls');

test('default base URL is 127.0.0.1:3000', function () {
  // Note: other tests may mutate state; reset first
  audioUrls.setHttpHost('127.0.0.1');
  audioUrls.setHttpPort(3000);
  assert.strictEqual(audioUrls.getBaseUrl(), 'http://127.0.0.1:3000');
});

test('audioFileUrl builds correct path', function () {
  audioUrls.setHttpHost('127.0.0.1');
  audioUrls.setHttpPort(3000);
  assert.strictEqual(audioUrls.audioFileUrl('tts-123.mp3'), 'http://127.0.0.1:3000/audio-files/tts-123.mp3');
});

test('setHttpPort changes the base URL for audio files and cues', function () {
  audioUrls.setHttpPort(8080);
  assert.strictEqual(audioUrls.audioFileUrl('x.wav'), 'http://127.0.0.1:8080/audio-files/x.wav');
  assert.ok(audioUrls.READY_BEEP_URL.includes(':8080/static/ready-beep.wav'));
  assert.ok(audioUrls.GOTIT_BEEP_URL.includes(':8080/'));
  assert.ok(audioUrls.HOLD_MUSIC_URL.includes(':8080/'));
});

test('setHttpHost changes the host', function () {
  audioUrls.setHttpHost('10.0.0.5');
  assert.strictEqual(audioUrls.getBaseUrl(), 'http://10.0.0.5:8080');
  audioUrls.setHttpHost('127.0.0.1');
  audioUrls.setHttpPort(3000);
});

test('cue URLs are getters that reflect current config', function () {
  audioUrls.setHttpPort(9090);
  const first = audioUrls.READY_BEEP_URL;
  audioUrls.setHttpPort(7070);
  const second = audioUrls.READY_BEEP_URL;
  assert.notStrictEqual(first, second);
  assert.ok(second.includes(':7070'));
  audioUrls.setHttpPort(3000);
});
