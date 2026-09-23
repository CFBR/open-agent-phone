/**
 * Tests for SessionStore (session + history tracking with idle eviction).
 * Run with: node --test test/session-store.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { SessionStore } = require('../session-store');

test('setSession/getSession round-trips and touches lastSeen', function () {
  const s = new SessionStore();
  s.setSession('c1', 'sess-123');
  assert.strictEqual(s.getSession('c1'), 'sess-123');
  assert.ok(s.hasSession('c1'));
  assert.ok(s.lastSeen.has('c1'));
});

test('setHistory/getHistory round-trips', function () {
  const s = new SessionStore();
  s.setHistory('c2', [{ role: 'user', content: 'hi' }]);
  assert.deepStrictEqual(s.getHistory('c2'), [{ role: 'user', content: 'hi' }]);
  assert.ok(s.hasHistory('c2'));
});

test('end() removes session, history, and lastSeen; reports removal', function () {
  const s = new SessionStore();
  s.setSession('c3', 'sess');
  s.setHistory('c3', [{ role: 'user', content: 'x' }]);
  assert.strictEqual(s.end('c3'), true);
  assert.ok(!s.hasSession('c3'));
  assert.ok(!s.hasHistory('c3'));
  assert.ok(!s.lastSeen.has('c3'));
  assert.strictEqual(s.end('c3'), false, 'ending again reports nothing removed');
  assert.strictEqual(s.end(null), false);
});

test('sweep() evicts only entries idle longer than idleTtlMs', function () {
  const s = new SessionStore({ idleTtlMs: 1000, sweepIntervalMs: 99999 });
  const base = 1000000;
  s.setSession('old', 'a'); s.lastSeen.set('old', base);
  s.setSession('fresh', 'b'); s.lastSeen.set('fresh', base + 500);
  s.setHistory('oldHist', [{ role: 'user', content: 'x' }]); s.lastSeen.set('oldHist', base);

  const evicted = s.sweep(base + 1500); // 1500ms later: old(1500>1000) evicted, fresh(1000>1000? no, 500 idle) kept
  assert.strictEqual(evicted, 2, 'old + oldHist evicted');
  assert.ok(!s.hasSession('old'));
  assert.ok(!s.hasHistory('oldHist'));
  assert.ok(s.hasSession('fresh'));
});

test('sweep() keeps entries within idleTtlMs', function () {
  const s = new SessionStore({ idleTtlMs: 1000, sweepIntervalMs: 99999 });
  const now = Date.now();
  s.setSession('c', 'x');
  assert.strictEqual(s.sweep(now), 0);
  assert.ok(s.hasSession('c'));
});

test('startSweep/stopSweep do not throw and stop clears timer', function () {
  const s = new SessionStore({ idleTtlMs: 1, sweepIntervalMs: 10 });
  s.startSweep();
  s.startSweep(); // idempotent
  assert.ok(s._sweepTimer);
  s.stopSweep();
  assert.strictEqual(s._sweepTimer, null);
});

test('touch with no callId is a no-op', function () {
  const s = new SessionStore();
  s.touch(null);
  assert.strictEqual(s.lastSeen.size, 0);
});
