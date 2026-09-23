/**
 * Tests for pcm-stats.js (dependency-free PCM statistics).
 * Run with: node --test test/pcm-stats.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { pcmStats } = require('../lib/pcm-stats');

function makePcm(samples, endian = 'LE') {
  const buf = Buffer.alloc(samples.length * 2);
  if (endian === 'BE') {
    for (let i = 0; i < samples.length; i++) buf.writeInt16BE(samples[i], i * 2);
  } else {
    for (let i = 0; i < samples.length; i++) buf.writeInt16LE(samples[i], i * 2);
  }
  return buf;
}

test('empty buffer returns zero stats', function () {
  const s = pcmStats(Buffer.alloc(0));
  assert.strictEqual(s.sampleCount, 0);
  assert.strictEqual(s.rms, 0);
  assert.strictEqual(s.maxAbs, 0);
  assert.strictEqual(s.nearZeroRatio, 1);
});

test('odd-length buffer is handled (floor on samples)', function () {
  const s = pcmStats(Buffer.alloc(3)); // 1 sample + 1 byte leftover
  assert.strictEqual(s.sampleCount, 1);
});

test('silent buffer has high nearZeroRatio and zero rms', function () {
  const s = pcmStats(makePcm([0, 0, 0, 0]));
  assert.strictEqual(s.rms, 0);
  assert.strictEqual(s.maxAbs, 0);
  assert.strictEqual(s.nearZeroRatio, 1);
});

test('full-scale buffer has large rms and maxAbs', function () {
  const s = pcmStats(makePcm([32000, -32000, 16000, -16000]));
  assert.ok(s.maxAbs === 32000);
  assert.ok(s.rms > 0);
  assert.ok(s.nearZeroRatio < 1);
});

test('LE and BE decode the same samples identically', function () {
  const samples = [100, -200, 300, -400];
  const le = pcmStats(makePcm(samples, 'LE'), 'LE');
  const be = pcmStats(makePcm(samples, 'BE'), 'BE');
  assert.deepStrictEqual(le, be);
});

test('rms matches manual calculation', function () {
  const samples = [1000, 2000, 3000];
  const s = pcmStats(makePcm(samples));
  const expectedRms = Math.sqrt((1000 * 1000 + 2000 * 2000 + 3000 * 3000) / 3);
  assert.ok(Math.abs(s.rms - expectedRms) < 0.001);
});
