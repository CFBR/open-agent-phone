/**
 * Tests for the optional API auth middleware.
 * Run with: node --test test/api-auth.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

let express = null;
try {
  express = require('express');
} catch (e) {
  // express not installed in this dev env — express-dependent tests skip.
}

// Guard the require so the suite reports a clear skip rather than a load error.
let createApiAuthMiddleware;
let isAuthEnabled;
try {
  // eslint-disable-next-line global-require
  const mod = require('../lib/api-auth');
  createApiAuthMiddleware = mod.createApiAuthMiddleware;
  isAuthEnabled = mod.isAuthEnabled;
} catch (e) {
  // express not installed — skip this suite.
}

function request(app, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const req = http.request({ port, path, method: 'GET', headers }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => { server.close(); resolve({ status: res.statusCode, body }); });
      });
      req.on('error', (e) => { server.close(); reject(e); });
      req.end();
    });
  });
}

// These tests need express; if it's missing, the suite is skipped via the guard.
const maybe = (createApiAuthMiddleware && express) ? test : test.skip;

maybe('auth disabled (no token set) passes through', async function () {
  // Save & clear env so the factory sees no token.
  const saved = process.env.VOICE_API_TOKEN;
  delete process.env.VOICE_API_TOKEN;
  const app = express();
  app.use('/api', createApiAuthMiddleware());
  app.get('/api/ping', (req, res) => res.json({ ok: true }));
  const r = await request(app, '/api/ping');
  assert.strictEqual(r.status, 200);
  if (saved !== undefined) process.env.VOICE_API_TOKEN = saved;
});

maybe('valid X-API-Token header is accepted', async function () {
  process.env.VOICE_API_TOKEN = 'secret123';
  const app = express();
  app.use('/api', createApiAuthMiddleware());
  app.get('/api/ping', (req, res) => res.json({ ok: true }));
  const r = await request(app, '/api/ping', { 'X-API-Token': 'secret123' });
  assert.strictEqual(r.status, 200);
  delete process.env.VOICE_API_TOKEN;
});

maybe('valid Bearer token is accepted', async function () {
  process.env.VOICE_API_TOKEN = 'secret123';
  const app = express();
  app.use('/api', createApiAuthMiddleware());
  app.get('/api/ping', (req, res) => res.json({ ok: true }));
  const r = await request(app, '/api/ping', { Authorization: 'Bearer secret123' });
  assert.strictEqual(r.status, 200);
  delete process.env.VOICE_API_TOKEN;
});

maybe('missing token is rejected with 401', async function () {
  process.env.VOICE_API_TOKEN = 'secret123';
  const app = express();
  app.use('/api', createApiAuthMiddleware());
  app.get('/api/ping', (req, res) => res.json({ ok: true }));
  const r = await request(app, '/api/ping');
  assert.strictEqual(r.status, 401);
  delete process.env.VOICE_API_TOKEN;
});

maybe('wrong token is rejected with 401', async function () {
  process.env.VOICE_API_TOKEN = 'secret123';
  const app = express();
  app.use('/api', createApiAuthMiddleware());
  app.get('/api/ping', (req, res) => res.json({ ok: true }));
  const r = await request(app, '/api/ping', { 'X-API-Token': 'wrong' });
  assert.strictEqual(r.status, 401);
  delete process.env.VOICE_API_TOKEN;
});

test('isAuthEnabled reflects env var', function () {
  if (!isAuthEnabled) return;
  const saved = process.env.VOICE_API_TOKEN;
  delete process.env.VOICE_API_TOKEN;
  assert.strictEqual(isAuthEnabled(), false);
  process.env.VOICE_API_TOKEN = 'x';
  assert.strictEqual(isAuthEnabled(), true);
  delete process.env.VOICE_API_TOKEN;
  if (saved !== undefined) process.env.VOICE_API_TOKEN = saved;
});
