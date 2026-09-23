/**
 * Tests for http-server.cleanupOldFiles (the single audio-file cleanup path).
 * Run with: node --test test/cleanup.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { cleanupOldFiles, FILE_MAX_AGE } = require('../lib/audio-cleanup');

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oap-cleanup-'));
  return dir;
}

test('cleanupOldFiles deletes files older than maxAge', async function () {
  const dir = makeTempDir();
  try {
    const oldFile = path.join(dir, 'tts-old.mp3');
    const newFile = path.join(dir, 'tts-new.mp3');
    fs.writeFileSync(oldFile, 'x');
    fs.writeFileSync(newFile, 'y');

    // Backdate the old file's mtime by 2x FILE_MAX_AGE
    const backdate = Date.now() - (FILE_MAX_AGE * 2 + 1000);
    fs.utimesSync(oldFile, backdate / 1000, backdate / 1000);

    await cleanupOldFiles(dir, FILE_MAX_AGE);

    assert.ok(!fs.existsSync(oldFile), 'old file should be deleted');
    assert.ok(fs.existsSync(newFile), 'recent file should remain');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('cleanupOldFiles deletes uploaded audio_* files too', async function () {
  const dir = makeTempDir();
  try {
    const uploaded = path.join(dir, 'audio_123.wav');
    fs.writeFileSync(uploaded, 'x');
    const backdate = Date.now() - (FILE_MAX_AGE * 2 + 1000);
    fs.utimesSync(uploaded, backdate / 1000, backdate / 1000);

    await cleanupOldFiles(dir, FILE_MAX_AGE);
    assert.ok(!fs.existsSync(uploaded), 'uploaded audio file should be deleted');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('cleanupOldFiles does not throw on missing directory', async function () {
  await cleanupOldFiles(path.join(os.tmpdir(), 'does-not-exist-oap'), FILE_MAX_AGE);
});
