# Code Review — Recommendations & Fixes

Review of the `claude-phone` codebase (voice-app, claude-api-server, cli). Items are
grouped by category and ordered roughly by impact. Each item is being addressed
individually; see git history for the per-fix commits.

## Bugs

### 1. structured.js — escape-character handling breaks JSON extraction (VERIFIED)
`extractJsonCandidates` checks `ch === '\\\\'` (a two-character string) when it
should check `ch === '\\'` (a single backslash). Because `ch` is always one
character, the escape branch is never taken, so escaped quotes (`\"`) inside JSON
strings are treated as string terminators. This causes valid JSON to be missed
when a string value contains an escaped quote followed by a `}` or `[`/`]`.

Reproducer: `{"a":"x\"}","b":2}` is valid JSON, but `tryParseJsonFromText` returns
`{ ok: false }`.

### 2. `context` option is silently dropped in the conversation loop
`outbound-routes.js` passes `context` (structured background data for Claude) into
`runConversationLoop`, but `conversation-loop.js` only destructures `initialContext`
— `context` is ignored. The documented "structured data to Claude" feature for
outbound conversation mode is therefore broken.

### 3. multi-registrar `stop()` does not clear timers
`MultiRegistrar.stop()` clears the `registrations` map but leaves the scheduled
`setTimeout` refresh/retry timers running. On shutdown those timers fire against a
disconnected SRF and log errors. Timers should be tracked and cleared.

### 4. Unbounded session/history growth (memory leak) in claude-api-server
`sessions` (callId -> sessionId) and `chatHistories` (callId -> messages) Maps are
never garbage collected. `/end-session` only deletes from `sessions`, not
`chatHistories`, so non-Claude backends leak the full conversation history for
every call indefinitely.

### 5. TTS URL hardcoded to `127.0.0.1:3000`, ignores `HTTP_PORT`
`tts-service.generateSpeech` returns `http://127.0.0.1:3000/audio-files/...`
regardless of the configured `HTTP_PORT`. If `HTTP_PORT` is changed, FreeSWITCH
cannot fetch TTS audio. Should derive from config.

## Code Smells / Duplication

### 6. Dead code: `voice-app/lib/registrar.js`
The old single-extension `Registrar` class is not imported anywhere (replaced by
`multi-registrar.js`). Remove it.

### 7. `extractVoiceLine` (+ helpers) duplicated in 3 places
`extractVoiceLine`, `isGoodbye`, `getRandomThinkingPhrase`, `THINKING_PHRASES`,
and the audio-cue URL constants are copy-pasted across `conversation-loop.js`,
`sip-handler.js`, and `query-routes.js`. Centralize into a shared module.

### 8. Inbound path uses a duplicate, inferior conversation loop
`sip-handler.js` contains its own `conversationLoop` (no DTMF `#` support, no
`callActive` tracking, no `logger`, hardcoded `MAX_TURNS`) instead of using the
shared `runConversationLoop`. Inbound callers therefore lack features outbound
callers get. Refactor inbound to use the shared loop.

### 9. Triple audio-file cleanup
`cleanupOldFiles` is defined in both `http-server.js` and `tts-service.js`, and
three independent intervals run (index.js 60s/5min, http-server 120s/10min,
tts-service 30min/1hr). Consolidate to a single cleanup loop.

### 10. Process-level `unhandledRejection` handler in a library
`audio-fork.js` registers a process-wide `unhandledRejection` handler that
swallows ALL unhandled rejections app-wide, masking real bugs. The file comment
itself says "the actual fix is proper cleanup in conversation-loop.js". Remove it.

## Performance

### 11. TTS not cached
`generateFilename` includes `Date.now()`, so every call produces a unique file
even for identical text. Repeated phrases (greetings, thinking phrases, "I
didn't hear anything", etc.) are re-synthesized via ElevenLabs/Kokoro every time.
Cache by text+voice hash.

### 12. `pcmStats` computed multiple times per chunk
In `AudioForkSession._onMessage`, `pcmStats` is called for endian detection,
then again for periodic logging, then again for VAD. Compute once and reuse.

## Feature Gaps

### 13. No auth on voice-app API
`/api/outbound-call` (and friends) are unauthenticated — anyone on the network
can trigger outbound phone calls. Add an optional shared-secret token
(`VOICE_API_TOKEN`) middleware.

### 14. `/health` does not report backend/SIP readiness
The voice-app `/health` endpoint only returns static info. It should report
whether drachtio, FreeSWITCH, and the Claude API backend are connected.

### 15. No retry on transient TTS/STT failures
A single TTS or STT failure aborts the whole conversation turn. Add a small
retry with backoff for transient network errors.

## Cleanup

### 16. Lint: 14 unused-variable warnings
Clean up the unused vars/args flagged by eslint (rename to `_`-prefixed or
remove).

## Notes / Non-issues checked
- `.env` is gitignored and NOT tracked — no secret leak.
- Tests currently pass; lint has 0 errors / 0 warnings (all 16 warnings fixed).

## Bonus bug found during lint pass (#16)
`claude-api-server/server.js` `queryOpenAI` built a request `body` (the chat
completion payload) but never passed it to `httpRequest`, so every
OpenAI-compatible request (ollama / openai / openrouter / custom) sent an
**empty POST body** and would fail. Fixed by passing `body` as the 3rd arg.

## Status
All 17 items complete. Lint clean (0 warnings), 184 tests passing across all
suites (claude-api-server 96, voice-app 66, structured 22).
