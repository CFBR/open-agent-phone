/**
 * Build the argument list for the Claude Code CLI.
 *
 * `--dangerously-skip-permissions` is opt-in so a headless server does not
 * silently grant every permission request.
 */

function buildClaudeArgs({
  fullPrompt,
  callId,
  model,
  allowDangerous = false,
  hasSession = false,
}) {
  const args = [];
  if (allowDangerous) args.push('--dangerously-skip-permissions');
  args.push('-p', fullPrompt, '--model', model);

  if (callId) {
    args.push(hasSession ? '--resume' : '--session-id', callId);
  }

  return args;
}

module.exports = { buildClaudeArgs };
