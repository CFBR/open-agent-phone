/**
 * Tests for the retry helper (dependency-free).
 * Run with: node --test test/retry.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { withRetry, isTransientError, TRANSIENT_CODES, TRANSIENT_STATUS } = require('../lib/retry');

test('isTransientError detects transient codes', function () {
  assert.strictEqual(isTransientError({ code: 'ETIMEDOUT' }), true);
  assert.strictEqual(isTransientError({ code: 'ECONNRESET' }), true);
  assert.strictEqual(isTransientError({ code: 'ECONNREFUSED' }), true);
});

test('isTransientError detects transient HTTP statuses', function () {
  assert.strictEqual(isTransientError({ response: { status: 429 } }), true);
  assert.strictEqual(isTransientError({ response: { status: 503 } }), true);
  assert.strictEqual(isTransientError({ response: { status: 500 } }), true);
});

test('isTransientError rejects non-transient errors', function () {
  assert.strictEqual(isTransientError({ code: 'ECONNREFUSED1' }), false);
  assert.strictEqual(isTransientError({ response: { status: 400 } }), false);
  assert.strictEqual(isTransientError({ response: { status: 404 } }), false);
  assert.strictEqual(isTransientError(null), false);
});

test('withRetry returns on first success without retrying', async function () {
  let calls = 0;
  const r = await withRetry(async () => { calls++; return 'ok'; });
  assert.strictEqual(r, 'ok');
  assert.strictEqual(calls, 1);
});

test('withRetry retries transient failures then succeeds', async function () {
  let calls = 0;
  const r = await withRetry(async () => {
    calls++;
    if (calls < 3) throw { code: 'ETIMEDOUT' };
    return 'ok';
  }, { baseDelayMs: 1 });
  assert.strictEqual(r, 'ok');
  assert.strictEqual(calls, 3);
});

test('withRetry does not retry non-transient errors', async function () {
  let calls = 0;
  await assert.rejects(async () => withRetry(async () => {
    calls++;
    throw { code: 'EINVALID' };
  }), (err) => err.code === 'EINVALID');
  assert.strictEqual(calls, 1);
});

test('withRetry gives up after max retries', async function () {
  let calls = 0;
  await assert.rejects(async () => withRetry(async () => {
    calls++;
    throw { code: 'ECONNRESET' };
  }, { retries: 2, baseDelayMs: 1 }), (err) => err.code === 'ECONNRESET');
  assert.strictEqual(calls, 3); // 1 initial + 2 retries
});

test('withRetry passes attempt index to fn', async function () {
  const seen = [];
  await withRetry(async (attempt) => {
    seen.push(attempt);
    if (attempt < 1) throw { code: 'ETIMEDOUT' };
    return 'ok';
  }, { baseDelayMs: 1 });
  assert.deepStrictEqual(seen, [0, 1]);
});

test('withRetry honors custom shouldRetry', async function () {
  let calls = 0;
  await assert.rejects(async () => withRetry(async () => {
    calls++;
    throw new Error('nope');
  }, { shouldRetry: () => false }), (err) => err.message === 'nope');
  assert.strictEqual(calls, 1);
});

test('TRANSIENT_CODES and TRANSIENT_STATUS are exposed sets', function () {
  assert.ok(TRANSIENT_CODES.has('ETIMEDOUT'));
  assert.ok(TRANSIENT_STATUS.has(429));
});
