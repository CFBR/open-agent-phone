import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import { fileURLToPath } from 'url';

// Import the function we need to test
import { getProjectRoot } from '../lib/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('path resolution', async (t) => {
  await t.test('getProjectRoot returns project root regardless of cwd', () => {
    // The project root should be one level up from cli/
    // cli/test/path-resolution.test.js -> ../../../ = project root
    const expectedRoot = path.resolve(__dirname, '..', '..');
    const projectRoot = getProjectRoot();

    assert.strictEqual(projectRoot, expectedRoot,
      `Expected project root to be ${expectedRoot}, got ${projectRoot}`);
  });

  await t.test('getProjectRoot finds voice-app directory', () => {
    const projectRoot = getProjectRoot();
    const voiceAppPath = path.join(projectRoot, 'voice-app');

    // The path should NOT contain /cli/voice-app
    assert.ok(!voiceAppPath.includes('/cli/voice-app'),
      `Path should not include /cli/voice-app: ${voiceAppPath}`);
  });

  await t.test('getProjectRoot finds claude-api-server directory', () => {
    const projectRoot = getProjectRoot();
    const apiServerPath = path.join(projectRoot, 'claude-api-server');

    // The path should NOT contain /cli/claude-api-server
    assert.ok(!apiServerPath.includes('/cli/claude-api-server'),
      `Path should not include /cli/claude-api-server: ${apiServerPath}`);
  });
});
