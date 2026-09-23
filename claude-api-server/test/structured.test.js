/**
 * Tests for structured.js JSON extraction & validation helpers.
 * Run with: node --test test/structured.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const {
  tryParseJsonFromText,
  validateRequiredFields,
  buildQueryContext,
  buildStructuredPrompt,
  buildRepairPrompt,
} = require('../structured');

test('tryParseJsonFromText parses a plain JSON object', () => {
  const r = tryParseJsonFromText('{"a":1,"b":"two"}');
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.data, { a: 1, b: 'two' });
});

test('tryParseJsonFromText extracts JSON from prose', () => {
  const r = tryParseJsonFromText('Here is the result: {"status":"ok","n":3} done');
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.data, { status: 'ok', n: 3 });
});

test('tryParseJsonFromText extracts JSON from a ```json fence', () => {
  const r = tryParseJsonFromText('Some prose\n```json\n{"x":1}\n```\nmore');
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.data, { x: 1 });
});

test('tryParseJsonFromText handles escaped quotes inside strings', () => {
  // The string value is: x"}   (escaped quote, then a brace inside the string)
  const text = '{"a":"x\\"}","b":2}';
  assert.doesNotThrow(() => JSON.parse(text), 'sanity: text is valid JSON');
  const r = tryParseJsonFromText(text);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.data, { a: 'x"}', b: 2 });
});

test('tryParseJsonFromText handles escaped backslash before quote', () => {
  // String value is a single backslash followed by a quote char: \"
  const text = '{"a":"\\\\\\"","b":2}';
  assert.doesNotThrow(() => JSON.parse(text), 'sanity: text is valid JSON');
  const r = tryParseJsonFromText(text);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.data, { a: '\\"', b: 2 });
});

test('tryParseJsonFromText handles braces inside strings', () => {
  const text = '{"msg":"open { and close } then [brackets]","ok":true}';
  const r = tryParseJsonFromText(text);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.data, { msg: 'open { and close } then [brackets]', ok: true });
});

test('tryParseJsonFromText returns failure on non-JSON', () => {
  const r = tryParseJsonFromText('just plain text, no json here');
  assert.strictEqual(r.ok, false);
});

test('tryParseJsonFromText strips BOM', () => {
  const r = tryParseJsonFromText('\uFEFF{"a":1}');
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.data, { a: 1 });
});

test('validateRequiredFields passes when all present', () => {
  const r = validateRequiredFields({ a: 1, b: 2 }, ['a', 'b']);
  assert.strictEqual(r.ok, true);
});

test('validateRequiredFields reports missing fields', () => {
  const r = validateRequiredFields({ a: 1 }, ['a', 'b', 'c']);
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.missing, ['b', 'c']);
});

test('validateRequiredFields supports dotted paths', () => {
  const r = validateRequiredFields({ outer: { inner: 5 } }, ['outer.inner']);
  assert.strictEqual(r.ok, true);
});

test('validateRequiredFields rejects non-object data', () => {
  const r = validateRequiredFields([1, 2, 3], ['a']);
  assert.strictEqual(r.ok, false);
});

test('buildQueryContext includes required fields and guidance', () => {
  const ctx = buildQueryContext({
    queryType: 'weather',
    requiredFields: ['temp', 'cond'],
    fieldGuidance: { temp: 'integer celsius' },
    allowExtraFields: false,
  });
  assert.ok(ctx.includes('weather'));
  assert.ok(ctx.includes('"temp"'));
  assert.ok(ctx.includes('integer celsius'));
  assert.ok(ctx.includes('Do not include extra fields'));
});

test('buildStructuredPrompt layers device prompt + context + user prompt', () => {
  const p = buildStructuredPrompt({
    devicePrompt: 'You are NAS',
    queryContext: '[CTX]\n',
    userPrompt: 'check disk',
  });
  assert.ok(p.includes('[DEVICE IDENTITY]'));
  assert.ok(p.includes('You are NAS'));
  assert.ok(p.includes('[CTX]'));
  assert.ok(p.includes('check disk'));
});

test('buildRepairPrompt includes original and invalid output', () => {
  const p = buildRepairPrompt({
    requiredFields: ['x'],
    originalUserPrompt: 'do thing',
    invalidAssistantOutput: 'not json',
  });
  assert.ok(p.includes('REPAIR TASK'));
  assert.ok(p.includes('do thing'));
  assert.ok(p.includes('not json'));
});
