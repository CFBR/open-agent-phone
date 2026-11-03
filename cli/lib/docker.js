import { spawn, execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import {
  getDockerComposePath,
  getEnvPath,
  getConfigDir
} from './config.js';

/**
 * Detect which docker compose command to use
 * Some systems have 'docker compose' (plugin), others have 'docker-compose' (standalone)
 * @returns {{cmd: string, args: string[]}} Command and base args for compose
 */
function getComposeCommand() {
  // Try 'docker compose' (plugin) first
  try {
    execSync('docker compose version', { stdio: 'pipe' });
    return { cmd: 'docker', args: ['compose'] };
  } catch (e) {
    // Fall back to standalone docker-compose
    try {
      execSync('docker-compose --version', { stdio: 'pipe' });
      return { cmd: 'docker-compose', args: [] };
    } catch (e2) {
      // Default to plugin style, let it fail with helpful error
      return { cmd: 'docker', args: ['compose'] };
    }
  }
}

/**
 * Generate a random secret for Docker services
 * @returns {string} Random 32-character hex string
 */
function generateSecret() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Check if Docker is installed and running
 * @returns {Promise<{installed: boolean, running: boolean, error?: string}>}
 */
export async function checkDocker() {
  // Check if docker command exists
  const installed = await new Promise((resolve) => {
    const check = spawn('docker', ['--version']);
    check.on('close', (code) => resolve(code === 0));
    check.on('error', () => resolve(false));
  });

  if (!installed) {
    return {
      installed: false,
      running: false,
      error: 'Docker not found. Please install Docker from https://docs.docker.com/engine/install/'
    };
  }

  // Check if Docker daemon is running by running a simple command
  const running = await new Promise((resolve) => {
    const check = spawn('docker', ['ps', '-q'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    check.on('close', (code) => resolve(code === 0));
    check.on('error', () => resolve(false));
  });

  if (!running) {
    return {
      installed: true,
      running: false,
      error: 'Docker is installed but not running. Please start Docker Desktop.'
    };
  }

  return {
    installed: true,
    running: true
  };
}

/**
 * Generate docker-compose.yml from config
 * @param {object} config - Configuration object
 * @returns {string} Docker compose YAML content
 */
export function generateDockerCompose(config) {
  const externalIp = config.server.externalIp === 'auto' ? '${EXTERNAL_IP}' : config.server.externalIp;

  // Ensure secrets exist in config
  if (!config.secrets) {
    config.secrets = {
      drachtio: generateSecret(),
      freeswitch: generateSecret()
    };
  }

  // Determine drachtio port from config (5070 when 3CX SBC detected, 5060 otherwise)
  const drachtioPort = config.deployment && config.deployment.pi && config.deployment.pi.drachtioPort
    ? config.deployment.pi.drachtioPort
    : 5060;

  // Determine if running on Pi (ARM64) - use specific versions with platform
  const isPiMode = config.deployment && config.deployment.mode === 'pi-split';
  const ttsProvider = config.api?.ttsProvider || config.ttsProvider || 'elevenlabs';
  const sttProvider = config.api?.sttProvider || config.sttProvider || 'openrouter';
  const drachtioImage = isPiMode ? 'drachtio/drachtio-server:0.9.4' : 'drachtio/drachtio-server:latest';
  const freeswitchImage = 'drachtio/drachtio-freeswitch-mrf:0.9.4';
  const platformLine = isPiMode ? '\n    platform: linux/arm64' : '';

  return `# CRITICAL: All containers must use network_mode: host
# Docker bridge networking causes FreeSWITCH to advertise internal IPs
# in SDP, making RTP unreachable from external callers.

services:
  drachtio:
    image: ${drachtioImage}${platformLine}
    container_name: drachtio
    restart: unless-stopped
    network_mode: host
    command: >
      drachtio
      --contact "sip:*:${drachtioPort};transport=tcp,udp"
      --secret \${DRACHTIO_SECRET}
      --port 9022
      --loglevel info

  freeswitch:
    image: ${freeswitchImage}${platformLine}
    container_name: freeswitch
    restart: unless-stopped
    network_mode: host
    command: >
      freeswitch
      --sip-port 5080
      --rtp-range-start 30000
      --rtp-range-end 30100
    # RTP ports 30000-30100 avoid conflict with 3CX SBC (uses 20000-20099)
    environment:
      - EXTERNAL_IP=${externalIp}

  voice-app:
    build: ${config.paths.voiceApp}
    container_name: voice-app
    restart: unless-stopped
    network_mode: host
    env_file:
      - ${getEnvPath()}
    volumes:
      - ${config.paths.voiceApp}/audio:/app/audio
      - ${config.paths.voiceApp}/config:/app/config
    depends_on:
      - drachtio
      - freeswitch

  # Local TTS engine (Kokoro-82M via Kokoro-FastAPI) - Only included when TTS_PROVIDER=kokoro
  ${ttsProvider === 'kokoro' ? `
  kokoro-tts:
    image: ghcr.io/remsky/kokoro-fastapi-cpu:latest${platformLine}
    container_name: kokoro-tts
    restart: unless-stopped
    network_mode: host
    # Port 8880: HTTP API for OpenAI-compatible /v1/audio/speech
  ` : ''}

  # Local STT engine (faster-whisper via Speaches) - Only included when STT_PROVIDER=local
  ${sttProvider === 'local' ? `
  faster-whisper:
    image: ghcr.io/speaches-ai/speaches@sha256:21e3df06d842fb7802ab470dd77c25f0e8c0d22950e8d8c6ae886e851af53ef8${platformLine}
    container_name: faster-whisper
    restart: unless-stopped
    network_mode: host
    environment:
      UVICORN_HOST: 127.0.0.1
      UVICORN_PORT: 7000
      WHISPER__MODEL: ${config.api?.whisperModel || 'Systran/faster-whisper-base'}
    volumes:
      - whisper-data:/home/ubuntu/.cache/huggingface
    # Port 7000: HTTP API for OpenAI-compatible /v1/audio/transcriptions
  ` : ''}
${sttProvider === 'local' ? `
volumes:
  whisper-data:
` : ''}
`;
}

/**
 * Generate .env file from config
 * @param {object} config - Configuration object
 * @returns {string} Environment file content
 */
export function generateEnvFile(config) {
  // Ensure secrets exist in config
  if (!config.secrets) {
    config.secrets = {
      drachtio: generateSecret(),
      freeswitch: generateSecret()
    };
  }

  // Determine Claude API URL based on deployment mode
  let claudeApiUrl;
  if (config.deployment && config.deployment.mode === 'pi-split' && config.deployment.pi && config.deployment.pi.macIp) {
    // Pi mode: point to remote API server
    claudeApiUrl = `http://${config.deployment.pi.macIp}:${config.server.claudeApiPort}`;
  } else if (config.deployment && config.deployment.mode === 'voice-server' && config.deployment.apiServerIp) {
    // Voice server mode (non-Pi): point to remote API server
    claudeApiUrl = `http://${config.deployment.apiServerIp}:${config.server.claudeApiPort}`;
  } else {
    // Both or api-server mode: local API server
    claudeApiUrl = `http://localhost:${config.server.claudeApiPort}`;
  }

  // Determine which device is the primary one for the generated env file.
  const primaryDevice = (config.devices || [])[0] || null;

  const lines = [
    '# ====================================',
    '# WARNING: DO NOT SHARE THIS FILE',
    '# Contains API keys and passwords',
    '# ====================================',
    '# Open Agent Phone Configuration',
    '# Generated by claude-phone CLI',
    '# ====================================',
    '',
    '# Network Configuration',
    `EXTERNAL_IP=${config.server.externalIp === 'auto' ? 'auto' : config.server.externalIp}`,
    '',
    '# Drachtio Configuration',
    'DRACHTIO_HOST=127.0.0.1',
    'DRACHTIO_PORT=9022',
    `DRACHTIO_SECRET=${config.secrets?.drachtio || ''}`,
    // SIP port for Contact header (5070 when 3CX SBC is present, 5060 otherwise)
    `DRACHTIO_SIP_PORT=${config.deployment?.pi?.drachtioPort || 5060}`,
    '',
    '# FreeSWITCH Configuration',
    'FREESWITCH_HOST=127.0.0.1',
    'FREESWITCH_PORT=8021',
    // Default ESL password for drachtio/drachtio-freeswitch-mrf
    'FREESWITCH_SECRET=JambonzR0ck$',
    '',
    '# 3CX / SIP Configuration',
    `SIP_DOMAIN=${config.sip.domain}`,
    `SIP_REGISTRAR=${config.sip.registrar}`,
    `DEFAULT_CALLER_ID=${config.sip.callerId || ''}`,
    `SIP_TRUNK_HOST=${config.sip.trunkHost || ''}`,
    '',
    // Device-specific SIP settings (only if devices configured)
    ...(primaryDevice ? [
      '# Default extension (primary device)',
      `SIP_EXTENSION=${primaryDevice.extension}`,
      `SIP_AUTH_ID=${primaryDevice.authId || ''}`,
      `SIP_AUTH_PASSWORD=${primaryDevice.password || ''}`,
      '',
      '# ElevenLabs TTS',
      `ELEVENLABS_API_KEY=${config.api?.elevenlabs?.apiKey || ''}`,
      `ELEVENLABS_VOICE_ID=${primaryDevice.elevenlabsVoiceId || primaryDevice.voiceId || ''}`,
      '',
    ] : [
      '# ElevenLabs TTS',
      `ELEVENLABS_API_KEY=${config.api?.elevenlabs?.apiKey || ''}`,
      'ELEVENLABS_VOICE_ID=',
      '',
    ]),
    '# Claude API Server',
    `CLAUDE_API_URL=${claudeApiUrl}`,
    `CLAUDE_API_TOKEN=${config.server.claudeApiToken || ''}`,
    '',
    '# OpenRouter (Whisper STT)',
    `OPENROUTER_API_KEY=${config.api?.openrouter?.apiKey || ''}`,
    '',
    '# TTS Provider (elevenlabs or kokoro)',
    `TTS_PROVIDER=${config.api?.ttsProvider || 'elevenlabs'}`,
    '# Kokoro TTS URL (only used when TTS_PROVIDER=kokoro)',
    `KOKORO_TTS_URL=${config.api?.kokoroUrl || 'http://127.0.0.1:8880'}`,
    '# Local Whisper URL (only used when STT_PROVIDER=local)',
    `LOCAL_WHISPER_URL=${config.api?.localWhisperUrl || 'http://127.0.0.1:7000'}`,
    '',
    '# AI Backend Configuration',
    `AI_BACKEND=${config.api?.aiBackend || 'ollama'}`,
    `OLLAMA_URL=${config.api?.ollamaUrl || 'http://127.0.0.1:11434'}`,
    `OLLAMA_MODEL=${config.api?.ollamaModel || 'llama3.2:3b'}`,
    `OPENAI_API_KEY=${config.api?.openai?.apiKey || ''}`,
    `OPENAI_MODEL=${config.api?.openai?.model || 'gpt-4o-mini'}`,
    `OPENROUTER_MODEL=${config.api?.openrouterModel || 'openai/gpt-4o-mini'}`,
    `AI_BACKEND_URL=${config.api?.customAiUrl || ''}`,
    `AI_API_KEY=${config.api?.customAiKey || ''}`,
    `AI_MODEL=${config.api?.customAiModel || ''}`,
    '',
    '# STT Provider Configuration',
    `STT_PROVIDER=${config.api?.sttProvider || 'openrouter'}`,
    `CUSTOM_STT_URL=${config.api?.customSttUrl || ''}`,
    `WHISPER_MODEL=${config.api?.whisperModel || 'Systran/faster-whisper-base'}`,
    '',
    '# Application Settings',
    `HTTP_PORT=${config.server.httpPort}`,
    'WS_PORT=3001',
    'AUDIO_DIR=/app/audio',
    `RECOVERY_TIMEOUT_MS=${config.api?.recoveryTimeoutMs || 300000}`,
    `AUDIO_FORK_SECRET=${config.api?.audioForkSecret || ''}`,
    `AUDIO_FORK_TOKEN_TTL_MS=${config.api?.audioForkTokenTtlMs || 60000}`,
    '',
    '# Outbound Call Settings',
    `MAX_CONVERSATION_TURNS=${config.api?.maxConversationTurns || 20}`,
    `OUTBOUND_RING_TIMEOUT=${config.api?.outboundRingTimeout || 30}`,
    ''
  ];

  return lines.join('\n');
}

/**
 * Write Docker configuration files
 * @param {object} config - Configuration object
 * @returns {Promise<void>}
 */
export async function writeDockerConfig(config) {
  const dockerComposePath = getDockerComposePath();
  const envPath = getEnvPath();

  const dockerComposeContent = generateDockerCompose(config);
  const envContent = generateEnvFile(config);

  await fs.promises.writeFile(dockerComposePath, dockerComposeContent, { mode: 0o644 });
  await fs.promises.writeFile(envPath, envContent, { mode: 0o600 });
}

/**
 * Start Docker containers
 * @returns {Promise<void>}
 */
export async function startContainers() {
  const configDir = getConfigDir();
  const dockerComposePath = getDockerComposePath();

  if (!fs.existsSync(dockerComposePath)) {
    throw new Error('Docker configuration not found. Run "claude-phone setup" first.');
  }

  const compose = getComposeCommand();
  const composeArgs = [...compose.args, '-f', dockerComposePath, 'up', '-d'];

  return new Promise((resolve, reject) => {
    const child = spawn(compose.cmd, composeArgs, {
      cwd: configDir,
      stdio: 'pipe'
    });

    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        // AC22: Detect ARM64 image pull failure
        if (output.includes('no matching manifest') ||
            output.includes('image with reference') && output.includes('arm64')) {
          const error = new Error(
            'ARM64 Docker image pull failed.\n\n' +
            'Try manually pulling images:\n' +
            '  docker pull drachtio/drachtio-server:latest\n' +
            '  docker pull drachtio/drachtio-freeswitch-mrf:0.9.4\n' +
            'If images are not available for ARM64, you may need to build them locally.'
          );
          reject(error);
        } else {
          reject(new Error(`Docker compose failed (exit ${code}): ${output}`));
        }
      }
    });
  });
}

/**
 * Stop Docker containers
 * @returns {Promise<void>}
 */
export async function stopContainers() {
  const configDir = getConfigDir();
  const dockerComposePath = getDockerComposePath();

  if (!fs.existsSync(dockerComposePath)) {
    // No containers to stop
    return;
  }

  const compose = getComposeCommand();
  const composeArgs = [...compose.args, '-f', dockerComposePath, 'down'];

  return new Promise((resolve, reject) => {
    const child = spawn(compose.cmd, composeArgs, {
      cwd: configDir,
      stdio: 'pipe'
    });

    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Docker compose down failed (exit ${code}): ${output}`));
      }
    });
  });
}

/**
 * Get status of Docker containers
 * @returns {Promise<Array<{name: string, status: string}>>}
 */
export async function getContainerStatus() {
  const dockerComposePath = getDockerComposePath();

  if (!fs.existsSync(dockerComposePath)) {
    return [];
  }

  const compose = getComposeCommand();
  const composeArgs = [...compose.args, '-f', dockerComposePath, 'ps', '--format', 'json'];

  return new Promise((resolve) => {
    const child = spawn(compose.cmd, composeArgs, {
      stdio: 'pipe'
    });

    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        try {
          // Parse JSON lines (one per container)
          const lines = output.trim().split('\n').filter(l => l);
          const containers = lines.map(line => {
            const data = JSON.parse(line);
            return {
              name: data.Name || data.Service,
              status: data.State || data.Status
            };
          });
          resolve(containers);
        } catch (error) {
          resolve([]);
        }
      } else {
        resolve([]);
      }
    });
  });
}
