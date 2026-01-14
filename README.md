# Claude Phone

Voice interface for Claude Code via SIP/3CX. Call your AI, and your AI can call you.

## What is this?

Claude Phone gives your Claude Code installation a phone number. You can:

- **Inbound**: Call an extension and talk to Claude - run commands, check status, ask questions
- **Outbound**: Your server can call YOU with alerts, then have a conversation about what to do

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Your Phone                                                  │
│      │                                                       │
│      ↓ Call extension 9000                                  │
│  ┌─────────────┐                                            │
│  │     3CX     │  ← PBX routes the call                    │
│  └──────┬──────┘                                            │
│         │                                                    │
│         ↓                                                    │
│  ┌─────────────┐    ┌─────────────┐                        │
│  │  voice-app  │ ←→ │ Claude API  │                        │
│  │  (Docker)   │    │  (Mac/PC)   │                        │
│  └─────────────┘    └─────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

**Components:**
- `voice-app/` - Docker container with drachtio + FreeSWITCH + Node.js orchestrator
- `claude-api-server/` - HTTP wrapper for Claude Code CLI (runs on your Mac/PC with Claude Max)

## Requirements

- 3CX phone system (free tier works!)
- Docker host for voice-app
- Mac or PC with Claude Code CLI installed (uses Claude Max subscription)
- ElevenLabs API key (for TTS)
- OpenAI API key (for Whisper STT)

## Quick Start

### One-Line Install (Recommended)

```bash
curl -sSL https://raw.githubusercontent.com/networkchuck/claude-phone/main/install.sh | bash
```

Then run:

```bash
claude-phone setup    # Interactive configuration wizard
claude-phone start    # Launch all services
```

### Raspberry Pi + Mac Setup

For Raspberry Pi deployments (recommended for most users):

1. **On Pi:** Run `claude-phone setup` - it auto-detects Pi and asks for:
   - 3CX FQDN (e.g., `mycompany.3cx.us`)
   - API keys (ElevenLabs, OpenAI)
   - Device config (extension, voice, prompt)
   - Mac IP address

2. **On Mac:** Run `claude-phone api-server` to start the Claude wrapper

3. **On Pi:** Run `claude-phone start` to launch voice services

### Manual Setup (Advanced)

<details>
<summary>Click to expand manual setup instructions</summary>

#### 1. Clone the repo

```bash
git clone https://github.com/theNetworkChuck/claude-phone.git
cd claude-phone
```

#### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your values
```

#### 3. Configure devices

```bash
cp voice-app/config/devices.json.example voice-app/config/devices.json
# Edit devices.json with your 3CX extensions and ElevenLabs voices
```

#### 4. Start the Claude API server

On your Mac with Claude Code:

```bash
cd claude-api-server
npm install
node server.js
```

#### 5. Start voice-app

On your Docker host:

```bash
docker compose up -d
```

#### 6. Configure 3CX

1. Create extensions for each device (e.g., 9000, 9002)
2. Note the Auth ID and password for each extension
3. Add them to your `devices.json`

</details>

## API Endpoints

### Voice App (port 3000)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/outbound-call` | Initiate an outbound call |
| GET | `/api/call/:callId` | Get call status |
| GET | `/api/calls` | List active calls |
| POST | `/api/query` | Query a device programmatically |
| GET | `/api/devices` | List configured devices |

### Outbound Call Example

```bash
curl -X POST http://localhost:3000/api/outbound-call \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+15551234567",
    "message": "Alert: Server storage is at 90%",
    "mode": "conversation",
    "device": "Cephanie"
  }'
```

## Device Personalities

Each extension can have its own identity (name, voice, personality prompt). This lets you create specialized AI assistants:

- **Morpheus** (ext 9000) - General assistant
- **Cephanie** (ext 9002) - Storage monitoring bot
- **etc.**

Configure in `voice-app/config/devices.json`.

## License

MIT
