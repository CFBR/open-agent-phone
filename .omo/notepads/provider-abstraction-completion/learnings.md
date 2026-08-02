# Learnings — provider-abstraction-completion

Conventions, patterns, and successful approaches discovered during work on this plan.

_Auto-scaffolded by /start-work. Append new entries below - never overwrite._

---

- **Config schema lives in `cli/lib/commands/setup.js` `createDefaultConfig()`, NOT `cli/lib/config.js`** — `config.js` is a thin accessor module (get/set/read/write); all default fields and validation metadata are in the setup command. Plan references to `cli/lib/config.js:668-695` map to `setup.js` `createDefaultConfig()` (~line 680+).
- **ESLint globals:** Node built-ins not auto-recognized for CLI CommonJS files — had to add `URL: 'readonly'` to `eslint.config.js` CLI globals before `validateKokoro`/`validateOpenAICompat` (which use `new URL()`) would pass lint.
- **No subagents used** — all `task()`/herdr launches failed in this environment; every todo was executed manually by the orchestrator. Evidence files still written per plan convention.
- **Boulder continuation hook tracks plan-file checkboxes**, not the session todo list — all 15 todos were completed in-session but the plan `.md` checkboxes were never flipped to `- [x]`, so the hook kept reporting `0/15`. Lesson: flip `- [ ]` → `- [x]` in the plan file IMMEDIATELY as each task completes.
- **Empty devices guard:** `generateEnvFile()`/`generateDockerCompose()` in `cli/lib/docker.js` use conditional spread (`...(config.devices?.length ? {...} : {})`) so `devices: []` no longer throws.
- **STT abstraction pattern:** `whisper-client.js` dispatches on `STT_PROVIDER` (openrouter|local|custom) but preserves `transcribe()`/`isAvailable()` exports — conversation-loop.js callers untouched.
- **Voice ID backward compat:** `getVoiceIdForDevice()` in `device-registry.js` prefers `elevenlabsVoiceId`/`kokoroVoiceId` per `TTS_PROVIDER`, falls back to legacy `voiceId` — existing ElevenLabs-only configs keep working.
- **Verification:** `npm test` → 97 tests pass (96 CLI + 1 voice-app); `npx eslint .` → 0 errors, 64 pre-existing warnings only.


---
