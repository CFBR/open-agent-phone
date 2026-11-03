/**
 * Call-flow integration tests for the shared conversation loop.
 * Run with: node --test test/call-flow.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { runConversationLoop } = require('../lib/conversation-loop');

function createHarness({
  utterances = [],
  transcripts = [],
  responses = [],
  waitForUtterance = null,
  onCaptureEnabled = null,
} = {}) {
  const endpoint = new EventEmitter();
  endpoint.uuid = 'call-1';
  endpoint.played = [];
  endpoint.forkStarts = [];
  endpoint.forkStops = 0;
  endpoint.play = async (url) => { endpoint.played.push(url); };
  endpoint.api = async () => {};
  endpoint.forkAudioStart = async (options) => { endpoint.forkStarts.push(options); };
  endpoint.forkAudioStop = async () => { endpoint.forkStops++; };

  const dialog = new EventEmitter();
  dialog.destroyed = false;
  dialog.destroy = () => {
    if (dialog.destroyed) return;
    dialog.destroyed = true;
    dialog.emit('destroy');
  };

  const session = new EventEmitter();
  session.capture = [];
  session.forced = false;
  session.setCaptureEnabled = (enabled) => {
    session.capture.push(enabled);
    if (enabled && onCaptureEnabled) onCaptureEnabled(session);
  };
  session.forceFinalize = () => { session.forced = true; };
  session.waitForUtterance = waitForUtterance || (async () => {
    if (!utterances.length) throw new Error('timeout');
    const next = utterances.shift();
    if (next instanceof Error) throw next;
    return next;
  });

  const audioForkServer = {
    expectSession: async () => session,
    cancelExpectation: () => {},
    emit: () => {},
    buildForkUrl: (callUuid) => `ws://127.0.0.1:3001/${callUuid}?token=test-token`,
  };

  const whisperClient = {
    transcripts,
    async transcribe() {
      if (!this.transcripts.length) return 'goodbye';
      return this.transcripts.shift();
    },
  };

  const claudeBridge = {
    responses,
    queries: [],
    ended: null,
    async query(prompt, options) {
      this.queries.push({ prompt, options });
      if (!this.responses.length) return '🗣️ VOICE_RESPONSE: Okay.';
      return this.responses.shift();
    },
    async endSession(callId) { this.ended = callId; },
  };

  const ttsService = {
    texts: [],
    async generateSpeech(text) {
      this.texts.push(text);
      return `http://tts/${encodeURIComponent(text)}`;
    },
  };

  const options = {
    audioForkServer,
    whisperClient,
    claudeBridge,
    ttsService,
    wsPort: 3001,
    maxTurns: 10,
  };

  return { endpoint, dialog, session, audioForkServer, whisperClient, claudeBridge, ttsService, options };
}

test('greets, answers one turn, and ends on goodbye', async () => {
  const h = createHarness({
    utterances: [{ audio: Buffer.from('one') }, { audio: Buffer.from('two') }],
    transcripts: ['hello', 'goodbye'],
    responses: ['🗣️ VOICE_RESPONSE: Hi there.'],
  });

  await runConversationLoop(h.endpoint, h.dialog, 'call-1', h.options);

  assert.ok(h.ttsService.texts.includes("Hello! I'm your server. How can I help you today?"));
  assert.ok(h.ttsService.texts.includes('Hi there.'));
  assert.ok(h.ttsService.texts.includes('Goodbye! Call again anytime.'));
  assert.strictEqual(h.claudeBridge.queries.length, 1);
  assert.strictEqual(h.claudeBridge.ended, 'call-1');
  assert.strictEqual(h.endpoint.forkStarts.length, 1);
  assert.match(h.endpoint.forkStarts[0].wsUrl, /token=test-token/);
  assert.strictEqual(h.endpoint.forkStops, 1);
  assert.deepStrictEqual(h.session.capture.slice(0, 2), [true, false]);
});

test('prompts when no speech is detected, then handles goodbye', async () => {
  const h = createHarness({
    utterances: [new Error('timeout'), { audio: Buffer.from('two') }],
    transcripts: ['goodbye'],
  });

  await runConversationLoop(h.endpoint, h.dialog, 'call-1', h.options);

  assert.ok(h.ttsService.texts.includes("I didn't hear anything. Are you still there?"));
  assert.ok(h.ttsService.texts.includes('Goodbye! Call again anytime.'));
  assert.strictEqual(h.claudeBridge.queries.length, 0);
});

test('ends with a max-turns message', async () => {
  const h = createHarness({
    utterances: [{ audio: Buffer.from('one') }],
    transcripts: ['hello'],
    responses: ['🗣️ VOICE_RESPONSE: Hi.'],
  });
  h.options.maxTurns = 1;

  await runConversationLoop(h.endpoint, h.dialog, 'call-1', h.options);

  assert.ok(h.ttsService.texts.includes("We've been talking for a while. Goodbye!"));
  assert.strictEqual(h.claudeBridge.queries.length, 1);
  assert.strictEqual(h.claudeBridge.ended, 'call-1');
});

test('cleans up when the caller hangs up during speech detection', async () => {
  let waitStarted;
  const started = new Promise((resolve) => { waitStarted = resolve; });

  const h = createHarness({
    waitForUtterance: () => new Promise((resolve, reject) => {
      waitStarted();
      h._rejectUtterance = reject;
    }),
  });

  const run = runConversationLoop(h.endpoint, h.dialog, 'call-1', h.options);
  await started;

  h.dialog.destroy();
  h._rejectUtterance(new Error('call ended'));

  await run;

  assert.strictEqual(h.claudeBridge.ended, 'call-1');
  assert.strictEqual(h.endpoint.forkStops, 1);
});

test('DTMF # finalizes the current utterance', async () => {
  let resolveUtterance;
  let waitStarted;
  const started = new Promise((resolve) => { waitStarted = resolve; });

  const h = createHarness({
    transcripts: ['goodbye'],
    waitForUtterance: () => new Promise((resolve) => {
      resolveUtterance = resolve;
      waitStarted();
    }),
  });

  h.session.forceFinalize = () => {
    h.session.forced = true;
    resolveUtterance({ audio: Buffer.from('dtmf'), reason: 'dtmf_trigger' });
  };

  const run = runConversationLoop(h.endpoint, h.dialog, 'call-1', h.options);
  await started;

  h.endpoint.emit('dtmf', { digit: '#' });
  await run;

  assert.strictEqual(h.session.forced, true);
  assert.ok(h.ttsService.texts.includes('Goodbye! Call again anytime.'));
});

test('reports a provider failure and still cleans up', async () => {
  const h = createHarness({
    utterances: [{ audio: Buffer.from('one') }],
    transcripts: ['hello'],
    responses: ['Hi there.'],
  });

  const original = h.ttsService.generateSpeech.bind(h.ttsService);
  h.ttsService.generateSpeech = async (text, voiceId) => {
    if (text.startsWith('Hi there')) throw new Error('tts unavailable');
    return original(text, voiceId);
  };

  await runConversationLoop(h.endpoint, h.dialog, 'call-1', h.options);

  assert.ok(h.ttsService.texts.includes('Sorry, something went wrong.'));
  assert.strictEqual(h.claudeBridge.ended, 'call-1');
  assert.strictEqual(h.endpoint.forkStops, 1);
});
