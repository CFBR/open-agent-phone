/**
 * Tests for conversation-loop.js helper functions (pure, no FreeSWITCH needed).
 * Run with: node --test test/conversation-loop.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const {
  extractVoiceLine,
  isGoodbye,
  getRandomThinkingPhrase,
  formatContextBlock,
} = require('../lib/conversation-loop');

test('isGoodbye detects goodbye phrases', () => {
  assert.strictEqual(isGoodbye('goodbye'), true);
  assert.strictEqual(isGoodbye('okay goodbye now'), true);
  assert.strictEqual(isGoodbye('hang up please'), true);
  assert.strictEqual(isGoodbye('that is all'), false); // not exact phrase match
  assert.strictEqual(isGoodbye("that's all"), true);
  assert.strictEqual(isGoodbye('hello there'), false);
});

test('getRandomThinkingPhrase returns a known phrase', () => {
  const phrase = getRandomThinkingPhrase();
  assert.ok(typeof phrase === 'string' && phrase.length > 0);
});

test('extractVoiceLine prefers VOICE_RESPONSE line', () => {
  const r = extractVoiceLine('🗣️ VOICE_RESPONSE: Hello there friend!\n🎯 COMPLETED: done');
  assert.strictEqual(r, 'Hello there friend!');
});

test('extractVoiceLine falls back to COMPLETED when VOICE_RESPONSE missing', () => {
  const r = extractVoiceLine('🎯 COMPLETED: task finished');
  assert.strictEqual(r, 'task finished');
});

test('extractVoiceLine falls back to first sentence', () => {
  const r = extractVoiceLine('This is a long response. With more sentences.');
  assert.strictEqual(r, 'This is a long response');
});

test('extractVoiceLine strips markdown from VOICE_RESPONSE', () => {
  const r = extractVoiceLine('🗣️ VOICE_RESPONSE: **bold** and [link](http://x) here');
  assert.strictEqual(r, 'bold and link here');
});

test('formatContextBlock returns empty string for no context', () => {
  assert.strictEqual(formatContextBlock(null), '');
  assert.strictEqual(formatContextBlock(''), '');
  assert.strictEqual(formatContextBlock('   '), '');
});

test('formatContextBlock formats string context', () => {
  const block = formatContextBlock('server is hot');
  assert.ok(block.includes('BACKGROUND CONTEXT'));
  assert.ok(block.includes('server is hot'));
});

test('formatContextBlock formats object context', () => {
  const block = formatContextBlock({ host: 'nas1', temp: 55 });
  assert.ok(block.includes('host: nas1'));
  assert.ok(block.includes('temp: 55'));
});

test('formatContextBlock formats nested object values as JSON', () => {
  const block = formatContextBlock({ stats: { cpu: 99 } });
  assert.ok(block.includes('stats: {"cpu":99}'));
});
