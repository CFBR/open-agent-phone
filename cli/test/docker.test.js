import { test } from 'node:test';
import assert from 'node:assert';
import { generateDockerCompose, generateEnvFile, parseComposePsOutput, parseDockerPsOutput } from '../lib/docker.js';

test('docker compose generation', async (t) => {
  await t.test('generates compose with default port 5060 when no drachtioPort specified', () => {
    const config = {
      server: {
        externalIp: '192.168.1.50',
        httpPort: 3000,
        claudeApiPort: 3333
      },
      paths: {
        voiceApp: '/app/voice-app'
      },
      secrets: {
        drachtio: 'test-secret-123',
        freeswitch: 'test-secret-456'
      }
    };

    const compose = generateDockerCompose(config);

    // Should use default port 5060 in drachtio command
    assert.ok(compose.includes('--contact "sip:*:5060;transport=tcp,udp"'),
      'Should use port 5060 by default');
  });

  await t.test('generates compose with port 5070 when drachtioPort is 5070', () => {
    const config = {
      server: {
        externalIp: '192.168.1.50',
        httpPort: 3000,
        claudeApiPort: 3333
      },
      paths: {
        voiceApp: '/app/voice-app'
      },
      secrets: {
        drachtio: 'test-secret-123',
        freeswitch: 'test-secret-456'
      },
      deployment: {
        pi: {
          drachtioPort: 5070
        }
      }
    };

    const compose = generateDockerCompose(config);

    // Should use port 5070 when specified in config
    assert.ok(compose.includes('--contact "sip:*:5070;transport=tcp,udp"'),
      'Should use port 5070 when Pi config specifies it');
  });

  await t.test('generates compose with port 5060 when drachtioPort explicitly set to 5060', () => {
    const config = {
      server: {
        externalIp: '192.168.1.50',
        httpPort: 3000,
        claudeApiPort: 3333
      },
      paths: {
        voiceApp: '/app/voice-app'
      },
      secrets: {
        drachtio: 'test-secret-123',
        freeswitch: 'test-secret-456'
      },
      deployment: {
        pi: {
          drachtioPort: 5060
        }
      }
    };

    const compose = generateDockerCompose(config);

    assert.ok(compose.includes('--contact "sip:*:5060;transport=tcp,udp"'),
      'Should use port 5060 when explicitly specified');
  });

  await t.test('preserves other compose settings when using custom port', () => {
    const config = {
      server: {
        externalIp: '192.168.1.50',
        httpPort: 3000,
        claudeApiPort: 3333
      },
      paths: {
        voiceApp: '/app/voice-app'
      },
      secrets: {
        drachtio: 'test-secret-123',
        freeswitch: 'test-secret-456'
      },
      deployment: {
        pi: {
          drachtioPort: 5070
        }
      }
    };

    const compose = generateDockerCompose(config);

    // Verify other settings remain intact
    assert.ok(compose.includes('network_mode: host'), 'Should use host networking');
    assert.ok(compose.includes('--sip-port 5080'), 'FreeSWITCH should use port 5080');
    assert.ok(compose.includes('--port 9022'), 'Drachtio should use port 9022');
    assert.ok(compose.includes('EXTERNAL_IP=192.168.1.50'), 'Should use configured external IP');
  });

  await t.test('generates env file with Mac API URL for pi-split mode', () => {
    const config = {
      server: {
        externalIp: '192.168.1.50',
        httpPort: 3000,
        claudeApiPort: 3333
      },
      sip: {
        domain: '3cx.local',
        registrar: '192.168.1.10'
      },
      devices: [
        {
          extension: '9000',
          authId: 'user123',
          password: 'pass123',
          voiceId: 'voice-id'
        }
      ],
      api: {
        elevenlabs: { apiKey: 'elev-key' },
        openrouter: { apiKey: 'openrouter-key' }
      },
      secrets: {
        drachtio: 'drachtio-secret',
        freeswitch: 'fs-secret'
      },
      deployment: {
        mode: 'pi-split',
        pi: {
          macIp: '192.168.1.100'
        }
      }
    };

    const envFile = generateEnvFile(config);

    // Should use Mac API URL instead of localhost
    assert.ok(envFile.includes('CLAUDE_API_URL=http://192.168.1.100:3333'),
      'Should use Mac API URL for pi-split mode');
    assert.ok(!envFile.includes('CLAUDE_API_URL=http://localhost:'),
      'Should not use localhost for pi-split mode');
  });

  await t.test('generates env file with localhost for standard mode', () => {
    const config = {
      server: {
        externalIp: '192.168.1.50',
        httpPort: 3000,
        claudeApiPort: 3333
      },
      sip: {
        domain: '3cx.local',
        registrar: '192.168.1.10'
      },
      devices: [
        {
          extension: '9000',
          authId: 'user123',
          password: 'pass123',
          voiceId: 'voice-id'
        }
      ],
      api: {
        elevenlabs: { apiKey: 'elev-key' },
        openrouter: { apiKey: 'openrouter-key' }
      },
      secrets: {
        drachtio: 'drachtio-secret',
        freeswitch: 'fs-secret'
      },
      deployment: {
        mode: 'standard'
      }
    };

    const envFile = generateEnvFile(config);

    // Should use localhost for standard mode
    assert.ok(envFile.includes('CLAUDE_API_URL=http://localhost:3333'),
      'Should use localhost for standard mode');
  });

  await t.test('generates env file with localhost for both mode (all-in-one)', () => {
    const config = {
      server: {
        externalIp: '192.168.1.50',
        httpPort: 3000,
        claudeApiPort: 3333
      },
      sip: {
        domain: '3cx.local',
        registrar: '192.168.1.10'
      },
      devices: [
        {
          extension: '9000',
          authId: 'user123',
          password: 'pass123',
          voiceId: 'voice-id'
        }
      ],
      api: {
        elevenlabs: { apiKey: 'elev-key' },
        openrouter: { apiKey: 'openrouter-key' }
      },
      secrets: {
        drachtio: 'drachtio-secret',
        freeswitch: 'fs-secret'
      },
      deployment: {
        mode: 'both'
      }
    };

    const envFile = generateEnvFile(config);

    // Should use localhost for both mode (all services on same machine)
    assert.ok(envFile.includes('CLAUDE_API_URL=http://localhost:3333'),
      'Should use localhost for both mode (all-in-one installation)');

    // Should NOT use any remote IP
    assert.ok(!envFile.includes('CLAUDE_API_URL=http://192.168.'),
      'Should not use remote IP for both mode');
  });

  await t.test('generates env file with remote API for voice-server mode', () => {
    const config = {
      server: {
        externalIp: '192.168.1.50',
        httpPort: 3000,
        claudeApiPort: 3333
      },
      sip: {
        domain: '3cx.local',
        registrar: '192.168.1.10'
      },
      devices: [
        {
          extension: '9000',
          authId: 'user123',
          password: 'pass123',
          voiceId: 'voice-id'
        }
      ],
      api: {
        elevenlabs: { apiKey: 'elev-key' },
        openrouter: { apiKey: 'openrouter-key' }
      },
      secrets: {
        drachtio: 'drachtio-secret',
        freeswitch: 'fs-secret'
      },
      deployment: {
        mode: 'voice-server',
        apiServerIp: '192.168.1.200'
      }
    };

    const envFile = generateEnvFile(config);

    // Voice server mode should use the remote API server IP, not localhost
    assert.ok(envFile.includes('CLAUDE_API_URL=http://192.168.1.200:3333'),
      'voice-server mode should use remote apiServerIp');

    assert.ok(!envFile.includes('CLAUDE_API_URL=http://localhost:'),
      'voice-server mode should NOT use localhost when apiServerIp is set');
  });

  await t.test('includes optional Kokoro and local STT services from provider config', () => {
    const config = {
      server: {
        externalIp: '192.168.1.50',
        httpPort: 3000,
        claudeApiPort: 3333
      },
      sip: {
        domain: '3cx.local',
        registrar: '192.168.1.10'
      },
      devices: [],
      api: {
        ttsProvider: 'kokoro',
        sttProvider: 'local',
        whisperModel: 'Systran/faster-whisper-base'
      },
      paths: {
        voiceApp: '/app/voice-app'
      },
      secrets: {
        drachtio: 'drachtio-secret',
        freeswitch: 'fs-secret'
      },
      deployment: { mode: 'both' }
    };

    const compose = generateDockerCompose(config);
    assert.ok(compose.includes('kokoro-tts'), 'should include Kokoro when ttsProvider is kokoro');
    assert.ok(compose.includes('faster-whisper'), 'should include local STT when sttProvider is local');
    assert.ok(compose.includes('speaches'), 'should use the pinned Speaches image');
    assert.ok(compose.includes('whisper-data:'), 'should declare the whisper cache volume');

    const envFile = generateEnvFile(config);
    assert.ok(envFile.includes('STT_PROVIDER=local'), 'should write STT_PROVIDER=local');
    assert.ok(envFile.includes('WHISPER_MODEL=Systran/faster-whisper-base'), 'should write the Whisper model');
  });

  await t.test('parses compose ps JSON lines', () => {
    const output = [
      '{"Name":"drachtio","State":"running","Service":"drachtio"}',
      '{"Name":"voice-app","State":"running","Service":"voice-app"}'
    ].join('\n');

    assert.deepStrictEqual(parseComposePsOutput(output), [
      { name: 'drachtio', status: 'running' },
      { name: 'voice-app', status: 'running' }
    ]);
  });

  await t.test('parses compose ps JSON arrays', () => {
    const output = JSON.stringify([
      { Name: 'freeswitch', State: 'running' },
      { Service: 'kokoro-tts', Status: 'exited' }
    ]);

    assert.deepStrictEqual(parseComposePsOutput(output), [
      { name: 'freeswitch', status: 'running' },
      { name: 'kokoro-tts', status: 'exited' }
    ]);
  });

  await t.test('parses and filters docker ps fallback output', () => {
    const output = [
      'voice-app\tUp 2 hours',
      'drachtio\tUp 2 hours',
      'unrelated\tUp 10 minutes',
      'faster-whisper\tExited (0) 5 minutes ago'
    ].join('\n');

    assert.deepStrictEqual(parseDockerPsOutput(output), [
      { name: 'voice-app', status: 'Up 2 hours' },
      { name: 'drachtio', status: 'Up 2 hours' },
      { name: 'faster-whisper', status: 'Exited (0) 5 minutes ago' }
    ]);
  });

  await t.test('returns empty arrays for empty status output', () => {
    assert.deepStrictEqual(parseComposePsOutput(''), []);
    assert.deepStrictEqual(parseDockerPsOutput(''), []);
  });

  await t.test('writes OpenAI-compatible TTS settings and skips Kokoro', () => {
    const config = {
      server: {
        externalIp: '192.168.1.50',
        httpPort: 3000,
        claudeApiPort: 3333
      },
      sip: {
        domain: '3cx.local',
        registrar: '192.168.1.10'
      },
      devices: [],
      api: {
        ttsProvider: 'openrouter',
        ttsBaseUrl: 'https://openrouter.ai/api/v1',
        ttsApiKey: 'tts-key',
        ttsModel: 'tts-model',
        ttsVoice: 'alloy',
        ttsFormat: 'mp3'
      },
      paths: {
        voiceApp: '/app/voice-app'
      },
      secrets: {
        drachtio: 'drachtio-secret',
        freeswitch: 'fs-secret'
      },
      deployment: { mode: 'both' }
    };

    const envFile = generateEnvFile(config);
    assert.ok(envFile.includes('TTS_PROVIDER=openrouter'));
    assert.ok(envFile.includes('TTS_BASE_URL=https://openrouter.ai/api/v1'));
    assert.ok(envFile.includes('TTS_API_KEY=tts-key'));
    assert.ok(envFile.includes('TTS_MODEL=tts-model'));
    assert.ok(envFile.includes('TTS_VOICE=alloy'));
    assert.ok(envFile.includes('TTS_FORMAT=mp3'));

    const compose = generateDockerCompose(config);
    assert.ok(!compose.includes('kokoro-tts'), 'should not include Kokoro for a cloud TTS provider');
  });

  await t.test('writes OpenCode AI backend settings and AI aliases', () => {
    const config = {
      server: {
        externalIp: '192.168.1.50',
        httpPort: 3000,
        claudeApiPort: 3333,
        claudeApiToken: 'shared-token'
      },
      sip: {
        domain: '3cx.local',
        registrar: '192.168.1.10'
      },
      devices: [],
      api: {
        ttsProvider: 'elevenlabs',
        aiBackend: 'opencode',
        opencodeModel: 'opencode-go/deepseek-v4.1-flash',
        opencodeAutoApprove: true
      },
      paths: {
        voiceApp: '/app/voice-app'
      },
      secrets: {
        drachtio: 'drachtio-secret',
        freeswitch: 'fs-secret'
      },
      deployment: { mode: 'both' }
    };

    const envFile = generateEnvFile(config);
    assert.ok(envFile.includes('AI_BACKEND=opencode'));
    assert.ok(envFile.includes('OPENCODE_MODEL=opencode-go/deepseek-v4.1-flash'));
    assert.ok(envFile.includes('OPENCODE_AUTO_APPROVE=1'));
    assert.ok(envFile.includes('AI_API_TOKEN=shared-token'));
    assert.ok(envFile.includes('AI_API_URL=http://localhost:3333'));
    assert.ok(envFile.includes('CLAUDE_API_TOKEN=shared-token'));
  });
});
