const { test } = require('node:test');
const assert = require('node:assert');
const {
  sessionIdForCall,
  buildOpenCodeArgs,
  parseOpenCodeStdout,
} = require('../opencode');

test('sessionIdForCall creates a ses_ prefixed ID from a call ID', () => {
  assert.strictEqual(sessionIdForCall('abc-123'), 'ses_abc-123');
  assert.strictEqual(sessionIdForCall('a b/c'), 'ses_abc');
  assert.strictEqual(sessionIdForCall(''), null);
});

test('buildOpenCodeArgs includes the model and optional session flags', () => {
  assert.deepStrictEqual(
    buildOpenCodeArgs({ model: 'opencode-go/deepseek-v4.1-flash' }),
    ['run', '--standalone', '--format', 'json', '--model', 'opencode-go/deepseek-v4.1-flash']
  );

  assert.deepStrictEqual(
    buildOpenCodeArgs({
      model: 'opencode-go/deepseek-v4.1-flash',
      sessionId: 'ses_call',
      autoApprove: true,
    }),
    [
      'run', '--standalone', '--format', 'json',
      '--model', 'opencode-go/deepseek-v4.1-flash',
      '--session', 'ses_call',
      '--auto',
    ]
  );
});

test('buildOpenCodeArgs rejects a missing model', () => {
  assert.throws(() => buildOpenCodeArgs({}), /OPENCODE_MODEL/);
});

test('parseOpenCodeStdout concatenates text events', () => {
  const output = [
    JSON.stringify({ type: 'step_start', sessionID: 'ses_1' }),
    JSON.stringify({ type: 'text', sessionID: 'ses_1', part: { text: 'Hello' } }),
    JSON.stringify({ type: 'text', sessionID: 'ses_1', part: { text: ' world' } }),
    JSON.stringify({ type: 'step_finish', sessionID: 'ses_1' }),
  ].join('\n');

  assert.deepStrictEqual(parseOpenCodeStdout(output), {
    response: 'Hello world',
    sessionId: 'ses_1',
  });
});

test('parseOpenCodeStdout ignores non-JSON lines and empty output', () => {
  assert.deepStrictEqual(parseOpenCodeStdout('not json\n'), { response: '', sessionId: null });
  assert.deepStrictEqual(parseOpenCodeStdout(''), { response: '', sessionId: null });
});
