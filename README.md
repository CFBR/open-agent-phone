<p align="center">
  <img src="assets/logo.png" alt="Open Agent Phone" width="200">
</p>

# Open Agent Phone

> Voice interface for any AI agent via SIP/3CX. Model-agnostic, open-source, and free to run.

A fork of [Claude Phone](https://github.com/theNetworkChuck/claude-phone) focused on replacing proprietary, billed services with open-source, self-hosted alternatives — while keeping the ability to use cloud services when you want.

**Call your AI — and your AI can call you.**

## What is this?

Open Agent Phone gives your AI a phone number. You can:

- **Inbound**: Call an extension and talk to your agent — run commands, check status, ask questions
- **Outbound**: Your server can call YOU with alerts, then have a conversation about what to do

### Fork Philosophy

This fork modifies Claude Phone to be **provider-agnostic, open-source first, and free to operate**:

| Component | Original | This Fork |
|-----------|----------|-----------|
| **Speech-to-Text** | OpenAI Whisper API (billed) | OpenRouter (bring your own key, or use free tiers) |
| **Text-to-Speech** | ElevenLabs only (billed) | **Two providers**: ElevenLabs _or_ local Kokoro-82M (free, open-source, runs on CPU) |
| **AI Backend** | Claude Code CLI only | Any AI accessible via API — [extensible](docs/API-QUERY-CONTRACT.md) |

The goal isn't to eliminate cloud services — it's to **never need them**. The system falls back to local, free, open-source models when you want no billing dependencies. Bring your own API keys when you want premium quality.

## Prerequisites

| Requirement | Where to Get It | Notes |
|-------------|-----------------|-------|
| **3CX Cloud Account** | [3cx.com](https://www.3cx.com/) | Free tier works |
| **OpenRouter API Key** | [openrouter.ai](https://openrouter.ai/) | For Whisper speech-to-text — or any OpenAI-compatible STT endpoint |
| **ElevenLabs API Key** (optional) | [elevenlabs.io](https://elevenlabs.io/) | For cloud TTS — not needed if using local Kokoro |
| **Claude Code CLI** (optional) | [claude.ai/code](https://claude.ai/code) | Default AI backend — can be swapped for any HTTP API |

## Platform Support

| Platform | Status |
|----------|--------|
| **Linux** | Fully supported (including Raspberry Pi) |
| **macOS** | Fully supported |
| **Windows** | Not supported (may work with WSL) |

## Quick Start

### 1. Install

```bash
curl -sSL https://raw.githubusercontent.com/CFBR/open-agent--phone/main/install.sh | bash
```

The installer will:
- Check for Node.js 18+, Docker, and git (offers to install if missing)
- Clone the repository
- Install dependencies
- Create the `claude-phone` command

### 2. Setup

```bash
claude-phone setup
```

The setup wizard asks what you're installing:

| Type | Use Case | What It Configures |
|------|----------|-------------------|
| **Voice Server** | Pi or dedicated voice box | Docker containers, connects to remote API server |
| **API Server** | Machine with your AI backend | Just the Claude API wrapper |
| **Both** | All-in-one single machine | Everything on one box |

### 3. Start

```bash
claude-phone start
```

## Deployment Modes

### All-in-One (Single Machine)

Best for: A Linux server or Mac that's always on and has your AI backend installed.

```
┌─────────────────────────────────────────────────────────────┐
│  Your Phone                                                  │
│      │                                                       │
│      ↓ Call extension 9000                                  │
│  ┌─────────────┐                                            │
│  │     3CX     │  ← Cloud PBX                               │
│  └──────┬──────┘                                            │
│         │                                                    │
│         ↓                                                    │
│  ┌─────────────────────────────────────────────┐           │
│  │     Single Server (Linux/Mac)                │           │
│  │  ┌──────────────────────────────────┐      │           │
│  │  │  Docker                           │      │           │
│  │  │  ┌───────────┐ ┌─────────────┐  │      │           │
│  │  │  │ voice-app │ │ kokoro-tts  │  │      │           │
│  │  │  │ (Node.js) │ │ (local TTS) │  │      │           │
│  │  │  └─────┬─────┘ └─────────────┘  │      │           │
│  │  │        │                         │      │           │
│  │  │  ┌─────┴─────┐ ┌─────────────┐  │      │           │
│  │  │  │ drachtio  │ │ freeswitch  │  │      │           │
│  │  │  │ (SIP)     │ │ (RTP/media) │  │      │           │
│  │  │  └───────────┘ └─────────────┘  │      │           │
│  │  └──────────────────────────────────┘      │           │
│  │                                            │           │
│  │  ┌──────────────────────┐                  │           │
│  │  │ claude-api-server    │  ← AI backend    │           │
│  │  │ (Claude / OpenRouter │                  │           │
│  │  │  / local LLM API)   │                  │           │
│  │  └──────────────────────┘                  │           │
│  └─────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

**Setup:**
```bash
claude-phone setup    # Select "Both"
claude-phone start    # Launches Docker + API server
```

### Split Mode (Voice Server + API Server)

Best for: Dedicated voice box (or VM), AI backend running elsewhere.

```
┌─────────────────────────────────────────────────────────────┐
│  Your Phone                                                  │
│      │                                                       │
│      ↓ Call extension 9000                                  │
│  ┌─────────────┐                                            │
│  │     3CX     │  ← Cloud PBX                               │
│  └──────┬──────┘                                            │
│         │                                                    │
│         ↓                                                    │
│  ┌─────────────┐         ┌─────────────────────┐           │
│  │ Voice Box   │   ←→   │ AI Backend Machine  │           │
│  │ (Docker)    │  HTTP   │                     │           │
│  │ voice-app   │         │ claude-api-server   │           │
│  │ drachtio    │         │ or any LLM API      │           │
│  │ freeswitch  │         │                     │           │
│  │ kokoro-tts  │         │                     │           │
│  └─────────────┘         └─────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

**On the voice box:**
```bash
claude-phone setup    # Select "Voice Server", enter API server IP
claude-phone start    # Launches Docker containers
```

**On the AI backend machine:**
```bash
claude-phone api-server    # Starts API wrapper on port 3333
```

**Note:** The AI backend doesn't need `claude-phone setup` — `api-server` works standalone.

## TTS Providers

Two text-to-speech engines are available, controlled by the `TTS_PROVIDER` env var:

### ElevenLabs (default — cloud, premium quality)

| Setting | Value |
|---------|-------|
| `TTS_PROVIDER` | `elevenlabs` |
| Required | `ELEVENLABS_API_KEY` |
| Quality | Highest naturalness |
| Cost | Per-character billing |
| Latency | ~300-500ms |

### Kokoro-82M (local — free, open-source, runs on CPU)

| Setting | Value |
|---------|-------|
| `TTS_PROVIDER` | `kokoro` |
| Required | `KOKORO_TTS_URL` (default: `http://127.0.0.1:8880`) |
| License | Apache 2.0 |
| Quality | #2 in TTS Arena — close to ElevenLabs |
| Cost | **$0** — runs on your hardware |
| RAM | ~2-3GB on CPU (Docker container) |
| Latency | ~1-3s on CPU |
| Voices | 16 presets across US/UK English, male/female |

**To switch, either:**
- Set `TTS_PROVIDER=kokoro` in your `.env`
- Uncomment the `kokoro-tts` service in your `docker-compose.yml`

Kokoro uses the OpenAI-compatible `/v1/audio/speech` endpoint — the same format any OpenAI-compatible TTS service would use.

## Speech-to-Text

STT uses OpenRouter's OpenAI-compatible endpoint instead of direct OpenAI:

| Setting | Value |
|---------|-------|
| Env var | `OPENROUTER_API_KEY` |
| Endpoint | `https://openrouter.ai/api/v1` |
| Model | `openai/whisper-1` |
| Why | Model-agnostic, bring-your-own-key, no direct OpenAI dependency |

The `openai` npm SDK is reused with `baseURL` pointed at OpenRouter — no new dependencies, and you can point it at any OpenAI-compatible STT endpoint.

## AI Backend

The `claude-api-server` wraps any AI backend accessible via HTTP. By default it spawns Claude Code CLI (`claude -p`), but the query contract is fully swappable:

- **Claude Code CLI** (default) — spawns `claude` with session management
- **Any OpenAI-compatible API** — replace `server.js` logic to call your endpoint
- **Local LLM** (Ollama, vLLM, etc.) — configure via `CLAUDE_API_URL`

See the [API Query Contract](voice-app/API-QUERY-CONTRACT.md) for the protocol between voice-app and the AI backend.

## Fully Dockerized Deployment

All components **except the 3CX SBC** can run in Docker containers on a single machine — no Raspberry Pi required. The system runs on any Linux server with Docker.

| Component | Docker? | Image |
|-----------|---------|-------|
| **voice-app** | ✓ | `voice-app/Dockerfile` (built locally) |
| **drachtio** | ✓ | `drachtio/drachtio-server` |
| **freeswitch** | ✓ | `drachtio/drachtio-freeswitch-mrf` |
| **kokoro-tts** | ✓ | `ghcr.io/remsky/kokoro-fastapi-cpu` |
| **claude-api-server** | ⚠️ Needs Dockerfile | Requires Claude CLI in container |
| **3CX SBC** | ⚠️ Community images | Needs official 3CX support or manual setup |

### claude-api-server in Docker

The API server can be containerized by building an image that includes:
- Node.js 20+
- Claude Code CLI (`npm install -g @anthropic-ai/claude`)
- The `claude-api-server/` code

A `Dockerfile` for this would:
```dockerfile
FROM node:20-slim
RUN npm install -g @anthropic-ai/claude
COPY . /app
WORKDIR /app
EXPOSE 3333
CMD ["node", "server.js"]
```

The container needs the host's `~/.claude/` mounted for authentication, and the `claude` binary in PATH.

### 3CX SBC in Docker

The 3CX SBC is a closed-source Debian package. 3CX does not officially provide a Docker image. Community solutions exist but are unsupported. For a fully containerized setup, consider:

- Running the SBC natively on the host (lightweight, no Docker needed)
- Using a community Docker image for the SBC
- Using [3CX's Linux SBC](https://www.3cx.com/docs/session-border-controller-linux/) directly on a low-resource VM or LXC container

## CLI Commands

| Command | Description |
|---------|-------------|
| `claude-phone setup` | Interactive configuration wizard |
| `claude-phone start` | Start services based on installation type |
| `claude-phone stop` | Stop all services |
| `claude-phone status` | Show service status |
| `claude-phone doctor` | Health check for dependencies and services |
| `claude-phone api-server [--port N]` | Start API server standalone (default: 3333) |
| `claude-phone device add` | Add a new device/extension |
| `claude-phone device list` | List configured devices |
| `claude-phone device remove <name>` | Remove a device |
| `claude-phone logs [service]` | Tail logs (voice-app, drachtio, freeswitch) |
| `claude-phone config show` | Display configuration (secrets redacted) |
| `claude-phone config path` | Show config file location |
| `claude-phone config reset` | Reset configuration |
| `claude-phone backup` | Create configuration backup |
| `claude-phone restore` | Restore from backup |
| `claude-phone update` | Update |
| `claude-phone uninstall` | Complete removal |

## Device Personalities

Each SIP extension can have its own identity with a unique name, voice, and personality prompt:

```bash
claude-phone device add
```

Example devices:
- **Morpheus** (ext 9000) — General assistant
- **Cephanie** (ext 9002) — Storage monitoring bot

## API Endpoints

The voice-app exposes these endpoints on port 3000:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/outbound-call` | Initiate an outbound call |
| GET | `/api/call/:callId` | Get call status |
| GET | `/api/calls` | List active calls |
| POST | `/api/query` | Query a device programmatically |
| GET | `/api/devices` | List configured devices |

See [Outbound API Reference](voice-app/README-OUTBOUND.md) for details.

## Troubleshooting

### Quick Diagnostics

```bash
claude-phone doctor    # Automated health checks
claude-phone status    # Service status
claude-phone logs      # View logs
```

### Common Issues

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| Calls connect but no audio | Wrong external IP | Re-run `claude-phone setup`, verify LAN IP |
| Extension not registering | 3CX SBC not running | Check 3CX admin panel |
| "Sorry, something went wrong" | API server unreachable | Check `claude-phone status` |
| Port conflict on startup | 3CX SBC using port 5060 | Setup auto-detects this; re-run setup |
| TTS fails with "Kokoro not running" | Kokoro container not started | Uncomment `kokoro-tts` in docker-compose.yml |

See [Troubleshooting Guide](docs/TROUBLESHOOTING.md) for more.

## Configuration

Stored in `~/.claude-phone/config.json` (chmod 600).

```bash
claude-phone config show    # View config (secrets redacted)
claude-phone config path    # Show file location
```

## Development

```bash
# Run tests
npm test

# Lint
npm run lint
npm run lint:fix
```

## Documentation

- [CLI Reference](cli/README.md) — Detailed CLI documentation
- [Troubleshooting](docs/TROUBLESHOOTING.md) — Common issues and solutions
- [Outbound API](voice-app/README-OUTBOUND.md) — Outbound calling API reference
- [Deployment](voice-app/DEPLOYMENT.md) — Production deployment guide
- [API Query Contract](voice-app/API-QUERY-CONTRACT.md) — Protocol between voice-app and AI backend
- [Claude Code Skill](docs/CLAUDE-CODE-SKILL.md) — Build a "call me" skill

## License

MIT
