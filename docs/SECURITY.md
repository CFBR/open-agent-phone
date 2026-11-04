# Security guide

This deployment handles phone calls, API keys, and optionally shell-capable AI agents. Treat the host and the AI backend as trusted infrastructure.

## Tokens

Set these values in `.env`:

| Variable | Protects |
|----------|----------|
| `VOICE_API_TOKEN` | `/api/*` and `/audio` on the voice app |
| `AI_API_TOKEN` | `/ask`, `/ask-structured`, `/end-session` on the AI backend |
| `METRICS_TOKEN` | `/metrics` on the voice app |
| `AUDIO_FORK_SECRET` | Audio fork WebSocket tokens, optional |

`AI_API_TOKEN` and `VOICE_API_TOKEN` are compared in constant time. The older `CLAUDE_API_TOKEN` name is still accepted as an alias.

The audio fork uses a short-lived HMAC token in the WebSocket URL. Leave `AUDIO_FORK_SECRET` blank to use a random per-process secret, or set it when you need the same secret across restarts.

## Network exposure

The AI backend binds to `127.0.0.1` by default. Set `AI_API_HOST=0.0.0.0` only when a remote voice server must connect, and set `AI_API_TOKEN` at the same time. The server logs a warning when it is exposed without auth.

Keep the voice app behind a firewall or reverse proxy. `VOICE_API_TOKEN` is optional for backward compatibility, so an unset token means anyone who can reach port 3000 can trigger calls and queries.

## Webhooks

Outbound call webhooks reject:

- non-HTTP and non-HTTPS schemes
- URLs with embedded credentials
- localhost and private IPv4 or IPv6 literals
- hostnames that resolve to private addresses

Set `ALLOW_PRIVATE_WEBHOOKS=1` only when you intentionally deliver webhooks to an internal service. This disables the private-address checks.

## Rate limits

`OUTBOUND_RATE_LIMIT` and `QUERY_RATE_LIMIT` are requests per minute. Buckets are keyed by a hash of the API token when one is present, otherwise by client IP. Rotating IPs does not reset a token bucket.

## Tool permissions

- `CLAUDE_DANGEROUS_PERMISSIONS=1` lets the Claude CLI skip permission prompts. The default is `0`. Enable it only on a trusted host with `AI_API_TOKEN` set.
- `OPENCODE_AUTO_APPROVE=1` passes `--auto` to OpenCode. The default is `0`. Enable it only for a trusted agent and workspace.
- OpenCode and Claude both run with the access of the API server process. Do not run the API server as root, and restrict its filesystem access.

## Secret rotation

If a token, SIP password, or provider key leaks:

1. Rotate it at the provider.
2. Update `~/.claude-phone/config.json` or `.env`.
3. Restart the affected services with `claude-phone stop` and `claude-phone start`.
4. Revoke old AI backend tokens and any OpenCode or Claude sessions that used them.

The repository previously shipped personal SIP defaults. They have been removed. If you used an older checkout, rotate any 3CX credentials that were present in `voice-app/lib/device-registry.js` or `voice-app/index.js`.
