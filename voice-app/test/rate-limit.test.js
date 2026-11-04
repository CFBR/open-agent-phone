/**
 * Rate limiter tests.
 * Run with: node --test test/rate-limit.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { createRateLimiter, createClientKeyGenerator } = require('../lib/rate-limit');

function createRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    set(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('allows requests up to the limit and rejects the next one', () => {
  const now = 1000;
  const limiter = createRateLimiter({ windowMs: 60000, max: 2, now: () => now });
  const req = { ip: '10.0.0.1' };
  let nextCalls = 0;

  limiter(req, createRes(), () => { nextCalls++; });
  limiter(req, createRes(), () => { nextCalls++; });
  assert.strictEqual(nextCalls, 2);

  const res = createRes();
  limiter(req, res, () => { nextCalls++; });
  assert.strictEqual(nextCalls, 2);
  assert.strictEqual(res.statusCode, 429);
  assert.strictEqual(res.body.error, 'rate_limited');
  assert.ok(Number(res.headers['Retry-After']) >= 1);
});

test('resets after the window expires', () => {
  let now = 1000;
  const limiter = createRateLimiter({ windowMs: 1000, max: 1, now: () => now });
  const req = { ip: '10.0.0.1' };
  let nextCalls = 0;

  limiter(req, createRes(), () => { nextCalls++; });
  limiter(req, createRes(), () => { nextCalls++; });
  assert.strictEqual(nextCalls, 1);

  now += 1001;
  limiter(req, createRes(), () => { nextCalls++; });
  assert.strictEqual(nextCalls, 2);
});

test('tracks clients independently', () => {
  const limiter = createRateLimiter({ windowMs: 60000, max: 1, now: () => 1000 });
  let nextCalls = 0;

  limiter({ ip: '10.0.0.1' }, createRes(), () => { nextCalls++; });
  limiter({ ip: '10.0.0.2' }, createRes(), () => { nextCalls++; });
  assert.strictEqual(nextCalls, 2);
});

test('reset clears all buckets', () => {
  const limiter = createRateLimiter({ windowMs: 60000, max: 1, now: () => 1000 });
  let nextCalls = 0;

  limiter({ ip: '10.0.0.1' }, createRes(), () => { nextCalls++; });
  limiter.reset();
  limiter({ ip: '10.0.0.1' }, createRes(), () => { nextCalls++; });
  assert.strictEqual(nextCalls, 2);
});

test('client key prefers a hashed token and falls back to IP', () => {
  const keyFor = createClientKeyGenerator();

  const tokenKey = keyFor({
    get: (header) => (header === 'X-API-Token' ? 'super-secret' : undefined),
    ip: '10.0.0.1'
  });
  assert.match(tokenKey, /^token:/);
  assert.ok(!tokenKey.includes('super-secret'));

  assert.strictEqual(keyFor({ get: () => undefined, ip: '10.0.0.1' }), 'ip:10.0.0.1');
});

test('same token from different IPs uses the same key', () => {
  const keyFor = createClientKeyGenerator();
  const makeReq = (ip) => ({
    get: (header) => (header === 'Authorization' ? 'Bearer same-token' : undefined),
    ip
  });

  assert.strictEqual(keyFor(makeReq('10.0.0.1')), keyFor(makeReq('10.0.0.2')));
});
