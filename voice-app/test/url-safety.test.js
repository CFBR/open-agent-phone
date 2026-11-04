/**
 * Webhook URL safety tests.
 * Run with: node --test test/url-safety.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const {
  isPrivateIp,
  isPrivateHostname,
  validateWebhookUrl,
  assertSafeWebhookUrl,
} = require('../lib/url-safety');

test('detects private IPv4 and IPv6 literals', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.5', '192.168.1.10', '169.254.1.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:192.168.1.1']) {
    assert.strictEqual(isPrivateIp(address), true, address);
  }

  for (const address of ['8.8.8.8', '1.1.1.1', '2001:4860:4860::8888']) {
    assert.strictEqual(isPrivateIp(address), false, address);
  }
});

test('detects localhost names', () => {
  assert.strictEqual(isPrivateHostname('localhost'), true);
  assert.strictEqual(isPrivateHostname('api.localhost'), true);
  assert.strictEqual(isPrivateHostname('example.com'), false);
});

test('accepts a public HTTPS webhook', () => {
  const result = validateWebhookUrl('https://example.com/hook');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.url.hostname, 'example.com');
});

test('rejects private, credentialed, and non-HTTP webhooks', () => {
  assert.strictEqual(validateWebhookUrl('http://127.0.0.1/hook').ok, false);
  assert.strictEqual(validateWebhookUrl('http://192.168.1.10/hook').ok, false);
  assert.strictEqual(validateWebhookUrl('ftp://example.com/hook').ok, false);
  assert.strictEqual(validateWebhookUrl('https://user:pass@example.com/hook').ok, false);
  assert.strictEqual(validateWebhookUrl('not a url').ok, false);
});

test('allows private webhooks when explicitly enabled', () => {
  const result = validateWebhookUrl('http://127.0.0.1:8080/hook', { allowPrivate: true });
  assert.strictEqual(result.ok, true);
});

test('rejects hostnames that resolve to private addresses', async () => {
  const lookup = async () => [{ address: '10.0.0.5', family: 4 }];
  const result = await assertSafeWebhookUrl('https://hooks.example.test/path', { lookup });
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /private address/);
});

test('accepts hostnames that resolve to public addresses', async () => {
  const lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  const result = await assertSafeWebhookUrl('https://hooks.example.test/path', { lookup });
  assert.strictEqual(result.ok, true);
});

test('rejects an unresolvable hostname', async () => {
  const lookup = async () => { throw new Error('ENOTFOUND'); };
  const result = await assertSafeWebhookUrl('https://missing.example.test/path', { lookup });
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /could not be resolved/);
});
