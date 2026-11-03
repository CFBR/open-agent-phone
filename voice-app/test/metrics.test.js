/**
 * Metrics registry tests.
 * Run with: node --test test/metrics.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const metrics = require('../lib/metrics');

test('renders counters with stable labels', () => {
  metrics.reset();
  metrics.inc('voice_calls_total');
  metrics.inc('voice_calls_total', 2, { direction: 'inbound' });
  metrics.inc('voice_tts_requests_total', 1, { provider: 'kokoro', cache: 'miss' });

  const output = metrics.render();
  assert.match(output, /voice_calls_total 1/);
  assert.match(output, /voice_calls_total\{direction="inbound"\} 2/);
  assert.match(output, /voice_tts_requests_total\{cache="miss",provider="kokoro"\} 1/);
});

test('gauges increment, decrement, and read back', () => {
  metrics.reset();
  metrics.incGauge('voice_active_calls');
  metrics.incGauge('voice_active_calls');
  metrics.decGauge('voice_active_calls');
  assert.strictEqual(metrics.get('voice_active_calls'), 1);
  assert.match(metrics.render(), /voice_active_calls 1/);
});

test('snapshot and reset expose and clear state', () => {
  metrics.reset();
  metrics.inc('voice_outbound_calls_total', 3);
  metrics.set('voice_active_calls', 2);
  const snapshot = metrics.snapshot();
  assert.strictEqual(snapshot.counters.voice_outbound_calls_total, 3);
  assert.strictEqual(snapshot.gauges.voice_active_calls, 2);

  metrics.reset();
  assert.strictEqual(metrics.render(), '');
  assert.strictEqual(metrics.get('voice_active_calls'), 0);
});

test('escapes label values', () => {
  metrics.reset();
  metrics.inc('voice_test_total', 1, { value: 'a"b\\c' });
  assert.match(metrics.render(), /value="a\\"b\\\\c"/);
});
