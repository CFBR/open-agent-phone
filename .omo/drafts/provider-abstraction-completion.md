---
slug: provider-abstraction-completion
status: drafting
intent: clear
review_required: false
pending-action: write .omo/plans/provider-abstraction-completion.md
approach: Complete the provider abstraction layer across all four provider categories (LLM, TTS, STT, and config/Docker wiring) by implementing 6 independent components: (1) Config schema extension, (2) Setup wizard provider selection, (3) Docker/env generation conditional on provider, (4) TTS provider fully wired in Docker, (5) STT abstraction with local Whisper support, (6) AI backend selection in setup. Uses existing abstraction patterns; no breaking changes to voice-app or claude-api-server core logic.
---

# Draft: provider-abstraction-completion

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
| id | outcome (one line) | status | evidence path |
|----|-------------------|--------|---------------|
| C1 | Config schema extended with provider fields (ttsProvider, aiBackend, ollamaUrl, sttProvider, kokoroUrl) | active | cli/lib/config.js:668-695 |
| C2 | Setup wizard prompts for TTS provider (ElevenLabs vs Kokoro) and AI backend (Ollama/OpenAI/OpenRouter/Custom/Claude) | active | cli/lib/commands/setup.js:702-830, cli/lib/commands/setup.js:296-445 |
| C3 | Docker compose generation conditionally includes kokoro-tts service and writes correct TTS_PROVIDER env | active | cli/lib/docker.js:157-166, cli/lib/docker.js:240-243 |
| C4 | .env generation writes AI_BACKEND, OLLAMA_URL, OLLAMA_MODEL, STT_PROVIDER based on config | active | cli/lib/docker.js:196-256 |
| C5 | STT (whisper-client.js) abstracted to support local Whisper (whisper.cpp/faster-whisper) and custom OpenAI-compatible endpoints | active | voice-app/lib/whisper-client.js:1-118 |
| C6 | Setup wizard validates Ollama connectivity and Kokoro TTS availability when selected | active | cli/lib/commands/setup.js:158-166 |

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
| assumption | adopted default | rationale | reversible? |
|------------|----------------|-----------|-------------|
| Default TTS provider when user skips selection | Kokoro (local, free) | Aligns with fork philosophy "never need cloud services"; ElevenLabs remains opt-in | Yes - user can change in .env |
| Default AI backend when user skips selection | Ollama (local, free) | Matches existing AI_BACKEND=ollama default in .env.example:23 | Yes - user can change in .env |
| Default STT provider | OpenRouter/Whisper (existing) | Preserves current behavior; local Whisper is opt-in | Yes - user can change in .env |
| Kokoro TTS in docker-compose | Conditionally included only when TTS_PROVIDER=kokoro | Avoids pulling 2-3GB image for ElevenLabs users | Yes - user toggles via setup |
| Local Whisper implementation | faster-whisper via Docker (ghcr.io/xxx/faster-whisper) | CPU-friendly, actively maintained, OpenAI-compatible endpoint | Yes - swap image if needed |

## Findings (cited - path:lines)
| area | finding | citation |
|------|---------|----------|
| AI Backend abstraction | Already complete in claude-api-server/server.js:122-417 with 5 providers (ollama, openai, openrouter, custom, claude) via AI_BACKEND env var | server.js:133, 361-417 |
| TTS abstraction | Already complete in voice-app/lib/tts-service.js:13-199 with 2 providers (elevenlabs, kokoro) via TTS_PROVIDER env var | tts-service.js:13, 136-150 |
| STT abstraction | NOT abstracted - whisper-client.js hardcodes OpenRouter baseURL and model | whisper-client.js:22, 85-88 |
| Config schema | Only has elevenlabs + openrouter keys; missing ttsProvider, aiBackend, ollamaUrl, sttProvider, kokoroUrl | config.js:671-674 |
| Setup wizard | Only asks for ElevenLabs + OpenRouter keys; no provider selection prompts | setup.js:702-830 |
| Docker generation | Kokoro service commented out (lines 160-166); .env hardcodes TTS_PROVIDER=elevenlabs (line 241); no AI_BACKEND/OLLAMA vars | docker.js:157-166, 240-243 |
| .env.example | Documents all AI_BACKEND options + TTS_PROVIDER=kokoro default | .env.example:17-30, 76-77 |
| Device voiceId | Tied to ElevenLabs in setup; Kokoro uses different voice IDs (af_heart etc.) | setup.js:973-982, tts-service.js:229-246 |

## Decisions (with rationale)
| decision | rationale |
|----------|-----------|
| Extend config.js default config with provider fields | Single source of truth for all provider choices; enables conditional Docker generation |
| Add provider selection to setup.js before API key prompts | User chooses provider first, then only enters relevant keys; avoids "enter ElevenLabs key even if using Kokoro" friction |
| Conditionally generate kokoro-tts service in docker-compose.yml | Keeps docker-compose lean for ElevenLabs users; ~2-3GB savings |
| Write AI_BACKEND, OLLAMA_URL, OLLAMA_MODEL, STT_PROVIDER to .env | Makes all provider config visible and overrideable in one file |
| Abstract STT to support local Whisper via faster-whisper Docker image | fastest-whisper provides OpenAI-compatible /v1/audio/transcriptions; runs on CPU; Apache 2.0 |
| Validate Ollama/Kokoro connectivity in setup when selected | Fail fast with actionable errors instead of runtime failures |

## Scope IN
- Add provider fields to config.js default config (ttsProvider, aiBackend, ollamaUrl, ollamaModel, sttProvider, kokoroUrl)
- Setup wizard: TTS provider selection (ElevenLabs / Kokoro) with conditional key prompts
- Setup wizard: AI backend selection (Ollama / OpenAI / OpenRouter / Custom / Claude) with conditional config
- Setup wizard: STT provider selection (OpenRouter / Local Whisper / Custom) with conditional config
- Docker generation: conditional kokoro-tts service inclusion based on config.ttsProvider
- Docker generation: .env includes AI_BACKEND, OLLAMA_URL, OLLAMA_MODEL, STT_PROVIDER, KOKORO_TTS_URL
- STT abstraction: whisper-client.js supports STT_PROVIDER=openrouter|local|custom with local = faster-whisper Docker
- Setup validation: Ollama health check when aiBackend=ollama; Kokoro /v1/audio/speech probe when ttsProvider=kokoro
- Device voiceId handling: separate default voice IDs per TTS provider in config

## Scope OUT (Must NOT have)
- Breaking changes to voice-app/lib/conversation-loop.js or claude-bridge.js interfaces
- New dependencies in voice-app or claude-api-server beyond what providers need
- Multiple simultaneous STT providers per call (single provider per deployment)
- GUI/web UI for provider management (CLI-only)
- Automatic provider failover/fallback chains (explicit config only)
- Migration of existing configs - user re-runs setup

## Open questions
| # | question | why it forks the plan | options (recommended first) |
|---|----------|----------------------|----------------------------|
| Q1 | Should the default TTS provider be Kokoro (free/local) or ElevenLabs (cloud/premium)? | Determines default in setup, docker-compose, and .env; affects new-user onboarding | 1) Kokoro (free, open-source) 2) ElevenLabs (premium quality) |
| Q2 | Should the default AI backend be Ollama (local) or preserve current claude-api-server default? | Current default in server.js is 'ollama' but setup doesn't expose this; affects new installs | 1) Ollama (matches server.js:133) 2) Claude (original behavior) |
| Q3 | Should local STT use faster-whisper Docker or whisper.cpp binary? | Different Docker images, resource profiles, maintenance burden | 1) faster-whisper Docker (OpenAI-compatible API) 2) whisper.cpp (binary, no Docker) |
| Q4 | Should setup validate provider connectivity by default, or make it optional (--skip-validation)? | Validation adds setup time but prevents broken configs; network may be unavailable during setup | 1) Validate by default, --skip-validation flag 2) Skip by default, --validate flag |
| Q5 | Should device voiceId be provider-specific in config (elevenlabsVoiceId, kokoroVoiceId)? | Current config has single voiceId; ElevenLabs and Kokoro use different ID schemes | 1) Separate fields per provider 2) Single voiceId with provider-aware resolution |

## Approval gate
status: approved
<!-- User approved via "approve" message after brief presentation. -->
user-approved: 2026-08-02
answers: Q1=Kokoro(default), Q2=Ollama(default), Q3=faster-whisper Docker(default), Q4=Validate by default(default), Q5=Separate fields per provider(default)
plan-path: .omo/plans/provider-abstraction-completion.md
<!-- Plan file created via scaffold-plan.mjs --clear. Draft preserved as resume point. -->
