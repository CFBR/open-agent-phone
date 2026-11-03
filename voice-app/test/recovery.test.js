/**
 * Reconnection and watchdog tests.
 * Run with: node --test test/recovery.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const {
  createReconnectController,
  createReadinessWatchdog,
} = require('../lib/recovery');

function createFakeTimers() {
  let nextId = 1;
  const entries = [];

  return {
    setTimeoutFn(fn, delay) {
      const entry = {
        id: nextId++,
        fn,
        delay,
        cleared: false,
        ran: false,
        unref() {},
      };
      entries.push(entry);
      return entry;
    },
    clearTimeoutFn(entry) {
      if (entry) entry.cleared = true;
    },
    pending() {
      return entries.filter((entry) => !entry.cleared && !entry.ran);
    },
    delays() {
      return entries.map((entry) => entry.delay);
    },
    async runNext() {
      const entry = this.pending()[0];
      if (!entry) throw new Error('no pending timer');
      entry.ran = true;
      await entry.fn();
      return entry;
    },
  };
}

test('reconnect controller retries with exponential backoff and resets on success', async () => {
  const timers = createFakeTimers();
  let attempts = 0;
  const connected = [];
  const errors = [];

  const controller = createReconnectController({
    connect: async () => {
      attempts++;
      if (attempts === 1) throw new Error('boom');
      return 'media-server';
    },
    onConnected: (result) => connected.push(result),
    onError: (error) => errors.push(error.message),
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  controller.schedule();
  assert.strictEqual(controller.pending, true);
  assert.deepStrictEqual(timers.delays(), [1000]);

  await timers.runNext();
  assert.strictEqual(errors.length, 1);
  assert.strictEqual(controller.attempt, 2);
  assert.deepStrictEqual(timers.delays(), [1000, 2000]);

  await timers.runNext();
  assert.deepStrictEqual(connected, ['media-server']);
  assert.strictEqual(controller.pending, false);
  assert.strictEqual(controller.attempt, 0);
});

test('reconnect controller stops scheduling after stop()', () => {
  const timers = createFakeTimers();
  const controller = createReconnectController({
    connect: async () => 'never',
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  controller.schedule();
  assert.strictEqual(timers.pending().length, 1);
  controller.stop();
  assert.strictEqual(timers.pending().length, 0);
  controller.schedule();
  assert.strictEqual(timers.pending().length, 0);
});

test('readiness watchdog fires once and can be disarmed', async () => {
  const timers = createFakeTimers();
  let timedOut = 0;

  const watchdog = createReadinessWatchdog({
    timeoutMs: 5000,
    onTimeout: () => { timedOut++; },
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  watchdog.arm();
  assert.strictEqual(watchdog.armed, true);
  await timers.runNext();
  assert.strictEqual(timedOut, 1);
  assert.strictEqual(watchdog.armed, false);

  watchdog.arm();
  watchdog.disarm();
  assert.strictEqual(watchdog.armed, false);
  assert.strictEqual(timers.pending().length, 0);
});

test('readiness watchdog ignores non-positive timeouts', () => {
  const timers = createFakeTimers();
  const watchdog = createReadinessWatchdog({
    timeoutMs: 0,
    onTimeout: () => { throw new Error('should not fire'); },
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  watchdog.arm();
  assert.strictEqual(watchdog.armed, false);
  assert.strictEqual(timers.pending().length, 0);
});
