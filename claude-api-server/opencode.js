/**
 * OpenCode CLI backend helpers.
 *
 * The API server spawns `opencode run` and reads JSONL events from stdout.
 * Sessions are created or continued with a `ses_` prefixed call ID.
 */

function sessionIdForCall(callId) {
  if (!callId) return null;
  const safe = String(callId).replace(/[^a-zA-Z0-9_-]/g, '');
  return `ses_${safe || 'voice'}`;
}

/**
 * Build the argument list for `opencode run`.
 * @param {Object} options
 * @param {string} options.model
 * @param {string} [options.sessionId]
 * @param {boolean} [options.autoApprove=false]
 * @returns {string[]}
 */
function buildOpenCodeArgs({ model, sessionId, autoApprove = false }) {
  if (!model) throw new Error('OPENCODE_MODEL or AI_MODEL is required');

  const args = ['run', '--standalone', '--format', 'json', '--model', model];
  if (sessionId) args.push('--session', sessionId);
  if (autoApprove) args.push('--auto');
  return args;
}

/**
 * Parse JSONL output from `opencode run --format json`.
 * @param {string} stdout
 * @returns {{response: string, sessionId: string|null}}
 */
function parseOpenCodeStdout(stdout) {
  let response = '';
  let sessionId = null;

  for (const line of String(stdout || '').split('\n')) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.sessionID) sessionId = event.sessionID;
      if (event.type === 'text' && event.part && typeof event.part.text === 'string') {
        response += event.part.text;
      }
    } catch {
      // Ignore non-JSON lines from the CLI.
    }
  }

  return { response: response.trim(), sessionId };
}

module.exports = {
  sessionIdForCall,
  buildOpenCodeArgs,
  parseOpenCodeStdout,
};
