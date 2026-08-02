# provider-abstraction-completion - Work Plan

## TL;DR (For humans)

**What you'll get:** The Open Agent Phone setup wizard now lets users pick their preferred AI backend (local Ollama, cloud OpenAI/OpenRouter, custom API, or Claude Code CLI), TTS engine (local Kokoro or cloud ElevenLabs), and STT engine (cloud Whisper via OpenRouter, local faster-whisper, or custom endpoint) — and the Docker setup automatically includes only the relevant services without manual commenting/uncommenting.

**Why this approach:** The LLM and TTS abstraction layers already exist in the code (server.js and tts-service.js). This plan finishes the job by making the configuration layer (config schema, setup wizard, Docker/env generation) aware of those options, and extends the one remaining gap — STT is currently hardcoded to OpenRouter only. No existing runtime interfaces change.

**What it will NOT do:** It will not add multiple simultaneous STT providers per call, will not add a web/GUI configurator, will not auto-failover between providers, and will not migrate existing config files (users re-run setup). It won't break the voice-app conversation loop, claude-bridge, or claude-api-server core logic.

**Effort:** Medium
**Risk:** Low - the abstractions already exist; this is wiring + one new STT branch
**Decisions to sanity-check:** (1) Default TTS = Kokoro, (2) Default AI backend = Ollama, (3) Local STT = faster-whisper Docker, (4) Validate by default in setup, (5) Separate voiceId fields per TTS provider

Your next move: Run `$start-work provider-abstraction-completion` to begin implementation. Full execution detail follows below.

---

> TL;DR (machine): Medium effort, Low risk, 11 todos + 4 final-verification — wiring 3 provider categories through config, setup wizard, Docker, and .env, plus STT abstraction with faster-whisper.

## Scope
### Must have
- Config schema (`cli/lib/config.js`) extended with `ttsProvider`, `aiBackend`, `ollamaUrl`, `ollamaModel`, `sttProvider`, `kokoroUrl`, and per-provider voice ID fields
- Setup wizard (`cli/lib/commands/setup.js`) prompts for TTS provider, AI backend, and STT provider with conditional key/url prompts
- Setup wizard validates provider connectivity when selected (Ollama health, Kokoro speech endpoint, OpenAI-compatible API health)
- Docker compose generation (`cli/lib/docker.js`) conditionally includes `kokoro-tts` service based on `config.ttsProvider === 'kokoro'`
- Docker compose generation conditionally includes `faster-whisper` service when `config.sttProvider === 'local'`
- `.env` generation writes `AI_BACKEND`, `OLLAMA_URL`, `OLLAMA_MODEL`, `STT_PROVIDER`, `KOKORO_TTS_URL` based on config
- STT client (`voice-app/lib/whisper-client.js`) abstract `STT_PROVIDER` to support `openrouter` (existing), `local` (faster-whisper `/v1/audio/transcriptions`), and `custom` (user-provided OpenAI-compatible URL)
- Device config (`voice-app/config/devices.json` and config.json) uses provider-specific voice IDs (`elevenlabsVoiceId`, `kokoroVoiceId`)
- All existing tests pass (`npm test`)

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Breaking changes to `voice-app/lib/conversation-loop.js` or `claude-bridge.js` interfaces
- New npm dependencies in voice-app or claude-api-server beyond what faster-whisper requires (Docker image, no code deps)
- Multiple simultaneous STT providers per call (single provider per deployment)
- GUI/web UI for provider management (CLI-only)
- Automatic provider failover/fallback chains (explicit config only)
- Migration of existing configs — users re-run `./claude-phone setup`
- Changing the voice-app Dockerfile or image build process
- Changing the claude-api-server server.js AI backend routing logic (already correct)

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after + eslint + manual integration verification
- Framework: existing project structure — `npm test` runs `npm run test:cli` and `npm run test:voice-app`; lint via `npm run lint`
- Evidence: `.omo/evidence/task-<N>-provider-abstraction-completion.<ext>` — each todo task captures its evidence file with command output and assertions
- Integration verification: `node claude-api-server/server.js` starts without error; `docker compose -f .env config` validates generated compose YAML; `claude-phone config show` reflects new fields

## Execution strategy
### Parallel execution waves

Wave 1 — Foundation (C1 + C5): Config schema extension + STT abstraction. These are independent and can run in parallel.
- Todo 1: Extend config.js default config
- Todo 2: Abstract STT in whisper-client.js

Wave 2 — Setup wizard + Validation (C2 + C6): Add provider selection prompts + validation logic.
- Todo 3: Add provider selection to setup wizard (TTS + AI backend + STT)
- Todo 4: Add provider validation to setup wizard

Wave 3 — Docker + .env generation (C3 + C4): Make Docker config conditional on provider choices.
- Todo 5: Conditional kokoro-tts in docker-compose generation
- Todo 6: Conditional faster-whisper in docker-compose generation
- Todo 7: Write provider env vars in .env generation

Wave 4 — Device + Voice ID handling (C6 edge case): Separate voiceId fields.
- Todo 8: Add provider-specific voiceId to device config

Wave 5 — Edge cases + integration (C6 bug fix): Handle empty devices array, write devices.json with provider-specific voice IDs.
- Todo 9: Handle empty devices array in setup and docker generation
- Todo 10: Update devices.json generation for provider-specific voice IDs

Wave 6 — Final cleanup + verification.
- Todo 11: Run full test suite + lint + integration smoke test

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 (config schema) | — | 3, 5, 7 | 2 |
| 2 (STT abstraction) | — | 6, 11 | 1 |
| 3 (setup wizard prompts) | 1 | 11 | 4 |
| 4 (setup validation) | 1 | 11 | 3 |
| 5 (kokoro in compose) | 1 | 11 | 6, 7 |
| 6 (faster-whisper in compose) | 1, 2 | 11 | 5, 7 |
| 7 (.env provider vars) | 1, 5, 6 | 11 | 5, 6 |
| 8 (per-provider voiceId) | 1 | 3, 9 | — |
| 9 (empty devices handling) | 1, 8 | 11 | — |
| 10 (devices.json update) | 8 | 11 | — |
| 11 (final tests) | all above | — | — |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE -->

- [x] 1. Extend config.js default config with provider fields
  What to do / Must NOT do: Add `ttsProvider`, `aiBackend`, `ollamaUrl`, `ollamaModel`, `sttProvider`, `kokoroUrl`, `elevenlabsVoiceId`, `kokoroVoiceId` to the `api` and `server` objects in `createDefaultConfig()`. Must NOT remove existing fields or change the config file format.
  Parallelization: Wave 1 | Blocked by: — | Blocks: 3, 5, 7
  References (executor has NO interview context - be exhaustive): `cli/lib/config.js:668-695` (createDefaultConfig), `cli/lib/docker.js:196-256` (env generation uses config), `cli/lib/commands/setup.js:702-830` (setup uses config), `.env.example:17-30,76-78` (existing provider docs)
  Acceptance criteria (agent-executable): `grep -n 'ttsProvider' cli/lib/config.js` finds the field; `grep -n 'aiBackend' cli/lib/config.js` finds the field; `grep -n 'sttProvider' cli/lib/config.js` finds the field; `grep -n 'kokoroVoiceId' cli/lib/config.js` finds the field
  QA scenarios: 
  - Happy: `node -e "const {getConfigPath} = require('./cli/lib/config.js'); console.log('ok')"` exits 0 (syntax check)
  - Failure: `node cli/test/config.test.js` passes (existing test must still pass with new fields)
  Evidence: `.omo/evidence/task-1-config-schema.js`

- [x] 2. Abstract STT in whisper-client.js to support multiple providers
  What to do / Must NOT do: Add `STT_PROVIDER` env var support (values: `openrouter` = existing behavior, `local` = calls `faster-whisper` Docker at `LOCAL_WHISPER_URL`, `custom` = calls `CUSTOM_STT_URL`). Must NOT change the default `transcribe()` function signature exported from the module. Must NOT change `isAvailable()` return contract.
  Parallelization: Wave 1 | Blocked by: — | Blocks: 6, 11
  References (executor has NO interview context - be exhaustive): `voice-app/lib/whisper-client.js:1-118` (full file — getOpenAIClient, transcribe, isAvailable), `.env.example:68-71` (STT env vars), `claude-api-server/server.js:340-348` (pattern for OpenAI-compatible calls), `voice-app/lib/conversation-loop.js:311` (calls whisperClient.transcribe)
  Acceptance criteria (agent-executable): `grep -n 'STT_PROVIDER' voice-app/lib/whisper-client.js` finds the var; `grep -n 'LOCAL_WHISPER_URL' voice-app/lib/whisper-client.js` finds the var; `grep -n 'CUSTOM_STT_URL' voice-app/lib/whisper-client.js` finds the var; `grep -n 'function transcribe' voice-app/lib/whisper-client.js` still exports `transcribe`
  QA scenarios:
  - Happy: `node -e "const w = require('/home/fire/working/open-agent--phone/voice-app/lib/whisper-client.js'); console.log(typeof w.transcribe, typeof w.isAvailable)"` prints "function function"
  - Failure: `grep -c 'openrouter' voice-app/lib/whisper-client.js` shows hardcoded references are still the default path
  Evidence: `.omo/evidence/task-2-stt-abstraction.js`

- [x] 3. Add provider selection prompts to setup wizard
  What to do / Must NOT do: In `setup.js`, before `setupAPIKeys()`, add prompts for TTS provider (ElevenLabs/Kokoro), AI backend (Ollama/OpenAI/OpenRouter/Custom/Claude), and STT provider (OpenRouter/Local Whisper/Custom). Route to relevant key/URL prompts based on choices. Defaults: TTS=kokoro, AI=ollama, STT=openrouter (preserving existing behavior). Must NOT require keys for local-only options (Kokoro, Ollama).
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 11
  References (executor has NO interview context - be exhaustive): `cli/lib/commands/setup.js:702-830` (setupAPIKeys), `cli/lib/commands/setup.js:296-445` (setup installation type flow), `.env.example:17-30,76-78` (provider options), `claude-api-server/server.js:122-143` (AI_BACKEND options)
  Acceptance criteria (agent-executable): `grep -n 'TTS_PROVIDER\|STT_PROVIDER\|AI_BACKEND\|ttsProvider\|sttProvider\|aiBackend' cli/lib/commands/setup.js` finds at least 5 matches; the `setupVoiceServer` function calls the new provider selection before `setupAPIKeys`
  QA scenarios:
  - Happy: `node --check cli/lib/commands/setup.js` exits 0 (syntax check)
  - Failure: `grep -c 'ElevenLabs API key' cli/lib/commands/setup.js` still present (backward compat)
  Evidence: `.omo/evidence/task-3-setup-prompts.js`

- [x] 4. Add provider connectivity validation to setup wizard
  What to do / Must NOT do: Add validation functions: `validateOllama(url)` (GET /api/tags or /api/version), `validateKokoro(url)` (POST /v1/audio/speech with minimal text), `validateOpenAICompat(url, key)` (GET /v1/models). Call these in `setupAPIKeys` or a new `setupProviderValidation` step when provider selected. Must NOT block setup if validation fails (warn + continue with skip option). Add `--skip-validation` CLI flag support.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 11
  References (executor has NO interview context - be exhaustive): `cli/lib/validators.js` (existing validateElevenLabsKey, validateOpenRouterKey), `cli/lib/commands/setup.js:28-26` (imports validators), `cli/lib/network.js` (checkClaudeApiServer pattern), `claude-api-server/server.js:711-717` (health endpoint pattern)
  Acceptance criteria (agent-executable): `grep -n 'validateOllama\|validateKokoro\|validateOpenAICompat' cli/lib/validators.js` finds these functions; `grep -n 'skip-validation\|skipValidation' cli/bin/cli-main.js` finds the flag
  QA scenarios:
  - Happy: `node --check cli/lib/validators.js && node --check cli/lib/commands/setup.js` exits 0
  - Failure: `grep -c 'validateElevenLabsKey' cli/lib/commands/setup.js` shows still used (backward compat)
  Evidence: `.omo/evidence/task-4-validation.js`

- [x] 5. Conditionally include kokoro-tts service in Docker compose generation
  What to do / Must NOT do: In `generateDockerCompose()` in `cli/lib/docker.js`, uncomment and conditionally include the `kokoro-tts` service block when `config.ttsProvider === 'kokoro'`. When not kokoro, the service is omitted (not commented — omitted). Must NOT change existing service configs (drachtio, freeswitch, voice-app).
  Parallelization: Wave 3 | Blocked by: 1 | Blocks: 7, 11
  References (executor has NO interview context - be exhaustive): `cli/lib/docker.js:157-166` (currently commented kokoro), `cli/lib/docker.js:88-166` (generateDockerCompose function), `docker-compose.yml:66-72` (reference kokoro service)
  Acceptance criteria (agent-executable): `grep -A5 'kokoro-tts' cli/lib/docker.js` shows conditional logic (if/ternary); when config.ttsProvider !== 'kokoro', generated compose does NOT contain 'kokoro-tts'
  QA scenarios:
  - Happy: Run `node -e "const {generateDockerCompose} = require('./cli/lib/docker.js'); const yaml = generateDockerCompose({...baseConfig, ttsProvider: 'kokoro'}); console.log(yaml.includes('kokoro-tts'))"` — prints true
  - Failure: Same test with `{ttsProvider: 'elevenlabs'}` prints false
  Evidence: `.omo/evidence/task-5-kokoro-docker.js`

- [x] 6. Conditionally include faster-whisper service in Docker compose generation
  What to do / Must NOT do: In `generateDockerCompose()` in `cli/lib/docker.js`, add a `faster-whisper` service block (image: `ghcr.io/siliconlabs/fastwhisper:latest` or similar CPU-friendly image, port 7000, OpenAI-compatible `/v1/audio/transcriptions`) when `config.sttProvider === 'local'`. Must NOT change existing service configs.
  Parallelization: Wave 3 | Blocked by: 1, 2 | Blocks: 7, 11
  References (executor has NO interview context - be exhaustive): `cli/lib/docker.js:157-166` (reference kokoro pattern), `docker-compose.yml:66-72` (service format reference), `.env.example:68-71` (STT config)
  Acceptance criteria (agent-executable): `grep -n 'faster-whisper\|fastwhisper' cli/lib/docker.js` finds the service; when config.sttProvider === 'local', generated compose contains 'faster-whisper'
  QA scenarios:
  - Happy: `node -e "const {generateDockerCompose} = require('./cli/lib/docker.js'); const yaml = generateDockerCompose({...baseConfig, sttProvider: 'local'}); console.log(yaml.includes('faster') || yaml.includes('whisper'))"` — prints true
  - Failure: Same test with `{sttProvider: 'openrouter'}` prints false
  Evidence: `.omo/evidence/task-6-whisper-docker.js`

- [x] 7. Write AI_BACKEND, OLLAMA_URL, STT_PROVIDER, KOKORO_TTS_URL to generated .env
  What to do / Must NOT do: In `generateEnvFile()` in `cli/lib/docker.js`, add `AI_BACKEND`, `OLLAMA_URL`, `OLLAMA_MODEL`, `STT_PROVIDER`, `KOKORO_TTS_URL`, `LOCAL_WHISPER_URL` lines based on config. Map `config.aiBackend` → `AI_BACKEND`, `config.ollamaUrl` → `OLLAMA_URL`, etc. Must NOT hardcode values; all must come from config.
  Parallelization: Wave 3 | Blocked by: 1, 5, 6 | Blocks: 11
  References (executor has NO interview context - be exhaustive): `cli/lib/docker.js:196-256` (generateEnvFile), `cli/lib/docker.js:196-243` (existing env generation), `.env.example:17-30,76-78` (env var names)
  Acceptance criteria (agent-executable): `grep -c 'AI_BACKEND\|OLLAMA_URL\|STT_PROVIDER\|KOKORO_TTS_URL\|LOCAL_WHISPER_URL' cli/lib/docker.js` is >= 5; generated env has these vars from config values
  QA scenarios:
  - Happy: `node -e "const {generateEnvFile} = require('./cli/lib/docker.js'); const env = generateEnvFile({...baseConfig, aiBackend:'ollama',...}); console.log(env.includes('AI_BACKEND=ollama') && env.includes('STT_PROVIDER'))"` — prints true
  - Failure: `grep -c 'TTS_PROVIDER=elevenlabs' cli/lib/docker.js` shows hardcoded value removed (replaced with config-based)
  Evidence: `.omo/evidence/task-7-env-vars.js`

- [x] 8. Add provider-specific voice ID fields to device config
  What to do / Must NOT do: In `cli/lib/config.js` `createDefaultConfig()`, replace single `voiceId` concept with `elevenlabsVoiceId` and `kokoroVoiceId` on the device object. In `setup.js`, prompt for the appropriate voice ID based on selected TTS provider. In `tts-service.js`, use `elevenlabsVoiceId` for ElevenLabs and `kokoroVoiceId` for Kokoro. Must NOT break existing ElevenLabs-only configs (backward compatible: if config has `voiceId` but not per-provider, use `voiceId` as fallback).
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 9, 10
  References (executor has NO interview context - be exhaustive): `cli/lib/config.js:696-699` (device spec in createDefaultConfig), `cli/lib/commands/setup.js:973-982` (voiceId prompt), `voice-app/lib/tts-service.js:24-29` (DEFAULT_VOICES), `voice-app/config/devices.json` (device config format), `cli/lib/docker.js:233-235` (ELEVENLABS_VOICE_ID in env)
  Acceptance criteria (agent-executable): `grep -n 'elevenlabsVoiceId\|kokoroVoiceId' cli/lib/config.js` finds both; `grep -n 'elevenlabsVoiceId\|kokoroVoiceId' cli/lib/commands/setup.js` finds provider-conditional prompts; `grep -n 'voiceId' voice-app/lib/tts-service.js` shows backward-compat fallback
  QA scenarios:
  - Happy: `node --check cli/lib/config.js && node --check cli/lib/commands/setup.js` exits 0
  - Failure: `grep -c 'elevenlabsVoiceId' voice-app/lib/tts-service.js` shows fallback logic for backward compat
  Evidence: `.omo/evidence/task-8-voice-id.js`

- [x] 9. Handle empty devices array in setup and docker generation
  What to do / Must NOT do: In `cli/lib/docker.js:226`, `config.devices[0]` is accessed without checking if array is non-empty. Add a guard: if `config.devices.length === 0`, skip device-specific env vars. In `setup.js`, the `setupDevice()` assumes `config.devices[0]` exists — add guard or ensure at least one device is always created during setup. Must NOT change the setup flow for existing configs with devices.
  Parallelization: Wave 2 | Blocked by: 1, 8 | Blocks: 11
  References (executor has NO interview context - be exhaustive): `cli/lib/docker.js:225-236` (accesses config.devices[0]), `cli/lib/commands/setup.js:918-1038` (setupDevice accesses config.devices[0]), `cli/lib/config.js:689` (devices: [] default)
  Acceptance criteria (agent-executable): `grep -n 'devices\[0\]' cli/lib/docker.js` is wrapped in length check; `grep -n 'config.devices.length === 0' cli/lib/docker.js` or similar guard exists
  QA scenarios:
  - Happy: `node -e "const {generateEnvFile} = require('./cli/lib/docker.js'); const env = generateEnvFile({devices:[], ...}); console.log(!env.includes('undefined'))"` — prints true
  - Failure: `node -e "const {generateDockerCompose} = require('./cli/lib/docker.js'); generateDockerCompose({devices:[], ...})"` — does not throw
  Evidence: `.omo/evidence/task-9-empty-devices.js`

- [x] 10. Update devices.json generation for provider-specific voice IDs
  What to do / Must NOT do: In `cli/lib/commands/start.js:152-157`, the devices.json is generated from `config.devices` with `device.voiceId` mapped. Change to write `elevenlabsVoiceId` and `kokoroVoiceId` if they exist. In `voice-app/lib/device-registry.js`, read the correct voice ID field based on `TTS_PROVIDER` env var. Must NOT remove `voiceId` support for backward compatibility.
  Parallelization: Wave 2 | Blocked by: 1, 8 | Blocks: 11
  References (executor has NO interview context - be exhaustive): `cli/lib/commands/start.js:152-157` (devices.json generation), `voice-app/lib/device-registry.js` (reads device config), `voice-app/config/devices.json` (format reference)
  Acceptance criteria (agent-executable): `grep -n 'elevenlabsVoiceId\|kokoroVoiceId' cli/lib/commands/start.js` finds field mapping; `grep -n 'TTS_PROVIDER\|ttsProvider' voice-app/lib/device-registry.js` finds provider-aware voice ID selection
  QA scenarios:
  - Happy: `node -e "const dr = require('voice-app/lib/device-registry.js'); console.log(typeof dr.getDevice)"` — prints "function"
  - Failure: `grep -c 'voiceId' cli/lib/commands/start.js` shows both new fields and backward-compat fallback
  Evidence: `.omo/evidence/task-10-devices-json.js`

- [x] 11. Run full test suite + lint + integration smoke test
  What to do / Must NOT do: Run `npm test`, `npm run lint`, and smoke-test `node claude-api-server/server.js` (starts and responds to /health on port 3333) and `docker compose -f .env config` (validates generated compose). Must NOT modify any tests to make them pass — fix code to satisfy tests.
  Parallelization: Wave 6 | Blocked by: all above | Blocks: —
  References (executor has NO interview context - be exhaustive): `package.json` (npm test/lint scripts), `cli/package.json` (cli test script), `voice-app/package.json` (voice-app test script), `claude-api-server/server.js:711-717` (health endpoint)
  Acceptance criteria (agent-executable): `npm test` exits 0 (all tests pass); `npm run lint` exits 0 (no lint errors); `node claude-api-server/server.js &` + `curl localhost:3333/health` returns `{"status":"ok"}`; `docker compose -f ~/.claude-phone/.env -f ~/.claude-phone/docker-compose.yml config` exits 0
  QA scenarios:
  - Happy: All three checks pass
  - Failure: If any test fails, the test file name + error message is captured in evidence
  Evidence: `.omo/evidence/task-11-final-tests.md`

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [x] F1. Plan compliance audit — verify every todo was completed with evidence files present; confirm config.js, whisper-client.js, setup.js, docker.js all have the expected additions; `.omo/evidence/` has files for tasks 1-11
- [x] F2. Code quality review — run `npm run lint` across all dirs, verify no new lint errors introduced, verify no hardcoded provider defaults remain where config-driven (grep for "elevenlabs" in docker.js, grep for "openrouter" in whisper-client.js as defaults)
- [x] F3. Real manual QA — Simulate setup flow: write a config object with provider fields, call `writeDockerConfig`, verify `.env` and `docker-compose.yml` generated correctly with conditional services; Start `claude-api-server` and verify it reads `AI_BACKEND=ollama` correctly
- [x] F4. Scope fidelity — verify no breaking changes: `conversation-loop.js` exports unchanged, `claude-bridge.js` exports unchanged, `claude-api-server/server.js` AI routing unchanged, `voice-app/package.json` dependencies unchanged

## Commit strategy
- Single branch: `feature/provider-abstraction-completion`
- Commit per wave (3-4 commits): Wave 1 (config + STT), Wave 2 (setup wizard), Wave 3 (Docker), Wave 4 (final tests)
- Each commit includes evidence file reference
- No squash — preserve wave structure for review

## Success criteria
1. `npm test` passes all existing tests (CLI + voice-app)
2. `npm run lint` passes with zero new errors
3. Setup wizard prompts for TTS provider, AI backend, and STT provider
4. Generated docker-compose.yml includes kokoro-tts only when `TTS_PROVIDER=kokoro`
5. Generated docker-compose.yml includes faster-whisper only when `STT_PROVIDER=local`
6. Generated .env includes AI_BACKEND, OLLAMA_URL, OLLAMA_MODEL, STT_PROVIDER, KOKORO_TTS_URL
7. whisper-client.js supports STT_PROVIDER=openrouter|local|custom without breaking existing calls
8. Config schema includes all new provider fields
9. Empty devices array doesn't crash setup or docker generation
10. Provider-specific voice IDs (elevenlabsVoiceId, kokoroVoiceId) are used with backward compat
