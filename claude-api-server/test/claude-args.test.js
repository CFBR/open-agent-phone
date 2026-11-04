const { test } = require('node:test');
const assert = require('node:assert');
const { buildClaudeArgs } = require('../claude-args');

test('omits dangerous permissions by default', () => {
  const args = buildClaudeArgs({ fullPrompt: 'hello', model: 'claude-test' });
  assert.deepStrictEqual(args, ['-p', 'hello', '--model', 'claude-test']);
  assert.ok(!args.includes('--dangerously-skip-permissions'));
});

test('adds dangerous permissions only when explicitly enabled', () => {
  const args = buildClaudeArgs({
    fullPrompt: 'hello',
    model: 'claude-test',
    allowDangerous: true,
  });
  assert.strictEqual(args[0], '--dangerously-skip-permissions');
});

test('adds new and resumed session flags', () => {
  assert.deepStrictEqual(
    buildClaudeArgs({ fullPrompt: 'hello', model: 'm', callId: 'call-1' }),
    ['-p', 'hello', '--model', 'm', '--session-id', 'call-1']
  );
  assert.deepStrictEqual(
    buildClaudeArgs({ fullPrompt: 'hello', model: 'm', callId: 'call-1', hasSession: true }),
    ['-p', 'hello', '--model', 'm', '--resume', 'call-1']
  );
});
