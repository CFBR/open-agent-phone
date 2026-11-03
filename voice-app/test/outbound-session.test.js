/**
 * Outbound session registry tests.
 * Run with: node --test test/outbound-session.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const {
  OutboundSession,
  getSession,
  getAllSessions,
  getSessionCount,
} = require('../lib/outbound-session');

test('session created without an ID is addressable by its generated callId', () => {
  const session = new OutboundSession(null, {
    to: '+15551234567',
    message: 'hello',
  });

  assert.ok(session.callId);
  assert.strictEqual(getSession(session.callId), session);
  assert.ok(getAllSessions().includes(session));
  assert.ok(getSessionCount() >= 1);
});

test('session created with an explicit ID is addressable by that ID', () => {
  const session = new OutboundSession('explicit-call-id', {
    to: '9001',
    message: 'hello',
  });

  assert.strictEqual(session.callId, 'explicit-call-id');
  assert.strictEqual(getSession('explicit-call-id'), session);
});
