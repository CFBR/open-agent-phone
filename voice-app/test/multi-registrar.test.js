/**
 * Tests for MultiRegistrar timer lifecycle.
 * Run with: node --test test/multi-registrar.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const MultiRegistrar = require('../lib/multi-registrar');

function makeMockSrf() {
  return {
    request: function (uri, opts, cb) {
      // Simulate an immediate 200 OK so registration succeeds and schedules a refresh
      const req = {
        on: function (event, handler) {
          if (event === 'response') {
            // Defer to next tick so listeners attach first
            setImmediate(function () {
              handler({ status: 200, reason: 'OK', get: function () { return null; } });
            });
          }
        }
      };
      setImmediate(function () { cb(null, req); });
    }
  };
}

test('stop() clears all scheduled refresh/retry timers', async function () {
  const srf = makeMockSrf();
  const reg = new MultiRegistrar(srf, {
    domain: 'example.com',
    registrar: 'example.com',
    registrar_port: 5060,
    local_address: '127.0.0.1',
    local_port: 5060,
    expiry: 3600
  });

  reg.registerDevice({
    name: 'Test',
    extension: '9000',
    authId: 'auth',
    password: 'pass'
  });

  // Wait for the async 200 OK response to schedule a refresh timer
  await new Promise(function (r) { setTimeout(r, 50); });
  assert.ok(reg.timers.size > 0, 'a refresh timer should be scheduled after 200 OK');

  reg.stop();
  assert.strictEqual(reg.timers.size, 0, 'stop() must clear all timers');
  assert.strictEqual(reg.stopped, true);
});

test('after stop(), scheduleRefresh/scheduleRetry are no-ops', function () {
  const srf = makeMockSrf();
  const reg = new MultiRegistrar(srf, {
    domain: 'example.com', registrar: 'example.com', registrar_port: 5060,
    local_address: '127.0.0.1', local_port: 5060, expiry: 3600
  });
  reg.stop();

  reg.scheduleRefresh({ name: 'X', extension: '9001' }, { extension: '9001' }, 1);
  reg.scheduleRetry({ name: 'X', extension: '9001' }, { extension: '9001' }, 1);
  assert.strictEqual(reg.timers.size, 0, 'no timers should be scheduled after stop');
});

test('scheduleRetry replaces an existing timer for the same extension', function () {
  const srf = makeMockSrf();
  const reg = new MultiRegistrar(srf, {
    domain: 'example.com', registrar: 'example.com', registrar_port: 5060,
    local_address: '127.0.0.1', local_port: 5060, expiry: 3600
  });
  reg.scheduleRetry({ name: 'X', extension: '9002' }, { extension: '9002' }, 100);
  assert.strictEqual(reg.timers.size, 1);
  reg.scheduleRetry({ name: 'X', extension: '9002' }, { extension: '9002' }, 100);
  assert.strictEqual(reg.timers.size, 1, 'second schedule should replace, not stack');
  reg.stop();
});
