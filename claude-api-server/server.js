/**
 * Claude HTTP API Server
 *
 * HTTP server that wraps Claude Code CLI with session management
 * Runs on the API server to handle voice interface queries
 *
 * Usage:
 *   node server.js
 *
 * Endpoints:
 *   POST /ask - Send a prompt to Claude (with optional callId for session)
 *   POST /end-session - Clean up session for a call
 *   GET /health - Health check
 */

const express = require('express');
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const {
  buildQueryContext,
  buildStructuredPrompt,
  tryParseJsonFromText,
  validateRequiredFields,
  buildRepairPrompt,
} = require('./structured');

const app = express();
const PORT = process.env.PORT || 3333;

/**
 * Build the full environment that Claude Code expects
 * This mimics what happens when you run `claude` in a terminal
 * with your zsh profile fully loaded.
 */
function buildClaudeEnvironment() {
  const HOME = process.env.HOME || '/Users/networkchuck';
  const PAI_DIR = path.join(HOME, '.claude');

  // Load ~/.claude/.env (all API keys)
  const envPath = path.join(PAI_DIR, '.env');
  const paiEnv = {};
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          paiEnv[key] = valueParts.join('=');
        }
      }
    }
  }

  // Build PATH like zsh profile does
  const fullPath = [
    '/opt/homebrew/bin',
    '/opt/homebrew/opt/python@3.12/bin',
    '/opt/homebrew/opt/libpq/bin',
    path.join(HOME, '.bun/bin'),
    path.join(HOME, '.local/bin'),
    path.join(HOME, '.pyenv/bin'),
    path.join(HOME, '.pyenv/shims'),
    path.join(HOME, 'go/bin'),
    '/usr/local/go/bin',
    path.join(HOME, 'bin'),
    path.join(HOME, '.lmstudio/bin'),
    path.join(HOME, '.opencode/bin'),
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ].join(':');

  const env = {
    ...process.env,
    ...paiEnv,
    PATH: fullPath,
    HOME,
    PAI_DIR,
    PAI_HOME: HOME,
    DA: 'Morpheus',
    DA_COLOR: 'purple',
    GOROOT: '/usr/local/go',
    GOPATH: path.join(HOME, 'go'),
    PYENV_ROOT: path.join(HOME, '.pyenv'),
    BUN_INSTALL: path.join(HOME, '.bun'),
    // CRITICAL: These tell Claude Code it's running in the proper environment
    CLAUDECODE: '1',
    CLAUDE_CODE_ENTRYPOINT: 'cli',
  };

  // CRITICAL: Remove ANTHROPIC_API_KEY so Claude CLI uses subscription auth
  // If ANTHROPIC_API_KEY is set (even to placeholder), CLI tries API auth instead
  delete env.ANTHROPIC_API_KEY;

  return env;
}

// Pre-build the environment once at startup
const claudeEnv = buildClaudeEnvironment();
console.log('[STARTUP] Loaded environment with', Object.keys(claudeEnv).length, 'variables');
console.log('[STARTUP] PATH includes:', claudeEnv.PATH.split(':').slice(0, 5).join(', '), '...');

// Log which API keys are available (without showing values)
const apiKeys = Object.keys(claudeEnv).filter(k =>
  k.includes('API_KEY') || k.includes('TOKEN') || k.includes('SECRET') || k === 'PAI_DIR'
);
console.log('[STARTUP] API keys loaded:', apiKeys.join(', '));

// Session storage: callId -> claudeSessionId
const sessions = new Map();

// Model selection - Sonnet for balanced speed/quality
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

// ============================================
// AI Backend Router Configuration
// ============================================
// Selects the AI provider at runtime.
//
//   ollama     — Local LLM via Ollama (default, free, runs in Docker)
//   openai     — OpenAI API (requires OPENAI_API_KEY)
//   openrouter — OpenRouter API (requires OPENROUTER_API_KEY)
//   custom     — Any OpenAI-compatible API at AI_BACKEND_URL
//   claude     — Claude Code CLI (original behavior, needs subscription)
//
const AI_BACKEND = (process.env.AI_BACKEND || 'ollama').toLowerCase();
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';
const AI_BACKEND_URL = process.env.AI_BACKEND_URL || '';

console.log(`[STARTUP] AI backend: ${AI_BACKEND}`);
if (AI_BACKEND === 'ollama') {
  console.log(`[STARTUP] Ollama URL: ${OLLAMA_URL}, model: ${OLLAMA_MODEL}`);
}

// Message history for non-Claude backends (maintains conversation context)
// Maps callId -> Array<{role, content}>
const chatHistories = new Map();

function parseClaudeStdout(stdout) {
  // Claude Code CLI may output JSONL; when it does, extract the `result` message.
  // Otherwise, fall back to raw stdout.
  let response = '';
  let sessionId = null;

  try {
    const lines = String(stdout || '').trim().split('\n');
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'result' && parsed.result) {
          response = parsed.result;
          sessionId = parsed.session_id;
        }
      } catch {
        // Not JSONL; ignore.
      }
    }

    if (!response) response = String(stdout || '').trim();
  } catch {
    response = String(stdout || '').trim();
  }

  return { response, sessionId };
}

/**
 * Query Claude Code CLI — spawns the `claude` process with the prompt.
 */
async function queryClaude({ fullPrompt, callId, timestamp }) {
  const startTime = Date.now();

  const args = [
    '--dangerously-skip-permissions',
    '-p', fullPrompt,
    '--model', CLAUDE_MODEL
  ];

  if (callId) {
    if (sessions.has(callId)) {
      args.push('--resume', callId);
      console.log(`[${timestamp}] Resuming session: ${callId}`);
    } else {
      args.push('--session-id', callId);
      sessions.set(callId, true);
      console.log(`[${timestamp}] Starting new session: ${callId}`);
    }
  }

  return new Promise((resolve) => {
    const claude = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      env: claudeEnv
    });

    let stdout = '';
    let stderr = '';

    claude.stdin.end();
    claude.stdout.on('data', (data) => { stdout += data.toString(); });
    claude.stderr.on('data', (data) => { stderr += data.toString(); });

    claude.on('error', (error) => {
      const duration_ms = Date.now() - startTime;
      resolve({ success: false, response: stderr, sessionId: null, duration_ms, error: error.message });
    });

    claude.on('close', (code) => {
      const duration_ms = Date.now() - startTime;
      if (code !== 0) {
        resolve({ success: false, response: stdout, sessionId: null, duration_ms, error: stderr || `Exit code ${code}` });
      } else {
        const { response, sessionId } = parseClaudeStdout(stdout);
        resolve({ success: true, response, sessionId, duration_ms });
      }
    });
  });
}

// ============================================
// HTTP helpers for OpenAI-compatible APIs
// ============================================

/**
 * Make an HTTP request and return parsed JSON.
 */
function httpRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const payload = body ? JSON.stringify(body) : null;

    const req = lib.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(options.headers || {}),
        },
        timeout: options.timeout || 120000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data), raw: data });
          } catch {
            resolve({ status: res.statusCode, data: null, raw: data });
          }
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });

    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Query any OpenAI-compatible chat completion API.
 */
async function queryOpenAI({ fullPrompt, callId, timestamp, baseURL, apiKey, model }) {
  const startTime = Date.now();

  // Build message history for conversation context
  let messages = [];
  if (callId && chatHistories.has(callId)) {
    messages = chatHistories.get(callId);
  }
  messages.push({ role: 'user', content: fullPrompt });

  const url = baseURL.replace(/\/+$/, '') + '/v1/chat/completions';
  const body = {
    model: model || process.env.AI_MODEL || 'gpt-4o-mini',
    messages,
    stream: false,
  };

  try {
    const response = await httpRequest(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: 120000,
    });

    const duration_ms = Date.now() - startTime;

    if (response.status !== 200) {
      return {
        success: false,
        response: response.raw,
        sessionId: null,
        duration_ms,
        error: `API error ${response.status}: ${response.raw}`,
      };
    }

    const content = response.data?.choices?.[0]?.message?.content || '';

    // Store conversation history
    if (callId) {
      messages.push({ role: 'assistant', content });
      chatHistories.set(callId, messages);
    }

    return { success: true, response: content, sessionId: callId || null, duration_ms };
  } catch (error) {
    return {
      success: false,
      response: '',
      sessionId: null,
      duration_ms: Date.now() - startTime,
      error: error.message,
    };
  }
}

/**
 * Query local Ollama instance (OpenAI-compatible).
 */
async function queryOllama({ fullPrompt, callId, timestamp }) {
  return queryOpenAI({
    fullPrompt,
    callId,
    timestamp,
    baseURL: OLLAMA_URL,
    apiKey: 'ollama',  // Ollama accepts any key or none
    model: OLLAMA_MODEL,
  });
}

/**
 * Route a query to the configured AI backend.
 *
 * Returns { success, response, sessionId, duration_ms, error }
 *   - success: boolean
 *   - response: the AI response text (parsed)
 *   - sessionId: session identifier for multi-turn (Claude session or callId)
 *   - duration_ms: wall-clock time
 *   - error: error message on failure
 */
async function queryAI({ fullPrompt, callId, timestamp }) {
  switch (AI_BACKEND) {
    case 'ollama':
      return queryOllama({ fullPrompt, callId, timestamp });

    case 'openai':
      return queryOpenAI({
        fullPrompt,
        callId,
        timestamp,
        baseURL: 'https://api.openai.com/v1',
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      });

    case 'openrouter':
      return queryOpenAI({
        fullPrompt,
        callId,
        timestamp,
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY,
        model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
      });

    case 'custom':
      if (!AI_BACKEND_URL) {
        return {
          success: false,
          response: '',
          sessionId: null,
          duration_ms: 0,
          error: 'AI_BACKEND_URL not set but AI_BACKEND=custom',
        };
      }
      return queryOpenAI({
        fullPrompt,
        callId,
        timestamp,
        baseURL: AI_BACKEND_URL,
        apiKey: process.env.AI_API_KEY || '',
        model: process.env.AI_MODEL,
      });

    case 'claude':
      return queryClaude({ fullPrompt, callId, timestamp });

    default:
      return {
        success: false,
        response: '',
        sessionId: null,
        duration_ms: 0,
        error: `Unknown AI_BACKEND: ${AI_BACKEND}. Valid options: ollama, openai, openrouter, custom, claude`,
      };
  }
}

/**
 * Voice Context - Prepended to all voice queries
 *
 * This tells Claude how to handle voice-specific patterns:
 * - Output VOICE_RESPONSE for TTS (conversational, 40 words max)
 * - Output COMPLETED for status logging (12 words max)
 * - For Slack delivery requests: do the work, send to Slack, then acknowledge
 */
const VOICE_CONTEXT = `[VOICE CALL CONTEXT]
This query comes via voice call. You MUST include BOTH of these lines in your response:

🗣️ VOICE_RESPONSE: [Your conversational answer in 40 words or less. This is what gets spoken aloud via TTS. Be natural and helpful, like talking to a friend.]

🎯 COMPLETED: [Status summary in 12 words or less. This is for logging only.]

IMPORTANT: The VOICE_RESPONSE line is what the caller HEARS. Make it conversational and complete - don't just say "Done" or "Task completed". Actually answer their question or confirm what you did in a natural way.

SLACK DELIVERY: When the caller requests delivery to Slack (phrases like "send to Slack", "post to #channel", "message me when done"):
1. Do the requested work (research, generate content, analyze, etc.)
2. Send results to the specified Slack channel using the Slack skill
3. Include a VOICE_RESPONSE like: "Done! I sent the weather info to the 508 channel."

The caller may hang up while you're working (they'll hear hold music). That's fine - complete the work and send to Slack. They'll see it there.

Example query: "What's the weather in Royce City?"
Example response:
🗣️ VOICE_RESPONSE: It's 65 degrees and partly cloudy in Royce City right now. Great weather for being outside!
🎯 COMPLETED: Weather lookup for Royce City done.
[END VOICE CONTEXT]

`;

// Middleware
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

/**
 * POST /ask
 *
 * Request body:
 *   {
 *     "prompt": "What Docker containers are running?",
 *     "callId": "optional-call-uuid",
 *     "devicePrompt": "optional device-specific prompt"
 *   }
 *
 * Response:
 *   { "success": true, "response": "...", "duration_ms": 1234, "sessionId": "..." }
 *
 * Session Management:
 *   - If callId is provided and we have a stored session, uses --resume
 *   - First query for a callId captures the session_id for future turns
 *   - This maintains conversation context across multiple turns in a phone call
 *
 * Device Prompts:
 *   - If devicePrompt is provided, it's prepended before VOICE_CONTEXT
 *   - This allows each device (NAS, Proxmox, etc.) to have its own identity and skills
 */
app.post('/ask', async (req, res) => {
  const { prompt, callId, devicePrompt } = req.body;
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  if (!prompt) {
    return res.status(400).json({
      success: false,
      error: 'Missing prompt in request body'
    });
  }

  // Check if we have an existing session for this call
  const existingSession = callId ? sessions.get(callId) : null;

  console.log(`[${timestamp}] QUERY: "${prompt.substring(0, 100)}..."`);
  console.log(`[${timestamp}] MODEL: ${CLAUDE_MODEL}`);
  console.log(`[${timestamp}] SESSION: callId=${callId || 'none'}, existing=${existingSession || 'none'}`);
  console.log(`[${timestamp}] DEVICE PROMPT: ${devicePrompt ? 'Yes (' + devicePrompt.substring(0, 30) + '...)' : 'No'}`);

  try {
    /**
     * Prompt layering order:
     * 1. Device prompt (if provided) - identity and available skills
     * 2. VOICE_CONTEXT - general voice call instructions
     * 3. User's prompt - what they actually said
     */
    let fullPrompt = '';

    if (devicePrompt) {
      fullPrompt += `[DEVICE IDENTITY]\n${devicePrompt}\n[END DEVICE IDENTITY]\n\n`;
    }

    fullPrompt += VOICE_CONTEXT;
    fullPrompt += prompt;

    const result = await queryAI({ fullPrompt, callId, timestamp });

    if (!result.success) {
      console.error(`[${new Date().toISOString()}] ERROR: AI query failed: ${result.error}`);
      return res.json({ success: false, error: `AI query failed: ${result.error}`, duration_ms: result.duration_ms });
    }

    const { response, sessionId } = result;

    if (sessionId && callId && AI_BACKEND === 'claude') {
      sessions.set(callId, sessionId);
      console.log(`[${new Date().toISOString()}] SESSION STORED: ${callId} -> ${sessionId}`);
    }

    console.log(`[${new Date().toISOString()}] RESPONSE (${result.duration_ms}ms): "${response.substring(0, 100)}..."`);

    res.json({ success: true, response, sessionId, duration_ms: result.duration_ms });

  } catch (error) {
    const duration_ms = Date.now() - startTime;
    console.error(`[${timestamp}] ERROR:`, error.message);

    res.json({
      success: false,
      error: error.message,
      duration_ms
    });
  }
});

/**
 * POST /ask-structured
 *
 * Like /ask, but returns machine-validated JSON for n8n automations.
 *
 * Request body:
 *   {
 *     "prompt": "Check Ceph health",
 *     "callId": "optional-call-uuid",
 *     "devicePrompt": "optional device-specific prompt",
 *     "schema": {
 *        "queryType": "ceph_health",
 *        "requiredFields": ["cluster_status","ssd_usage_percent","recommendation"],
 *        "fieldGuidance": { "cluster_status": "Ceph overall health, e.g. HEALTH_OK/HEALTH_WARN/HEALTH_ERR" },
 *        "allowExtraFields": true,
 *        "example": { "cluster_status": "HEALTH_WARN", "ssd_usage_percent": 88, "recommendation": "alert" }
 *     },
 *     "includeVoiceContext": false,
 *     "maxRetries": 1
 *   }
 *
 * Response (success):
 *   { "success": true, "data": {...}, "raw_response": "...", "duration_ms": 1234 }
 */
app.post('/ask-structured', async (req, res) => {
  const {
    prompt,
    callId,
    devicePrompt,
    schema = {},
    includeVoiceContext = false,
    maxRetries = 1,
  } = req.body || {};

  const timestamp = new Date().toISOString();

  if (!prompt) {
    return res.status(400).json({ success: false, error: 'Missing prompt in request body' });
  }

  const queryContext = buildQueryContext({
    queryType: schema.queryType,
    requiredFields: schema.requiredFields,
    fieldGuidance: schema.fieldGuidance,
    allowExtraFields: schema.allowExtraFields !== false,
    example: schema.example,
  });

  let fullPrompt = buildStructuredPrompt({
    devicePrompt,
    queryContext: (includeVoiceContext ? VOICE_CONTEXT : '') + queryContext,
    userPrompt: prompt,
  });

  console.log(`[${timestamp}] STRUCTURED QUERY: "${String(prompt).substring(0, 100)}..."`);
  console.log(`[${timestamp}] MODEL: ${CLAUDE_MODEL}`);
  console.log(`[${timestamp}] SESSION: callId=${callId || 'none'}, existing=${callId ? (sessions.has(callId) ? 'yes' : 'no') : 'none'}`);

  try {
    let lastRaw = '';
    let lastError = 'Unknown error';
    let totalDuration = 0;
    const retries = Number.isFinite(Number(maxRetries)) ? Number(maxRetries) : 0;
    let attemptsMade = 0;

    for (let attempt = 0; attempt <= retries; attempt++) {
      attemptsMade = attempt + 1;
      const result = await queryAI({ fullPrompt, callId, timestamp });
      totalDuration += result.duration_ms;

      if (!result.success) {
        lastError = result.error || 'AI query failed';
        lastRaw = result.response || '';
        return res.status(502).json({
          success: false,
          error: lastError,
          raw_response: lastRaw,
          duration_ms: totalDuration,
          attempts: attemptsMade,
        });
      }

      const { response, sessionId } = result;
      lastRaw = response;

      if (sessionId && callId && AI_BACKEND === 'claude') sessions.set(callId, sessionId);

      const parsed = tryParseJsonFromText(response);
      if (!parsed.ok) {
        lastError = parsed.error || 'Failed to parse JSON';
      } else {
        const validation = validateRequiredFields(parsed.data, schema.requiredFields);
        if (validation.ok) {
          return res.json({
            success: true,
            data: parsed.data,
            json_text: parsed.jsonText,
            raw_response: response,
            duration_ms: totalDuration,
            attempts: attemptsMade,
          });
        }
        lastError = validation.error || 'Validation failed';
      }

      if (attempt >= retries) break;

      // Retry once with a repair prompt that forces "JSON only" formatting.
      const repairPrompt = buildRepairPrompt({
        queryType: schema.queryType,
        requiredFields: schema.requiredFields,
        fieldGuidance: schema.fieldGuidance,
        allowExtraFields: schema.allowExtraFields !== false,
        originalUserPrompt: prompt,
        invalidAssistantOutput: lastRaw,
        example: schema.example,
      });

      fullPrompt = buildStructuredPrompt({
        devicePrompt,
        queryContext: includeVoiceContext ? VOICE_CONTEXT : '',
        userPrompt: repairPrompt,
      });
    }

    return res.status(422).json({
      success: false,
      error: lastError,
      raw_response: lastRaw,
      duration_ms: totalDuration,
      attempts: attemptsMade,
    });
  } catch (error) {
    console.error(`[${timestamp}] ERROR:`, error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /end-session
 *
 * Clean up session when a call ends
 *
 * Request body:
 *   { "callId": "call-uuid" }
 */
app.post('/end-session', (req, res) => {
  const { callId } = req.body;
  const timestamp = new Date().toISOString();

  if (callId && sessions.has(callId)) {
    sessions.delete(callId);
    console.log(`[${timestamp}] SESSION ENDED: ${callId}`);
  }

  res.json({ success: true });
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'claude-api-server',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /
 * Info endpoint
 */
app.get('/', (req, res) => {
  res.json({
    service: 'Claude HTTP API Server',
    version: '1.0.0',
    endpoints: {
      'POST /ask': 'Send a prompt to Claude',
      'POST /ask-structured': 'Send a prompt and return validated JSON (n8n)',
      'GET /health': 'Health check'
    }
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(64));
  console.log('Claude HTTP API Server');
  console.log('='.repeat(64));
  console.log(`\nListening on: http://0.0.0.0:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log('\nReady to receive Claude queries from voice interface.\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  process.exit(0);
});
