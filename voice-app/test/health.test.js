/**
 * Tests for the /health endpoint (incl. injected backend readiness info).
 * Requires express (a voice-app dependency).
 * Run with: node --test test/health.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

let createHttpServer = null;
try {
  createHttpServer = require('../lib/http-server').createHttpServer;
} catch (e) {
  // express not installed — skip.
}

const maybe = createHttpServer ? test : test.skip;

function get(server, path) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    http.get({ port, path }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

maybe('/health returns base fields', async function () {
  const { server } = createHttpServer('/tmp', 0);
  try {
    const r = await get(server, '/health');
    assert.strictEqual(r.status, 200);
    const data = JSON.parse(r.body);
    assert.ok(data.timestamp);
    assert.strictEqual(data.status, 'healthy');
  } finally {
    server.close();
  }
});

maybe('/health merges getHealthInfo output', async function () {
  const { server } = createHttpServer('/tmp', 0, {
    getHealthInfo: () => ({ drachtio: true, freeswitch: false, ready: true })
  });
  try {
    const r = await get(server, '/health');
    const data = JSON.parse(r.body);
    assert.strictEqual(data.drachtio, true);
    assert.strictEqual(data.freeswitch, false);
    assert.strictEqual(data.ready, true);
    assert.strictEqual(data.status, 'healthy');
  } finally {
    server.close();
  }
});

maybe('/health supports async getHealthInfo', async function () {
  const { server } = createHttpServer('/tmp', 0, {
    getHealthInfo: async () => ({ async: true })
  });
  try {
    const r = await get(server, '/health');
    const data = JSON.parse(r.body);
    assert.strictEqual(data.async, true);
  } finally {
    server.close();
  }
});

maybe('/health survives a throwing getHealthInfo', async function () {
  const { server } = createHttpServer('/tmp', 0, {
    getHealthInfo: () => { throw new Error('boom'); }
  });
  try {
    const r = await get(server, '/health');
    const data = JSON.parse(r.body);
    assert.strictEqual(data.status, 'healthy');
    assert.strictEqual(data.healthError, 'boom');
  } finally {
    server.close();
  }
});
